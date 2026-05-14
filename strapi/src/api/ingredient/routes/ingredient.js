'use strict';

module.exports = {
  routes: [
    // Legacy (tutti i piani, owner+gestione): aggregato dishes + toggle.
    { method: 'GET', path: '/ingredients',        handler: 'ingredient.list' },
    { method: 'PUT', path: '/ingredients/toggle', handler: 'ingredient.toggle' },

    // Advanced (pro, owner-only): gestione magazzino completa.
    { method: 'GET',    path: '/ingredients/advanced',                handler: 'ingredient.listAdvanced' },
    { method: 'POST',   path: '/ingredients',                         handler: 'ingredient.createAdvanced' },
    { method: 'POST',   path: '/ingredients/restock-batch',           handler: 'ingredient.restockBatch' },
    { method: 'PATCH',  path: '/ingredients/:id',                     handler: 'ingredient.updateAdvanced' },
    { method: 'DELETE', path: '/ingredients/:id',                     handler: 'ingredient.removeAdvanced' },
    { method: 'POST',   path: '/ingredients/:id/restock',             handler: 'ingredient.restock' },
    { method: 'POST',   path: '/ingredients/:id/waste',               handler: 'ingredient.waste' },
    { method: 'POST',   path: '/ingredients/:id/confirm-depleted',    handler: 'ingredient.confirmDepleted' },
    { method: 'GET',    path: '/ingredients/:id/movements',           handler: 'ingredient.listMovements' },
  ],
};
