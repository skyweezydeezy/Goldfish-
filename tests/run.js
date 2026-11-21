#!/usr/bin/env node
// Runs the engine scenario tests (no network, no browser):   node tests/run.js
//   The files run side by side, one per processor (node tests/run.js --jobs 2 to choose; --slow lists the ten slowest files).
//   node tests/run.js rules-batch29 pod      only the files whose names contain one of these
// Also runs the browser tests (needs `playwright` and internet access to Scryfall):   node tests/run.js --ui   (one at a time: they share a server)
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const args = process.argv.slice(2), ui = args.includes('--ui'), slow = args.includes('--slow');
const jobsAt = args.indexOf('--jobs'), only = args.filter((a, i) => !a.startsWith('--') && !(jobsAt >= 0 && i === jobsAt + 1));
const jobs = ui ? 1 : Math.max(1, jobsAt >= 0 ? +args[jobsAt + 1] || 1 : Math.min(8, os.cpus().length));
const dir = path.join(__dirname, ui ? 'ui' : 'engine');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && (!only.length || only.some(o => f.includes(o)))).sort();
const server = ui ? spawn('python3', ['-m', 'http.server', '8800', '--bind', '127.0.0.1'], { cwd: path.join(__dirname, '..', 'goldfish', 'static'), stdio: 'ignore' }) : null;
const t0 = Date.now(), times = [];
let failed = 0, next = 0, running = 0;
function finish() {
  if (server) server.kill();
  if (slow) times.sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([f, s]) => console.log('  ' + s.toFixed(1).padStart(6) + 's  ' + f));
  console.log((failed ? `\n${failed} test file(s) failed` : '\nall test files passed') + ` (${files.length} files, ${Math.round((Date.now() - t0) / 1000)}s)`);
  process.exit(failed ? 1 : 0);
}
function start() {
  while (running < jobs && next < files.length) {
    const f = files[next++], t = Date.now(); let out = ''; running++;
    const c = spawn(process.execPath, [path.join(dir, f)], { env: Object.assign({}, process.env, { NODE_USE_ENV_PROXY: '1' }), cwd: __dirname });
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += '\nError: timed out after 300 seconds'; c.kill('SIGKILL'); }, 300000);
    c.on('exit', code => {
      clearTimeout(timer); running--; times.push([f, (Date.now() - t) / 1000]);
      const summary = (out.match(/(\d+) passed, (\d+) failed/g) || []).pop() || 'no result', bad = code !== 0;
      if (bad) { failed++; console.log(out.split('\n').filter(l => /FAIL|Error/.test(l)).join('\n')); }
      console.log((bad ? 'FAIL ' : 'ok   ') + f.padEnd(34) + summary);
      if (next >= files.length && !running) finish(); else start();
    });
  }
  if (!files.length) finish();
}
setTimeout(start, ui ? 1500 : 0);
