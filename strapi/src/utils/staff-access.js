'use strict';

const STAFF_ROLES = {
  OWNER: 'owner',
  GESTIONE: 'gestione',
  CAMERIERE: 'cameriere',
  CUCINA: 'cucina',
  BAR: 'bar',
  PIZZERIA: 'pizzeria',
  CUCINA_SG: 'cucina_sg',
};

const KNOWN_ROLES = new Set(Object.values(STAFF_ROLES));
const STAFF_USERNAME_SUFFIXES = new Map([
  ['cameriere', STAFF_ROLES.CAMERIERE],
  ['camerire', STAFF_ROLES.CAMERIERE],
  ['cucina', STAFF_ROLES.CUCINA],
  ['bar', STAFF_ROLES.BAR],
  ['pizzeria', STAFF_ROLES.PIZZERIA],
  ['cucinasg', STAFF_ROLES.CUCINA_SG],
  ['cucina_sg', STAFF_ROLES.CUCINA_SG],
]);

const KITCHEN_LIKE_ROLES = new Set([
  STAFF_ROLES.CUCINA,
  STAFF_ROLES.BAR,
  STAFF_ROLES.PIZZERIA,
  STAFF_ROLES.CUCINA_SG,
]);

function normalizeStaffRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return KNOWN_ROLES.has(value) ? value : STAFF_ROLES.OWNER;
}

function roleFromStaffUsername(username) {
  const value = String(username || '').trim().toLowerCase();
  const match = value.match(/^(.+)\.([^.]+)$/);
  if (!match) return null;
  const role = STAFF_USERNAME_SUFFIXES.get(match[2]);
  return role ? { ownerUsername: match[1], role } : null;
}

async function inferOwnerFromStaffUsername(strapi, actor) {
  const inferred = roleFromStaffUsername(actor && actor.username);
  if (!inferred) return null;

  const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { username: { $eqi: inferred.ownerUsername } },
  });

  if (!owner || owner.id === actor.id) return null;
  return { owner, role: inferred.role };
}

async function resolveRestaurantStaffRecord(strapi, actor) {
  if (!actor || !actor.id || !strapi.db.connection) return null;

  try {
    const row = await strapi.db.connection('restaurant_staff as staff')
      .join('up_users as owner', 'owner.id', 'staff.owner_id')
      .select([
        'staff.role as staff_role',
        'staff.active as staff_active',
        'staff.owner_id as owner_id',
        'owner.document_id as owner_document_id',
        'owner.username as owner_username',
        'owner.email as owner_email',
        'owner.subscription_status as owner_subscription_status',
        'owner.subscription_plan as owner_subscription_plan',
        'owner.subscription_current_period_end as owner_subscription_current_period_end',
        'owner.subscription_cancel_at_period_end as owner_subscription_cancel_at_period_end',
        'owner.end_subscription as owner_end_subscription',
      ])
      .where('staff.user_id', actor.id)
      .first();

    if (!row || !row.owner_id || row.owner_id === actor.id) return null;
    return {
      role: normalizeStaffRole(row.staff_role),
      active: row.staff_active !== false,
      owner: {
        id: row.owner_id,
        documentId: row.owner_document_id,
        username: row.owner_username,
        email: row.owner_email,
        subscription_status: row.owner_subscription_status,
        subscription_plan: row.owner_subscription_plan,
        subscription_current_period_end: row.owner_subscription_current_period_end,
        subscription_cancel_at_period_end: row.owner_subscription_cancel_at_period_end,
        end_subscription: row.owner_end_subscription,
      },
    };
  } catch (_err) {
    return null;
  }
}

async function applyStaffActiveState(strapi, ownerId, role, active) {
  if (!strapi.db.connection) return null;
  const nextActive = role === STAFF_ROLES.CAMERIERE ? true : !!active;

  const row = await strapi.db.connection('restaurant_staff')
    .select(['user_id', 'role'])
    .where('owner_id', ownerId)
    .where('role', role)
    .first();

  if (!row || !row.user_id) return null;

  await strapi.db.connection('restaurant_staff')
    .where('owner_id', ownerId)
    .where('role', role)
    .update({ active: nextActive });

  const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { id: ownerId },
    select: ['id', 'subscription_status', 'subscription_plan', 'subscription_current_period_end', 'end_subscription'],
  });

  const status = owner && owner.subscription_status;
  const periodEnd = owner && (owner.subscription_current_period_end || owner.end_subscription);
  const hasActiveSubscription = ['active', 'trialing'].includes(status) && (
    !periodEnd || new Date(periodEnd).getTime() >= Date.now()
  );
  const isProRole = role === STAFF_ROLES.GESTIONE ||
    role === STAFF_ROLES.BAR ||
    role === STAFF_ROLES.PIZZERIA ||
    role === STAFF_ROLES.CUCINA_SG;
  const planAllowsRole = hasActiveSubscription && (
    owner.subscription_plan === 'pro' ||
    (!isProRole && owner.subscription_plan === 'starter')
  );

  await strapi.db.query('plugin::users-permissions.user').update({
    where: { id: row.user_id },
    data: { blocked: !(nextActive && planAllowsRole) },
  });

  return { user_id: row.user_id, role, active: nextActive, blocked: !(nextActive && planAllowsRole) };
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
  const staffRecord = await resolveRestaurantStaffRecord(strapi, actor);
  const fallbackStaff = await inferOwnerFromStaffUsername(strapi, actor);
  const explicitRole = normalizeStaffRole(actor.staff_role);
  const role = staffRecord
    ? staffRecord.role
    : (actor.fk_owner && actor.fk_owner.id
      ? explicitRole
      : (fallbackStaff ? fallbackStaff.role : explicitRole));
  const owner = staffRecord
    ? staffRecord.owner
    : (actor.fk_owner && actor.fk_owner.id
      ? actor.fk_owner
      : (fallbackStaff ? fallbackStaff.owner : actor));
  const ownerId = owner.id || actor.id;
  const actorWithRole = { ...actor, staff_role: role };

  return {
    actor: actorWithRole,
    role,
    owner,
    ownerId,
    staffActive: staffRecord ? staffRecord.active : true,
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
  if (KITCHEN_LIKE_ROLES.has(role)) {
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

module.exports = {
  STAFF_ROLES,
  KITCHEN_LIKE_ROLES,
  normalizeStaffRole,
  resolveStaffContext,
  assertStaffRole,
  canTransitionItem,
  staffUserPayload,
  compactRestaurantSlug,
  applyStaffActiveState,
};
