const parseCorsOrigins = () => {
  const raw = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || 'http://localhost:5174';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  console.log(origins);
  return origins;
};

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
      origin: parseCorsOrigins(),
      headers: '*',
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  {
    name: 'strapi::body',
    config: {
      includeUnparsed: true,
      formLimit: '24mb',
      jsonLimit: '24mb',
      textLimit: '24mb',
      formidable: {
        maxFileSize: 20 * 1024 * 1024,
      },
    },
  },
  'strapi::session',
  'global::subscription-gate',
  'strapi::favicon',
  'strapi::public',
  // Middleware per servire i siti-menu personalizzati su /sites/:username
  // {
  //   name: 'global::restaurant-sites',
  //   config: {},
  // },
];
