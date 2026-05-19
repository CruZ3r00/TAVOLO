/**
 * Helper per la verifica del piano sottoscrizione utente.
 * Centralizza la logica 'pro vs starter' usata da piu' componenti.
 */

export function isProPlan(user) {
  return user?.subscription_plan === 'pro';
}

export function planName(user) {
  if (isProPlan(user)) return 'Professionale';
  return 'Essenziale';
}
