'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/ingredients',        handler: 'ingredient.list' },
    { method: 'PUT', path: '/ingredients/toggle', handler: 'ingredient.toggle' },
  ],
};
