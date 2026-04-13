'use strict';

module.exports = {
  routes: [
    { method: 'PUT',    path: '/account/profile',         handler: 'account.updateProfile' },
    { method: 'PUT',    path: '/account/password',        handler: 'account.updatePassword' },
    { method: 'POST',   path: '/account/destroy',         handler: 'account.destroy' },
    { method: 'GET',    path: '/account/2fa/status',      handler: 'account.twoFactorStatus' },
    { method: 'POST',   path: '/account/2fa/enable',      handler: 'account.twoFactorEnable' },
    { method: 'POST',   path: '/account/2fa/confirm',     handler: 'account.twoFactorConfirm' },
    { method: 'DELETE', path: '/account/2fa/disable',     handler: 'account.twoFactorDisable' },
    { method: 'POST',   path: '/account/2fa/recovery',    handler: 'account.twoFactorRegenerateRecovery' },
  ],
};
