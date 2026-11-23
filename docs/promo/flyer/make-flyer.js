// Builds the ICEYfish flyer: flyer.svg (US Letter, self-contained) and flyer.png (300 dpi).
// Run from the repo root: node docs/promo/flyer/make-flyer.js   (needs Playwright + Chromium)
// Text lives in TABS/LINES below; check every claim against the live app before printing.
const fs = require('fs'), path = require('path');
const dir = __dirname, promo = path.join(dir, '..'), root = path.join(promo, '..', '..');
const URL = 'skyweezydeezy.github.io/ICEYfish';
const qr = fs.readFileSync(path.join(promo, 'goldfish-qr-logo.png')).toString('base64');
const logo = fs.readFileSync(path.join(root, 'goldfish', 'static', 'logo.svg'), 'utf8')
  .replace(/<\?xml[^>]*>/, '').replace(/<svg\b/, '<svg x="70" y="62" width="128" height="128"');
const TABS = [
  ['Build', 'Paste a decklist: curve, tags and strengths'],
  ['Mulligan', 'Opening hands with London mulligans and land odds'],
  ['Practice', 'Play it by hand against a goldfish, with autopilot and undo'],
  ['Simulate', '2,000 autopiloted games: mana by turn and kill turn'],
  ['Odds', 'The exact chance to draw the cards you need, turn by turn'],
  ['Duel', 'One computer opponent, or Play a friend (beta)'],
  ['Pod', 'A four-player Commander pod against the computer'],
];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rows = TABS.map(([t, d], i) => {
  const y = 690 + i * 44;
  return `<text x="110" y="${y}" class="tab">${t}</text><text x="250" y="${y}" class="desc">${esc(d)}</text>`;
}).join('\n  ');
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="8.5in" height="11in" viewBox="0 0 850 1100">
  <style>
    text{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
    .h1{font-size:64px;font-weight:800;fill:#fff}
    .sub{font-size:24px;fill:#c8ebfe}
    .lead{font-size:24px;font-weight:700;fill:#0b2a43}
    .url{font-size:26px;font-weight:700;fill:#0b2a43}
    .tab{font-size:21px;font-weight:800;fill:#0b2a43}
    .desc{font-size:18px;fill:#24425c}
    .foot{font-size:12px;fill:#55697a}
  </style>
  <rect width="850" height="1100" fill="#fff"/>
  <rect width="850" height="250" fill="#0b2a43"/>
  ${logo}
  <text x="225" y="128" class="h1">ICEYfish</text>
  <text x="228" y="170" class="sub">Goldfish your Magic: The Gathering deck.</text>
  <text x="228" y="202" class="sub">Free, in your browser. No sign-up.</text>
  <image x="275" y="275" width="300" height="300" xlink:href="data:image/png;base64,${qr}"/>
  <text x="425" y="608" text-anchor="middle" class="url">${URL}</text>
  <text x="425" y="642" text-anchor="middle" class="lead">Scan, paste your list, and see how it really runs.</text>
  <line x1="90" y1="660" x2="760" y2="660" stroke="#c8ebfe" stroke-width="2"/>
  ${rows}
  <line x1="90" y1="1000" x2="760" y2="1000" stroke="#c8ebfe" stroke-width="2"/>
  <text x="425" y="1028" text-anchor="middle" class="foot">Card data and images are provided by Scryfall (scryfall.com) and are not endorsed by Scryfall.</text>
  <text x="425" y="1048" text-anchor="middle" class="foot">ICEYfish is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards.</text>
  <text x="425" y="1068" text-anchor="middle" class="foot">Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</text>
</svg>
`;
fs.writeFileSync(path.join(dir, 'flyer.svg'), svg);
(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 3.125 });
  await p.goto('file://' + path.join(dir, 'flyer.svg'));
  await p.screenshot({ path: path.join(dir, 'flyer.png') });
  await b.close();
  console.log('wrote flyer.svg and flyer.png (2550x3300)');
})();
