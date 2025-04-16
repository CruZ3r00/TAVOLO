module.exports = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      enabled: true,
      origin: ['http://localhost:5174', 'http://192.168.1.36:5174' ],  // Sostituisci con il tuo dominio frontend
      headers: '*',  // Permetti qualsiasi header, puoi specificare specifici header se necessario
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
