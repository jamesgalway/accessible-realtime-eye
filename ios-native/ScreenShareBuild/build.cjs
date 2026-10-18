'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sources = path.join(root, 'ScreenShareSources');
const output = path.join(root, 'AccessibleVision', 'ScreenShare', 'Resources');
const manifest = JSON.parse(fs.readFileSync(path.join(sources, 'manifest.json'), 'utf8'));
fs.mkdirSync(output, { recursive: true });
for (const [name, expected] of Object.entries(manifest.sources)) {
  const data = fs.readFileSync(path.join(sources, name));
  if (crypto.createHash('sha256').update(data).digest('hex') !== expected) throw new Error('Source hash changed: ' + name);
}
for (const backend of ['aliyun', 'greencloud']) {
  let source = fs.readFileSync(path.join(sources, backend + '-app.js'), 'utf8');
  const imports = source.match(/import\(GEMINI_BROWSER_SDK_URL\)/g) || [];
  if (imports.length !== (backend === 'greencloud' ? 3 : 2)) throw new Error('Review changed SDK import surface: ' + backend);
  // Only packaging changes. Task routing, prompts, contracts and PcmPlayer are unchanged.
  source = source.replaceAll('import(GEMINI_BROWSER_SDK_URL)', 'Promise.resolve(globalThis.HuiyanGoogleSDK)');
  const search = fs.readFileSync(path.join(sources, backend + '-live-web-search.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'AccessibleVision/ScreenShare/ScreenRuntimeAdapter.js'), 'utf8');
  fs.writeFileSync(path.join(output, backend + '-screen-runtime.js'), search + '\n' + source + '\n' + adapter, 'utf8');
}
require('esbuild').buildSync({
  stdin: { contents: "export * from '@google/genai';", resolveDir: __dirname },
  bundle: true, platform: 'browser', format: 'iife', globalName: 'HuiyanGoogleSDK',
  target: 'safari16', minify: true, legalComments: 'eof',
  outfile: path.join(output, 'screen-google-sdk.js')
});
fs.copyFileSync(path.join(sources, 'manifest.json'), path.join(output, 'screen-source-manifest.json'));
console.log('Built isolated runtime from verified production sources.');
