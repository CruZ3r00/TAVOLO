'use strict';

/**
 * native-bindings.js
 *
 * Helper per il cross-target build con `@yao-pkg/pkg`.
 *
 * Problema: pacchetti come `better-sqlite3` e `keytar` distribuiscono native
 * bindings (`.node`) compilati per ogni OS+arch. Quando si fa cross-compile
 * da Linux a Windows con `pkg`, i `.node` in `node_modules/<pkg>/build/Release/`
 * sono SOLO Linux: il bundle Windows risulta non funzionante.
 *
 * Strategia: prima di invocare `pkg --targets node20-win-x64`, scarichiamo da
 * GitHub releases i prebuild Windows, li posizioniamo dove `pkg` li trova durante
 * il bundling, e dopo il pack li ripristiniamo a quelli Linux.
 *
 * API:
 *   listBindings()                     -> elenco hardcoded dei bindings supportati
 *   ensureWindowsPrebuilt({verbose})   -> backup Linux + download Win + posiziona
 *   restoreLinuxBindings({verbose})    -> rimette i .node Linux originali
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

// ABI Node usato da yao-pkg per node20 LTS
const NODE_ABI = 115;

/**
 * Bindings da gestire. Per aggiungere un pacchetto: appendere qui un descrittore.
 *
 * - relativeNodePath: dove `pkg` trova il .node nel package (relativo a node_modules/<pkg>)
 * - prebuildUrl(version): funzione per costruire l'URL del tarball Windows
 * - tarballNodePath: percorso interno al tarball del file .node
 */
function listBindings() {
  return [
    {
      name: 'better-sqlite3',
      relativeNodePath: 'better-sqlite3/build/Release/better_sqlite3.node',
      prebuildUrl: (v) =>
        `https://github.com/WiseLibs/better-sqlite3/releases/download/v${v}/better-sqlite3-v${v}-node-v${NODE_ABI}-win32-x64.tar.gz`,
      tarballNodePath: 'build/Release/better_sqlite3.node',
    },
    {
      name: 'keytar',
      relativeNodePath: 'keytar/build/Release/keytar.node',
      prebuildUrl: (v) =>
        `https://github.com/atom/node-keytar/releases/download/v${v}/keytar-v${v}-napi-v3-win32-x64.tar.gz`,
      tarballNodePath: 'build/Release/keytar.node',
    },
  ];
}

function pkgVersion(name) {
  const pj = path.join(NODE_MODULES, name, 'package.json');
  return JSON.parse(fs.readFileSync(pj, 'utf8')).version;
}

function downloadFollowingRedirects(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
    https
      .get(url, { headers: { 'User-Agent': 'pos-rt-service/build' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          return resolve(downloadFollowingRedirects(res.headers.location, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} on ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function extractTarGzMember(tarGzBuf, memberPath) {
  // Decomprime gzip + estrae UN file dal tarball usando `tar` (sempre disponibile su Linux/macOS).
  // Su Windows fare cross-build non e' lo scenario qui — questo script gira da Linux.
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'posrt-prebuild-'));
  const tarFile = path.join(tmpDir, 'pkg.tar.gz');
  fs.writeFileSync(tarFile, tarGzBuf);
  const proc = spawnSync('tar', ['-xzf', tarFile, '-C', tmpDir, memberPath], {
    encoding: 'utf8',
  });
  if (proc.status !== 0) {
    throw new Error(`tar fallito: ${proc.stderr || proc.stdout}`);
  }
  const extracted = path.join(tmpDir, memberPath);
  if (!fs.existsSync(extracted)) {
    throw new Error(`Membro non trovato dopo l'estrazione: ${memberPath}`);
  }
  const buf = fs.readFileSync(extracted);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return buf;
}

const BACKUP_SUFFIX = '.linux-backup';

async function ensureWindowsPrebuilt({ verbose = true } = {}) {
  for (const b of listBindings()) {
    const target = path.join(NODE_MODULES, b.relativeNodePath);
    if (!fs.existsSync(target)) {
      throw new Error(`Native binding mancante: ${target}. Esegui 'npm install'.`);
    }
    const backup = target + BACKUP_SUFFIX;

    // Salva il .node Linux solo se non gia' fatto (idempotente).
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(target, backup);
      if (verbose) console.log(`  [backup] ${b.relativeNodePath}`);
    }

    const v = pkgVersion(b.name);
    const url = b.prebuildUrl(v);
    if (verbose) console.log(`  [fetch] ${b.name}@${v}  ${url}`);
    const tarball = await downloadFollowingRedirects(url);
    const winNodeBuf = extractTarGzMember(tarball, b.tarballNodePath);
    fs.writeFileSync(target, winNodeBuf);
    if (verbose) console.log(`  [write] ${target}  (${winNodeBuf.length} bytes)`);
  }
}

function restoreLinuxBindings({ verbose = true } = {}) {
  for (const b of listBindings()) {
    const target = path.join(NODE_MODULES, b.relativeNodePath);
    const backup = target + BACKUP_SUFFIX;
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, target);
      fs.unlinkSync(backup);
      if (verbose) console.log(`  [restore] ${b.relativeNodePath}`);
    }
  }
}

module.exports = {
  listBindings,
  ensureWindowsPrebuilt,
  restoreLinuxBindings,
};
