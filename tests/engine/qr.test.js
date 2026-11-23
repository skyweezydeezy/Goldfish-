// QR codes made in the page (goldfish/static/qr.js), used by "Play a friend" to show the invite and the reply: the right size for the
// text, the three finder patterns, a quiet light ring, and too-long text refused. Where the zbarimg scanner is installed, every code is
// also scanned back and must read exactly the text it was made from (texts of 1 to 950 characters, QR versions 1 to 24).
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const qr = require('../../goldfish/static/qr.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const text = n => { let t = ''; for (let i = 0; i < n; i++) t += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.#:/'[(i * 7 + n) % 68]; return t; };
const link = 'https://skyweezydeezy.github.io/ICEYfish/#isf-join=ISF2z.' + text(190);
const lens = [1, 14, 26, 62, 106, 122, 180, 250, 331, 450, 600, 800, 950];
const cases = lens.map(text).concat([link]);

const finder = (m, x0, y0) => { for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= m.length || y >= m.length) continue;
  const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3)), want = d !== 2 && d !== 4; if (!!m[y][x] !== want) return false; } return true; };
let shapes = true, sizes = [];
for (const t of cases) {
  const m = qr.matrix(t), n = m.length, v = (n - 17) / 4;
  sizes.push(v);
  if (!Number.isInteger(v) || v < 1 || v > 25 || m.some(r => r.length !== n) || !finder(m, 0, 0) || !finder(m, n - 7, 0) || !finder(m, 0, n - 7)) shapes = false;
}
check('each code is a square of a QR version size, with the three finder patterns in their corners', shapes, 'versions ' + sizes.join(' '));
check('a longer text never makes a smaller code', sizes.slice(0, lens.length).every((v, i, a) => i === 0 || v >= a[i - 1]));
check('an invite link (about 260 characters) makes a code small enough to scan off a phone screen (version 15 or below)', sizes[sizes.length - 1] <= 15, 'version ' + sizes[sizes.length - 1]);
let threw = ''; try { qr.matrix(text(1200)); } catch (e) { threw = e.message; }
check('text too long for a QR code is refused, not drawn wrong', /too long/.test(threw), threw);
const svg = qr.svg(link);
check('the picture is an SVG with a white background and a 4-module quiet zone', /^<svg [^>]*viewBox="0 0 (\d+) \1"/.test(svg) && svg.includes('fill="#fff"') && +/viewBox="0 0 (\d+)/.exec(svg)[1] === qr.matrix(link).length + 8);

// scanned back with a real QR reader, where there is one
const zbar = spawnSync('zbarimg', ['--version'], { encoding: 'utf8' });
if (zbar.status !== 0) console.log('SKIP  zbarimg is not installed here: the codes are not scanned back');
else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));
  let read = 0, wrong = [];
  cases.forEach((t, i) => {
    const m = qr.matrix(t), s = 6, w = (m.length + 8) * s, px = Buffer.alloc(w * w, 255);
    m.forEach((row, y) => row.forEach((c, x) => { if (c) for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) px[((y + 4) * s + b) * w + (x + 4) * s + a] = 0; }));
    const f = path.join(dir, `c${i}.pgm`);
    fs.writeFileSync(f, Buffer.concat([Buffer.from(`P5\n${w} ${w}\n255\n`), px]));
    const r = spawnSync('zbarimg', ['-q', '--raw', f], { encoding: 'utf8' });
    if (r.stdout.replace(/\n$/, '') === t) read++; else wrong.push(t.length);
  });
  fs.rmSync(dir, { recursive: true, force: true });
  check(`every code scans back to exactly its text (${cases.length} codes, 1 to 950 characters, and an invite link)`, read === cases.length, wrong.length ? 'wrong: ' + wrong.join(', ') : read + ' read');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
