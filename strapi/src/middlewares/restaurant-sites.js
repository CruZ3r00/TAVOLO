'use strict';

const path = require('path');
const fs = require('fs');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Middleware che serve i siti-menu personalizzati dei ristoranti.
 * Route: GET /sites/:username
 * Cerca il file restaurant-sites/{username}.html nella root del progetto.
 */
module.exports = (config, { strapi }) => {
  const sitesDir = path.resolve(strapi.dirs.app.root, '..', 'restaurant-sites');

  return async (ctx, next) => {
    // Controlla se il path matcha /sites/:username
    const match = ctx.path.match(/^\/sites\/([a-zA-Z0-9_-]+)$/);
    if (!match) {
      return next();
    }

    const username = match[1];
    const safeUsername = escapeHtml(username);
    const filePath = path.join(sitesDir, `${username}.html`);

    // Previeni path traversal
    if (!filePath.startsWith(sitesDir)) {
      ctx.status = 400;
      ctx.body = 'Richiesta non valida';
      return;
    }

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      const content = await fs.promises.readFile(filePath, 'utf-8');

      const siteCsp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "script-src-attr 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
        "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
        "img-src 'self' data: blob: https://images.unsplash.com https://cdn.jsdelivr.net",
        "frame-src https://www.google.com https://maps.google.com",
        "connect-src 'self' http://localhost:1337 http://127.0.0.1:1337",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ].join('; ');
      ctx.set('Content-Security-Policy', siteCsp);
      ctx.remove('Content-Security-Policy-Report-Only');

      ctx.type = 'text/html';
      ctx.body = content;
    } catch (err) {
      // File non trovato: mostra pagina 404 personalizzata
      ctx.status = 404;
      ctx.type = 'text/html';
      ctx.body = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sito non trovato</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
    <div class="container d-flex align-items-center justify-content-center min-vh-100">
        <div class="text-center">
            <h1 class="display-1 fw-bold text-muted">404</h1>
            <h3 class="mb-3">Sito menu non ancora disponibile</h3>
            <p class="text-muted mb-4">Il sito menu per <strong>${safeUsername}</strong> non e' ancora stato creato.</p>
            <a href="/" class="btn btn-primary">Torna alla home</a>
        </div>
    </div>
</body>
</html>`;
    }
  };
};
