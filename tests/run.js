#!/usr/bin/env node
// Runs the engine scenario tests (no network, no browser):   node tests/run.js
// Also runs the browser tests (needs `playwright` and internet access to Scryfall):   node tests/run.js --ui
const { spawnSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const ui = process.argv.includes('--ui');
const dir = path.join(__dirname, ui ? 'ui' : 'engine');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
let server = null;
if (ui) server = spawn('python3', ['-m', 'http.server', '8800', '--bind', '127.0.0.1'], { cwd: path.join(__dirname, '..', 'goldfish', 'static'), stdio: 'ignore' });
let failed = 0;
const wait = ui ? new Promise(r => setTimeout(r, 1500)) : Promise.resolve();
wait.then(() => {
  for (const f of files) {
    const res = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_USE_ENV_PROXY: '1' }), cwd: __dirname, timeout: 300000 });
    const out = (res.stdout || '') + (res.stderr || '');
    const summary = (out.match(/(\d+) passed, (\d+) failed/g) || []).pop() || 'no result';
    const bad = res.status !== 0;
    if (bad) { failed++; console.log(out.split('\n').filter(l => /FAIL|Error/.test(l)).join('\n')); }
    console.log((bad ? 'FAIL ' : 'ok   ') + f.padEnd(34) + summary);
  }
  if (server) server.kill();
  console.log(failed ? `\n${failed} test file(s) failed` : '\nall test files passed');
  process.exit(failed ? 1 : 0);
});
