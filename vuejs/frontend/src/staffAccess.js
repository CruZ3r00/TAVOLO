export const STAFF_ROLES = {
  OWNER: 'owner',
  GESTIONE: 'gestione',
  CAMERIERE: 'cameriere',
  CUCINA: 'cucina',
  BAR: 'bar',
  PIZZERIA: 'pizzeria',
  CUCINA_SG: 'cucina_sg',
};

const knownRoles = new Set(Object.values(STAFF_ROLES));

export const isStarterPlan = (user) => String(user?.subscription_plan || '').toLowerCase() === 'starter';

export const kitchenRoleLabel = (user) => (isStarterPlan(user) ? 'Ordini' : 'Cucina');

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
  if (role === STAFF_ROLES.BAR) return '/bar';
  if (role === STAFF_ROLES.PIZZERIA) return '/pizzeria';
  if (role === STAFF_ROLES.CUCINA_SG) return '/kitchen-sg';
  return '/dashboard';
};

export const canAccessRoute = (user, route) => {
  if (route?.meta?.requiresPlan === 'pro' && String(user?.subscription_plan || '').toLowerCase() !== 'pro') return false;
  const allowed = route?.meta?.staffRoles;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(staffRole(user));
};

/**
 * Determina se l'item di navigazione `bar-management` ("Carico bar") deve
 * essere visibile a un dato user. Owner e gestione NON la vedono in sidebar
 * (accedono al pannello via il bottone "Turno bar" dentro la tab Bevande del
 * MenuSetter).
 *
 * Regole:
 *   - Bar (esiste solo su pro): sempre.
 *   - Cucina: solo se il piano dell'owner e' 'starter' (su starter non c'e' staff
 *     bar, quindi cucina copre il ruolo bar per il carico).
 *   - Altri (owner, gestione, cameriere, pizzeria, cucina_sg, cucina pro): no.
 */
const canSeeBarManagement = (user) => {
  const role = staffRole(user);
  if (role === STAFF_ROLES.BAR) return true;
  if (role === STAFF_ROLES.CUCINA) {
    return isStarterPlan(user);
  }
  return false;
};

export const canSeeNavItem = (user, id) => {
  const role = staffRole(user);
  if (id === 'bar-management') return canSeeBarManagement(user);
  if (role === STAFF_ROLES.CAMERIERE) return ['sala', 'prenotazioni', 'logout'].includes(id);
  if (role === STAFF_ROLES.CUCINA) return ['cucina', 'bar-management', 'logout'].includes(id);
  if (role === STAFF_ROLES.BAR) return ['bar', 'logout'].includes(id);
  if (role === STAFF_ROLES.PIZZERIA) return ['pizzeria', 'logout'].includes(id);
  if (role === STAFF_ROLES.CUCINA_SG) return ['cucina_sg', 'logout'].includes(id);
  return true;
};
