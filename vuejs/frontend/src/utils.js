// Re-export sottile per retro-compatibilita': i componenti continuano a importare
// da '@/utils' mentre la logica e' stata estratta in `src/lib/api/*` (framework-agnostic,
// condivisa tra modern Vue 3 e legacy Vue 2.7 build).
//
// Per nuovo codice, importa direttamente dai moduli di dominio:
//   import { fetchOrders } from '@/lib/api/orders'
//   import { fetchReservations } from '@/lib/api/reservations'
// ecc.

export { API_BASE } from './lib/api/_base.js';
export {
  fetchMenuElements,
  importMenuAnalyze,
  importMenuBulk,
} from './lib/api/menu.js';
export {
  fetchBillingStatus,
  createBillingCheckoutSession,
  syncBillingCheckout,
  createBillingPortalSession,
  changeBillingPlan,
  cancelBillingSubscription,
  reactivateBillingSubscription,
} from './lib/api/billing.js';
export {
  fetchStaffSettings,
  updateStaffSetting,
  updateCategoryRouting,
} from './lib/api/account.js';
export {
  fetchReservations,
  createReservation,
  updateReservationStatus,
  seatReservation,
  createWalkin,
  reservationErrorMessage,
} from './lib/api/reservations.js';
export {
  fetchTakeaways,
  createTakeaway,
  updateTakeaway,
  acceptTakeaway,
  rejectTakeaway,
  sendTakeawayToDepartments,
  pickupTakeaway,
} from './lib/api/takeaways.js';
export {
  fetchTables,
  createTable,
  updateTable,
  deleteTable,
} from './lib/api/tables.js';
export {
  fetchOrders,
  openOrder,
  fetchOrder,
  addOrderItem,
  updateOrderItem,
  deleteOrderItem,
  updateItemStatus,
  closeOrder,
  orderErrorMessage,
} from './lib/api/orders.js';
export {
  generatePosPairingToken,
  fetchPosDevices,
  revokePosDevice,
  fetchPosInstallers,
} from './lib/api/pos.js';
