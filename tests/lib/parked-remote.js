// "Play a friend" is parked (parked/remote): not in the app. The browser tests that still exercise it call park(ctx), which serves
// its files to the test pages and adds its script tags to the page, as index.html did while it was live.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '..', 'parked', 'remote');
module.exports = async function park(ctx) {
  for (const f of ['remote.js', 'qr.js', 'vendor/jsqr.js']) await ctx.route(u => u.pathname.endsWith('/' + f) && u.port === '8800', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(DIR, f)) }));
  await ctx.route(u => u.port === '8800' && (u.pathname === '/' || u.pathname.endsWith('/index.html')), async r => {
    const res = await r.fetch(), html = await res.text();
    r.fulfill({ response: res, body: html.replace('<script src="versus.js"></script>', '<script src="versus.js"></script><script src="qr.js"></script><script src="remote.js"></script>') });
  });
};
