'use strict';

const STAFF_ROLES = {
  OWNER: 'owner',
  GESTIONE: 'gestione',
  CAMERIERE: 'cameriere',
  CUCINA: 'cucina',
};

const DEFAULT_REGISTER_STAFF = [
  { role: STAFF_ROLES.CAMERIERE, label: 'Cameriere' },
  { role: STAFF_ROLES.CUCINA, label: 'Cucina' },
];

const KNOWN_ROLES = new Set(Object.values(STAFF_ROLES));

function normalizeStaffRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return KNOWN_ROLES.has(value) ? value : STAFF_ROLES.OWNER;
}

function staffError(message = 'Non autorizzato per questo reparto.') {
  const err = new Error(message);
  err._resCode = 'NOT_OWNER';
  return err;
}

async function resolveStaffContext(strapi, user) {
  if (!user || !user.id) return null;

  const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { id: user.id },
    populate: { fk_owner: true },
  });

  const actor = fresh || user;
  const role = normalizeStaffRole(actor.staff_role);
  const owner = actor.fk_owner && actor.fk_owner.id ? actor.fk_owner : actor;
  const ownerId = owner.id || actor.id;

  return {
    actor,
    role,
    owner,
    ownerId,
    isStaff: role !== STAFF_ROLES.OWNER || ownerId !== actor.id,
  };
}

function assertStaffRole(actor, allowedRoles) {
  const allowed = new Set(allowedRoles || []);
  if (!actor || !allowed.has(actor.role)) {
    throw staffError();
  }
}

function canTransitionItem(actor, fromStatus, toStatus) {
  const role = actor && actor.role ? actor.role : STAFF_ROLES.OWNER;
  if (role === STAFF_ROLES.OWNER || role === STAFF_ROLES.GESTIONE) return true;
  if (role === STAFF_ROLES.CUCINA) {
    return (fromStatus === 'taken' && toStatus === 'preparing') ||
      (fromStatus === 'preparing' && toStatus === 'ready');
  }
  if (role === STAFF_ROLES.CAMERIERE) {
    return fromStatus === 'ready' && toStatus === 'served';
  }
  return false;
}

function staffUserPayload(user, owner) {
  const role = normalizeStaffRole(user && user.staff_role);
  const effectiveOwner = owner && owner.id ? owner : user;
  return {
    staff_role: role,
    fk_owner: effectiveOwner && effectiveOwner.id !== user.id ? {
      id: effectiveOwner.id,
      documentId: effectiveOwner.documentId,
      username: effectiveOwner.username,
      email: effectiveOwner.email,
    } : null,
    effective_user_id: effectiveOwner ? effectiveOwner.id : user.id,
    effective_user_documentId: effectiveOwner ? effectiveOwner.documentId : user.documentId,
    restaurant_name: effectiveOwner ? (effectiveOwner.restaurant_name || effectiveOwner.username) : user.username,
  };
}

function compactRestaurantSlug(value, fallback = 'Ristorante') {
  const words = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const slug = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  const clean = slug || fallback;
  return /^[0-9]/.test(clean) ? `${fallback}${clean}` : clean;
}

function staffEmail(ownerEmail, username, role) {
  const fallback = `${username.toLowerCase()}@staff.tavolo.local`;
  const email = String(ownerEmail || '').trim().toLowerCase();
  const match = email.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
  if (!match) return fallback;
  return `${match[1]}+${role}@${match[2]}`;
}

async function authenticatedRoleId(strapi) {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' },
    select: ['id'],
  });
  return role && role.id ? role.id : 1;
}

async function createOrUpdateStaffAccount(strapi, owner, password, staffDef, order) {
  const base = compactRestaurantSlug(owner.restaurant_name || owner.username || owner.email);
  const username = `${base}.${staffDef.role}`;
  const fallbackEmail = `${username.toLowerCase()}@staff.tavolo.local`;
  let email = staffEmail(owner.email, username, staffDef.role);
  const userService = strapi.plugin('users-permissions').service('user');
  const roleId = await authenticatedRoleId(strapi);

  const emailOwner = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { email },
    select: ['id', 'username'],
  });
  if (emailOwner && emailOwner.username !== username) {
    email = fallbackEmail;
  }

  const existing = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { username },
    populate: { fk_owner: true },
  });

  const data = {
    username,
    email,
    provider: 'local',
    password,
    confirmed: true,
    blocked: false,
    name: staffDef.label,
    surname: 'Staff',
    staff_role: staffDef.role,
    role: roleId,
    fk_owner: owner.id,
  };

  let user;
  if (existing) {
    user = await userService.edit(existing.id, data);
  } else {
    user = await userService.add(data);
  }

  strapi.log.info(`Staff account pronto: ${username} -> owner ${owner.username || owner.id}`);
  return {
    id: user.id,
    username,
    staff_role: staffDef.role,
    order,
  };
}

async function createDefaultStaffAccounts(strapi, owner, password) {
  if (!owner || !owner.id || !password) return [];
  const enabled = String(process.env.REGISTER_AUTO_STAFF_ACCOUNTS || 'true').toLowerCase() !== 'false';
  if (!enabled) return [];

  const created = [];
  for (let index = 0; index < DEFAULT_REGISTER_STAFF.length; index += 1) {
    const staffDef = DEFAULT_REGISTER_STAFF[index];
    try {
      created.push(await createOrUpdateStaffAccount(strapi, owner, password, staffDef, index + 1));
    } catch (err) {
      strapi.log.warn(`Creazione staff ${staffDef.role} fallita per owner ${owner.username || owner.id}: ${err.message}`);
    }
  }
  return created;
}

module.exports = {
  STAFF_ROLES,
  normalizeStaffRole,
  resolveStaffContext,
  assertStaffRole,
  canTransitionItem,
  staffUserPayload,
  compactRestaurantSlug,
  createDefaultStaffAccounts,
};
