export const STAFF_ROLES = {
  OWNER: 'owner',
  GESTIONE: 'gestione',
  CAMERIERE: 'cameriere',
  CUCINA: 'cucina',
};

const knownRoles = new Set(Object.values(STAFF_ROLES));

export const staffRole = (user) => {
  const value = String(user?.staff_role || '').trim().toLowerCase();
  return knownRoles.has(value) ? value : STAFF_ROLES.OWNER;
};

export const effectiveUserDocumentId = (user) =>
  user?.effective_user_documentId ||
  user?.fk_owner?.documentId ||
  user?.documentId ||
  null;

export const effectiveUserId = (user) =>
  user?.effective_user_id ||
  user?.fk_owner?.id ||
  user?.id ||
  null;

export const defaultRouteForUser = (user) => {
  const role = staffRole(user);
  if (role === STAFF_ROLES.CAMERIERE) return '/orders';
  if (role === STAFF_ROLES.CUCINA) return '/kitchen';
  return '/dashboard';
};

export const canAccessRoute = (user, route) => {
  const allowed = route?.meta?.staffRoles;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(staffRole(user));
};

export const canSeeNavItem = (user, id) => {
  const role = staffRole(user);
  if (role === STAFF_ROLES.CAMERIERE) return ['sala', 'logout'].includes(id);
  if (role === STAFF_ROLES.CUCINA) return ['cucina', 'logout'].includes(id);
  return true;
};
