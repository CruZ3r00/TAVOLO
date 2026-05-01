#!/usr/bin/env node
'use strict';

/**
 * build-win.js
 *
 * Cross-target build per Windows da Linux:
 *   1. Scarica i prebuild Windows dei native bindings (better-sqlite3, keytar)
 *      e li posiziona dentro node_modules/.../build/Release/<*.node>
 *   2. Invoca `pkg . --targets node20-win-x64 --out-path dist/win --compress Brotli`
 *   3. Ripristina sempre i .node Linux (anche se pkg fallisce)
 *
 * Uso:
 *   node scripts/build-win.js
 *
 * Sostituisce il vecchio "npm run pack:win" diretto, che produceva un EXE
 * contenente .node bindings Linux (non eseguibile su Windows).
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { ensureWindowsPrebuilt, restoreLinuxBindings } = require('./native-bindings');

const ROOT = path.resolve(__dirname, '..');

async function main() {
  console.log('==> Step 1/2: scarico prebuild Windows dei native bindings');
  await ensureWindowsPrebuilt({ verbose: true });

  console.log('\n==> Step 2/2: pkg cross-bundle');
  const pkgBin = path.join(ROOT, 'node_modules', '.bin', 'pkg');
  const proc = spawnSync(
    pkgBin,
    ['.', '--targets', 'node20-win-x64', '--out-path', 'dist/win', '--compress', 'Brotli'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (proc.status !== 0) {
    throw new Error(`pkg fallito (exit ${proc.status})`);
  }
}

main()
  .then(() => {
    console.log('\n==> Restore: ripristino .node Linux nei node_modules');
    restoreLinuxBindings({ verbose: true });
    console.log('\nBuild Windows completata: dist/win/pos-rt-service.exe');
  })
  .catch((err) => {
    console.error('\nERRORE:', err.message);
    console.log('Restore: ripristino .node Linux nei node_modules');
    try {
      restoreLinuxBindings({ verbose: true });
    } catch (e) {
      console.error('Restore fallito:', e.message);
    }
    process.exit(1);
  });
