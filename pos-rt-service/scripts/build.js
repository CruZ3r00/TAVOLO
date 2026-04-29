#!/usr/bin/env node
'use strict';

/**
 * Build helper. Al momento pkg è invocato direttamente via npm script (pack:*).
 * Questo script si occupa di:
 *   1. Validare che le dipendenze siano installate
 *   2. Creare la cartella dist/
 *   3. Invocare pkg per il target corrente se args specificato
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
}

function detectTarget() {
  const arg = (process.argv[2] || '').toLowerCase();
  if (['linux', 'macos', 'win', 'all'].includes(arg)) return arg;
  const p = process.platform;
  if (p === 'darwin') return 'macos';
  if (p === 'win32') return 'win';
  return 'linux';
}

function main() {
  if (!fs.existsSync(path.join(root, 'node_modules'))) {
    console.log('node_modules mancante, eseguo npm install...');
    run('npm', ['install']);
  }
  ensureDir(dist);

  const target = detectTarget();
  console.log(`► Build target: ${target}`);
  run('npm', ['run', `pack:${target}`]);

  console.log('Build completata. Output:', path.join(dist, target));
}

main();
