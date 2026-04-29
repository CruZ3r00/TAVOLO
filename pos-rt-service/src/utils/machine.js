'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Path cross-platform per i dati applicativi.
 * Override via env APP_DATA_DIR.
 *
 *   Windows:  %ProgramData%\PosRtService
 *   macOS:    ~/Library/Application Support/PosRtService
 *   Linux:    $XDG_DATA_HOME o ~/.local/share/pos-rt-service
 */
function getAppDataDir() {
  if (process.env.APP_DATA_DIR) {
    return path.resolve(process.env.APP_DATA_DIR);
  }

  const platform = process.platform;
  if (platform === 'win32') {
    const base = process.env.ProgramData || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'PosRtService');
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'PosRtService');
  }
  // linux & altri
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'pos-rt-service');
}

function getDbPath() {
  return path.join(getAppDataDir(), 'db', 'pos-rt-service.db');
}

function getLogsDir() {
  return path.join(getAppDataDir(), 'logs');
}

function getSaltPath() {
  return path.join(getAppDataDir(), '.salt');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/**
 * Fingerprint stabile della macchina. Combina dati non segreti per derivare una
 * chiave di cifratura legata all'host.
 *
 * Non è segreto di per sé: deve essere combinato con il salt random in
 * `getMasterKeyMaterial()`.
 */
function getMachineFingerprint() {
  const parts = [
    os.hostname(),
    os.platform(),
    os.release(),
    os.arch(),
    process.versions.node,
  ];

  const macs = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets).sort()) {
    for (const iface of nets[name] || []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macs.push(iface.mac);
        break;
      }
    }
  }
  parts.push(macs.sort().join(','));

  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Materiale per la master key: salt random persistito + fingerprint.
 * Il salt è generato al primo avvio e protetto a livello FS (ACL).
 */
function getMasterKeyMaterial() {
  const saltPath = getSaltPath();
  ensureDir(path.dirname(saltPath));

  let salt;
  if (fs.existsSync(saltPath)) {
    salt = fs.readFileSync(saltPath);
    if (salt.length !== 32) {
      throw new Error(`Salt file corrotto a ${saltPath} (lunghezza ${salt.length})`);
    }
  } else {
    salt = crypto.randomBytes(32);
    fs.writeFileSync(saltPath, salt, { mode: 0o600 });
  }

  return {
    salt,
    fingerprint: getMachineFingerprint(),
  };
}

module.exports = {
  getAppDataDir,
  getDbPath,
  getLogsDir,
  getSaltPath,
  ensureDir,
  getMachineFingerprint,
  getMasterKeyMaterial,
};
