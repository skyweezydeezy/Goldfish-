// The app's version number lives in one file (goldfish/static/version.js). The deploy workflow adds 1 on every merge; the page shows it and
// the offline cache is named after it. Nothing else may carry a hand-written version, or branches conflict on it again.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), S = path.join(ROOT, 'goldfish', 'static');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const ver = read('goldfish/static/version.js'), m = ver.match(/^self\.ISF_VERSION = (\d+);$/m);
check('version.js holds one whole number', !!m && +m[1] >= 54, m && m[1]);
const sw = read('goldfish/static/sw.js');
check('the service worker takes its cache name from version.js and has no number of its own', /importScripts\('version\.js'\)/.test(sw) && /const VERSION = 'isf-v' \+ self\.ISF_VERSION;/.test(sw) && !/isf-v\d/.test(sw));
check('...and keeps version.js for offline use', /'version\.js'/.test(sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];'))));
{ const g = { }; g.self = g; let imported = null; new Function('self', 'importScripts', 'caches', 'location', sw.replace(/self\.addEventListener\(/g, '(function(){})(') + '\nself.__v = VERSION;')(g, f => { imported = f; new Function('self', ver)(g); }, {}, { hostname: 'example.org' });
  check('run together they give the cache name isf-v<number>', imported === 'version.js' && g.__v === 'isf-v' + m[1], g.__v); }
const html = read('goldfish/static/index.html');
check('the page loads version.js before the app and shows the number in the footer', html.indexOf('<script src="version.js">') > 0 && html.indexOf('<script src="version.js">') < html.indexOf('<script src="sim.js">') && /id="appVersion"/.test(html) && /"Version " \+ self\.ISF_VERSION/.test(html));
{ const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'isf-ver-')), 'version.js'); fs.writeFileSync(tmp, ver);
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'bump-version.js'), tmp], { encoding: 'utf8' }).trim();
  const after = fs.readFileSync(tmp, 'utf8');
  check('the bump tool adds exactly 1 and changes nothing else', out === String(+m[1] + 1) && after === ver.replace(m[0], `self.ISF_VERSION = ${+m[1] + 1};`), out);
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'bump-version.js'), tmp]); check('...and again', new RegExp(`^self\\.ISF_VERSION = ${+m[1] + 2};$`, 'm').test(fs.readFileSync(tmp, 'utf8')));
  check('the real version.js was not touched by the test', read('goldfish/static/version.js') === ver); }
const wf = read('.github/workflows/pages.yml');
check('the deploy workflow bumps the version, commits it and may write to the repository', /node tools\/bump-version\.js/.test(wf) && /git push -q origin "HEAD:\$GITHUB_REF_NAME"/.test(wf) && /contents: write/.test(wf) && wf.indexOf('bump-version') < wf.indexOf('upload-pages-artifact'));
const rules = read('CLAUDE.md');
check('CLAUDE.md asks for a yes before a merge, a confirmation after it, and no hand-edited version', /Ask first/.test(rules) && /Confirm after/.test(rules) && /Never edit `goldfish\/static\/version\.js`/.test(rules));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
