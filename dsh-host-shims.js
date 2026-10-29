// DSH desktop host-package shim generator.
//
// DSH (DeepSeek Harness) keeps its own packages inside app.asar:
//   <install>\resources\app.asar\dsh\node_modules\@deepseek-ai\...
// Profile plugins live outside the asar:
//   %USERPROFILE%\.dsh\profiles\desktop\node_modules
// Node cannot resolve @deepseek-ai/* from the profile into app.asar, so plugins
// that import host packages directly fail to load.
//
// NEVER copy the host packages into the profile. Packages such as cordis,
// dsh-scope, dsh-system-prompt and dsh-tools carry module-local state
// (Symbols, WeakMaps, service registries). A copy creates a second instance,
// which breaks:
//   - ctx.tools[TOOL_RUNTIME_SCHEDULER] identity -> all tools fail with
//     "Cannot read properties of undefined (reading 'prepare')"
//   - preset cordis:group isolation -> prompt sections leak into the Host
//     realm -> all presets fail with "prompt section ... already registered"
//
// The correct local workaround is a re-export shim: every profile
// @deepseek-ai/<pkg> package becomes a tiny index.js that re-exports the same
// module from app.asar. The host and the plugins then share one instance.
//
// Usage:
//   ELECTRON_RUN_AS_NODE=1 "<DSH exe>" "dsh-host-shims.js" [--apply]
// Without --apply it only prints what would be generated.
//
// Environment overrides:
//   DSH_ASAR     default: D:/deepseek/resources/app.asar/dsh/node_modules
//   DSH_PROFILE  default: %USERPROFILE%/.dsh/profiles/desktop/node_modules

const fs = require('fs');
const path = require('path');

const ASAR = process.env.DSH_ASAR || 'D:/deepseek/resources/app.asar/dsh/node_modules';
const PROFILE = process.env.DSH_PROFILE || path.join(
  process.env.USERPROFILE || 'C:/Users/Lenovo',
  '.dsh/profiles/desktop/node_modules'
);
const apply = process.argv.includes('--apply');

// Host packages that profile plugins import at runtime.
// Update this list if a future DSH/plugin version imports new host packages.
const seeds = [
  'cordis',
  'dsh-agent',
  'dsh-credentials',
  'dsh-launch-environment',
  'dsh-llm',
  'dsh-mcp-client',
  'dsh-scope',
  'dsh-session',
  'dsh-storage-domain',
  'dsh-tools',
  'dsh-typert-protocol',
  'dsh-user-approval',
  'dsh-web',
  'dsh-workspace',
  'schemastery',
];

function rootEntry(host) {
  let entry = host.main || 'index.js';
  const ex = host.exports;
  if (typeof ex === 'string') entry = ex;
  else if (ex && typeof ex === 'object') {
    const dot = ex['.'];
    if (typeof dot === 'string') entry = dot;
    else if (dot && typeof dot === 'object') {
      entry = dot.default || dot.import || dot.require || entry;
    }
  }
  return entry.replace(/^\.\//, '');
}

let shimmed = 0;
let missing = 0;

function shim(name) {
  const hostDir = path.join(ASAR, '@deepseek-ai', name);
  const hostPkg = path.join(hostDir, 'package.json');
  if (!fs.existsSync(hostPkg)) {
    console.log('missing in asar:', name);
    missing++;
    return;
  }

  const host = JSON.parse(fs.readFileSync(hostPkg, 'utf8'));
  const entry = rootEntry(host);
  const hostWin = path.join(hostDir, entry).replace(/\\/g, '/');
  const hostUrl = 'file:///' + hostWin;
  const isEsm = host.type === 'module' || /\.mjs$/.test(entry);
  const dst = path.join(PROFILE, '@deepseek-ai', name);

  if (!apply) {
    console.log('would shim:', name, '->', entry, isEsm ? '(esm)' : '(cjs)');
    shimmed++;
    return;
  }

  fs.mkdirSync(dst, { recursive: true });
  fs.writeFileSync(
    path.join(dst, 'package.json'),
    JSON.stringify({
      name: host.name,
      version: host.version || '0.0.0',
      type: isEsm ? 'module' : 'commonjs',
      main: 'index.js',
      exports: { '.': './index.js', './package.json': './package.json' },
    }, null, 2) + '\n'
  );
  if (isEsm) {
    fs.writeFileSync(
      path.join(dst, 'index.js'),
      `import * as m from '${hostUrl}';\n` +
      `export * from '${hostUrl}';\n` +
      `export default m.default;\n`
    );
  } else {
    fs.writeFileSync(
      path.join(dst, 'index.js'),
      `module.exports = require('${hostWin}');\n`
    );
  }
  console.log('shimmed:', name, '->', entry, isEsm ? '(esm)' : '(cjs)');
  shimmed++;
}

const seen = new Set();
for (const name of seeds) {
  seen.add(name);
  shim(name);
}

// Also normalize any @deepseek-ai/* already present in the profile.
const scopeDir = path.join(PROFILE, '@deepseek-ai');
if (fs.existsSync(scopeDir)) {
  for (const name of fs.readdirSync(scopeDir)) {
    if (seen.has(name)) continue;
    if (!fs.existsSync(path.join(scopeDir, name, 'package.json'))) continue;
    shim(name);
  }
}

console.log(
  `host shims: ${apply ? 'applied' : 'dry-run'} ${shimmed} shim${missing ? `, ${missing} missing` : ''}`
);
if (missing > 0) process.exitCode = 1;

// Repair a missing package.json on the Windows canvas native package.
// This is unrelated to the shims but is a common pnpm-install casualty.
(async () => {
  const nativeDir = path.join(PROFILE, '@napi-rs/canvas-win32-x64-msvc');
  const canvasPkg = path.join(PROFILE, '@napi-rs/canvas/package.json');
  if (!fs.existsSync(nativeDir) || !fs.existsSync(canvasPkg)) return;
  if (fs.existsSync(path.join(nativeDir, 'package.json'))) {
    console.log('canvas native: ok');
    return;
  }
  const canvas = JSON.parse(fs.readFileSync(canvasPkg, 'utf8'));
  const ver = canvas.version;
  if (!apply) {
    console.log('canvas native: missing package.json, would restore', ver);
    return;
  }
  const meta = await (await fetch('https://registry.npmjs.org/@napi-rs%2Fcanvas-win32-x64-msvc')).json();
  const v = meta.versions[ver];
  if (!v) {
    console.log('canvas native: version', ver, 'not in registry');
    return;
  }
  fs.writeFileSync(
    path.join(nativeDir, 'package.json'),
    JSON.stringify({
      name: v.name,
      version: v.version,
      main: v.main,
      files: v.files,
      os: v.os,
      cpu: v.cpu,
      license: v.license,
    }, null, 2) + '\n'
  );
  console.log('canvas native: package.json restored for', ver);
})().catch((e) => console.log('canvas native ERR', e.message));
