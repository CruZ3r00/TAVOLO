const path = require('path');
const fs = require('fs');

const warnedMissingFiles = new Set();

const cleanPath = (filePath) => (
  typeof filePath === 'string' && filePath.trim() ? filePath.trim() : ''
);

const readOptionalFile = (filePath) => {
  const normalizedPath = cleanPath(filePath);
  if (!normalizedPath) return undefined;
  if (!fs.existsSync(normalizedPath)) {
    if (!warnedMissingFiles.has(normalizedPath)) {
      console.warn(`[database] File SSL opzionale non trovato: ${normalizedPath}.`);
      warnedMissingFiles.add(normalizedPath);
    }
    return undefined;
  }
  return fs.readFileSync(normalizedPath, 'utf8');
};

const buildSslConfig = (env) => {
  if (!env.bool('DATABASE_SSL', false)) return false;

  const caPath = cleanPath(env('DATABASE_SSL_CA', undefined));
  const ca = readOptionalFile(caPath);
  const missingConfiguredCa = !!caPath && !ca;
  const configuredRejectUnauthorized = env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true);

  // Fail loud: se l'operatore vuole TLS verificato (default) e il CA configurato
  // non e' raggiungibile, non degradiamo silenziosamente rejectUnauthorized.
  // L'unico modo di partire senza CA e' un acknowledgement esplicito
  // DATABASE_SSL_REJECT_UNAUTHORIZED=false. Vedi lessons.md: production deve
  // fallire rumorosamente.
  if (missingConfiguredCa && configuredRejectUnauthorized) {
    throw new Error(
      `[database] DATABASE_SSL_CA punta a un file non esistente (${caPath}). ` +
      `Imposta DATABASE_SSL_REJECT_UNAUTHORIZED=false per acconsentire al downgrade, ` +
      `oppure correggi il path al certificato.`
    );
  }

  return {
    key: env('DATABASE_SSL_KEY', undefined),
    cert: env('DATABASE_SSL_CERT', undefined),
    ca,
    capath: env('DATABASE_SSL_CAPATH', undefined),
    cipher: env('DATABASE_SSL_CIPHER', undefined),
    rejectUnauthorized: configuredRejectUnauthorized,
  };
};

module.exports = ({ env }) => {
  const client = env('DATABASE_CLIENT', 'mysql'); // Cambiato da 'sqlite' a 'mysql'

  const connections = {
    mysql: {
      connection: {
        host: env('DATABASE_HOST', '127.0.0.1'),
        port: env.int('DATABASE_PORT', 3306),
        database: env('DATABASE_NAME', 'cms-restaurants'),
        user: env('DATABASE_USERNAME', 'cms-admin'),
        password: env('DATABASE_PASSWORD', ''),
        ssl: buildSslConfig(env),
      },
      pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
    },
    postgres: {
      connection: {
        //connectionString: env('DATABASE_URL'),
        host: env('DATABASE_HOST', 'localhost'),
        port: env.int('DATABASE_PORT', 5432),
        database: env('DATABASE_NAME', 'strapi'),
        user: env('DATABASE_USERNAME', 'strapi'),
        password: env('DATABASE_PASSWORD', 'strapi'),
        ssl: buildSslConfig(env),
        schema: env('DATABASE_SCHEMA', 'public'),
      },
      pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
    },
    sqlite: {
      connection: {
        filename: path.join(__dirname, '..', env('DATABASE_FILENAME', '.tmp/data.db')),
      },
      useNullAsDefault: true,
    },
  };

  return {
    connection: {
      client,
      ...connections[client],
      acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
    },
  };
};
