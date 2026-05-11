#!/usr/bin/env node
/**
 * Genera `dist/index.html` per il deploy production dual-build.
 *
 * Input atteso:
 *   dist/modern/index.html  build Vue 3 con base=/modern/
 *   dist/legacy/index.html  build Vue 2.7 + @vitejs/plugin-legacy con base=/legacy/
 *
 * Output:
 *   dist/index.html         shell unica module/nomodule
 *
 * Nota: non hardcodiamo gli hash Vite. Li estraiamo dagli index generati.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const modernDir = path.join(distDir, 'modern');
const legacyDir = path.join(distDir, 'legacy');
const modernIndexPath = path.join(modernDir, 'index.html');
const legacyIndexPath = path.join(legacyDir, 'index.html');
const outputIndexPath = path.join(distDir, 'index.html');

function fail(message) {
  console.error(`[generate-unified-index] ${message}`);
  process.exit(1);
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`File mancante: ${path.relative(root, filePath)}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, 'i');
  return tag.match(pattern)?.[1] || '';
}

function findTags(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*(?:>[^]*?<\\/${tagName}>|\\/?>)`, 'gi');
  return html.match(pattern) || [];
}

function findStylesheets(html, expectedPrefix) {
  return findTags(html, 'link')
    .filter((tag) => /\brel\s*=\s*["']stylesheet["']/i.test(tag))
    .map((tag) => attr(tag, 'href'))
    .filter((href) => href.startsWith(expectedPrefix));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function jsString(value) {
  return JSON.stringify(value);
}

function assertPathPrefix(label, value, prefix) {
  if (!value || !value.startsWith(prefix)) {
    fail(
      `${label} non punta a ${prefix}. ` +
      `Esegui la build production con --base=${prefix.replace(/\/$/, '')}/. ` +
      `Valore trovato: ${value || '(vuoto)'}`
    );
  }
}

const modernHtml = readFile(modernIndexPath);
const legacyHtml = readFile(legacyIndexPath);

const modernEntryTag = findTags(modernHtml, 'script')
  .find((tag) => /\btype\s*=\s*["']module["']/i.test(tag) && attr(tag, 'src').startsWith('/modern/assets/'));
const modernEntry = attr(modernEntryTag || '', 'src');
const modernCss = unique(findStylesheets(modernHtml, '/modern/assets/'));

const legacyCss = unique(findStylesheets(legacyHtml, '/legacy/assets/'));
const legacyPolyfillTag = findTags(legacyHtml, 'script')
  .find((tag) => /\bid\s*=\s*["']vite-legacy-polyfill["']/i.test(tag));
const legacyEntryTag = findTags(legacyHtml, 'script')
  .find((tag) => /\bid\s*=\s*["']vite-legacy-entry["']/i.test(tag));
const legacyPolyfill = attr(legacyPolyfillTag || '', 'src');
const legacyEntry = attr(legacyEntryTag || '', 'data-src');
const legacyNomoduleFix = findTags(legacyHtml, 'script')
  .filter((tag) => /\bnomodule\b/i.test(tag) && !attr(tag, 'src') && !/\bid\s*=\s*["']vite-legacy-entry["']/i.test(tag))
  .join('\n    ');

assertPathPrefix('Modern entry', modernEntry, '/modern/assets/');
assertPathPrefix('Legacy polyfill', legacyPolyfill, '/legacy/assets/');
assertPathPrefix('Legacy entry', legacyEntry, '/legacy/assets/');

if (modernCss.length === 0) fail('CSS modern non trovato in dist/modern/index.html.');
if (legacyCss.length === 0) fail('CSS legacy non trovato in dist/legacy/index.html.');

let shell = modernHtml
  .replace(/<script\b(?=[^>]*\btype\s*=\s*["']module["'])(?=[^>]*\bsrc\s*=\s*["']\/modern\/assets\/)[^>]*><\/script>\s*/gi, '')
  .replace(/<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])(?=[^>]*\bhref\s*=\s*["']\/modern\/assets\/)[^>]*>\s*/gi, '')
  .replace(/<!--[\s\S]*?Entry per il modern build[\s\S]*?-->\s*/i, '');

const moduleLoader = `
    <script type="module">
      import.meta.url;
      import("_").catch(function () { return 1; });
      (async function* () {})().next();
      window.__vite_is_modern_browser = true;
    </script>
    <script type="module">
      (function () {
        function loadCss(href) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.crossOrigin = '';
          link.href = href;
          document.head.appendChild(link);
        }

        function loadScript(src, options) {
          var script = document.createElement('script');
          options = options || {};
          if (options.type) script.type = options.type;
          if (options.id) script.id = options.id;
          if (options.crossOrigin !== false) script.crossOrigin = '';
          script.src = src;
          if (options.onload) script.onload = options.onload;
          document.body.appendChild(script);
        }

        if (window.__vite_is_modern_browser) {
          ${modernCss.map((href) => `loadCss(${jsString(href)});`).join('\n          ')}
          loadScript(${jsString(modernEntry)}, { type: 'module' });
          return;
        }

        ${legacyCss.map((href) => `loadCss(${jsString(href)});`).join('\n        ')}
        loadScript(${jsString(legacyPolyfill)}, {
          onload: function () {
            System.import(${jsString(legacyEntry)});
          }
        });
      }());
    </script>`;

const nomoduleLoader = `
    ${legacyNomoduleFix || ''}
    <script nomodule>
      ${legacyCss.map((href) => `document.write('<link rel="stylesheet" crossorigin href="${href}">');`).join('\n      ')}
    </script>
    <script nomodule crossorigin id="vite-legacy-polyfill" src="${legacyPolyfill}"></script>
    <script nomodule crossorigin id="vite-legacy-entry" data-src="${legacyEntry}">
      System.import(document.getElementById('vite-legacy-entry').getAttribute('data-src'));
    </script>`;

if (shell.includes('</body>')) {
  shell = shell.replace('</body>', `${moduleLoader}\n${nomoduleLoader}\n  </body>`);
} else {
  fail('Tag </body> non trovato nel modern index.');
}

fs.writeFileSync(outputIndexPath, shell, 'utf8');

const modernFavicon = path.join(modernDir, 'favicon.ico');
const rootFavicon = path.join(distDir, 'favicon.ico');
if (fs.existsSync(modernFavicon)) {
  fs.copyFileSync(modernFavicon, rootFavicon);
}

const staleRootAssets = path.join(distDir, 'assets');
if (fs.existsSync(staleRootAssets)) {
  console.warn('[generate-unified-index] Nota: dist/assets esiste ancora. Probabile residuo di build vecchia; Nginx non dovrebbe servirlo nel deploy dual-build.');
}

console.log('[generate-unified-index] dist/index.html generato.');
console.log(`[generate-unified-index] modern: ${modernEntry}`);
console.log(`[generate-unified-index] legacy: ${legacyEntry}`);
