module.exports = [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
          'style-src': ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
          'img-src': ["'self'", 'data:', 'blob:', 'cdn.jsdelivr.net'],
          'font-src': ["'self'", 'cdn.jsdelivr.net'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'self'", "http://localhost:5174"],
        },
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      origin: '*',
      headers: '*',
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
  // Middleware per servire i siti-menu personalizzati su /sites/:username
  {
    name: 'global::restaurant-sites',
    config: {},
  },
];
