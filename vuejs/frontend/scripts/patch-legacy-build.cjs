#!/usr/bin/env node
/**
 * Patch postinstall per il dual-build modern/legacy.
 *
 * Problema: `vue-template-compiler@2.7.x` (richiesto da `vite-plugin-vue2`)
 * fa un sanity check confrontando `require('vue/package.json').version` con
 * la propria version. Nel nostro setup il top-level `vue` e' `vue@3.x`
 * (modern), quindi il check fallisce con:
 *
 *   Vue packages version mismatch:
 *   - vue@3.x.x (...)
 *   - vue-template-compiler@2.7.x (...)
 *
 * Workaround: creare uno "shadow" `node_modules/vue-template-compiler/node_modules/vue`
 * con il package.json di Vue 2.7 (installato via alias `vue2`). Node module
 * resolution risolve `require('vue/package.json')` da dentro vue-template-compiler
 * prima al subtree locale, quindi al top-level — quindi vede vue@2.7 e non si
 * lamenta.
 *
 * Idempotente: skippa se la shadow gia' esiste.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const vue2Pkg = path.join(root, 'node_modules', 'vue2', 'package.json');
const compilerDir = path.join(root, 'node_modules', 'vue-template-compiler');
const shadowDir = path.join(compilerDir, 'node_modules', 'vue');
const shadowPkg = path.join(shadowDir, 'package.json');

if (!fs.existsSync(compilerDir)) {
  // Niente da patchare: il legacy build non e' stato installato.
  process.exit(0);
}

if (!fs.existsSync(vue2Pkg)) {
  console.warn('[patch-legacy-build] node_modules/vue2/package.json non trovato. Skip.');
  process.exit(0);
}

if (fs.existsSync(shadowPkg)) {
  // Gia' patchato.
  process.exit(0);
}

fs.mkdirSync(shadowDir, { recursive: true });
fs.copyFileSync(vue2Pkg, shadowPkg);
console.log('[patch-legacy-build] shadow vue@2 creato in vue-template-compiler/node_modules/vue.');
