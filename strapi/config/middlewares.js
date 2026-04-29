const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://192.168.1.63:5174',
  'http://192.168.1.63:5175',
  'http://192.168.1.63:5176',
  'http://192.168.1.216:5174',
];

const parseCorsOrigins = () => {
  const raw = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
  const origins = (raw && raw.trim() ? raw.split(',') : DEFAULT_CORS_ORIGINS)
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set(origins)];
};

const frontendOrigins = parseCorsOrigins();

const parseFrameAncestors = () => {
  const raw = process.env.FRAME_ANCESTORS;
  const ancestors = (raw && raw.trim() ? raw.split(',') : frontendOrigins)
    .map((origin) => origin.trim())
    .filter(Boolean);
  const uniqueAncestors = new Set(ancestors);
  uniqueAncestors.delete("'self'");

  return ["'self'", ...uniqueAncestors];
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
          'frame-ancestors': parseFrameAncestors(),
        },
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      origin: frontendOrigins,
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
//   Middleware per servire i siti-menu personalizzati su /sites/:username
   {
     name: 'global::restaurant-sites',
     config: {},
   },
];
