/* ICEYfish - tickets (T-120). A ticket is a "Teach these cards" request or a deck sent for teaching. It is POSTed to a public Google Apps Script
   web app (tools/google/ticket-endpoint.gs) that the owner deploys as "Execute as: Me, Who has access: Anyone", so a visitor needs no Google or
   GitHub sign-in. The URL is a public config value (ticket-config.js); no secret is ever in the page.
   build(kind, o) -> the payload (every field the app collects), send(url, ticket, fetchFn) -> { state: 'sent' | 'failed' | 'unconfigured', error? }.
   The request is "simple" (Content-Type text/plain), so the browser sends no CORS preflight, which Apps Script cannot answer. */
(function (root) {
  'use strict';
  const LIM = { cards: 40, lines: 4, line: 240, name: 120, deckText: 20000, file: 160, note: 500, version: 16 };
  const cut = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
  const scry = name => 'https://scryfall.com/search?q=' + encodeURIComponent('!"' + name + '"');
  // kind: 'teach' (cards and their unread lines) or 'deck' (a deck .txt for the ManaBox folder, plus the cards it needs taught).
  // o: { cards: [{ name, lines: [text] }], deck: { file, text }, note, version, source, cid }
  function build(kind, o) {
    o = o || {};
    const cards = (o.cards || []).filter(c => c && c.name).slice(0, LIM.cards).map(c => ({
      name: cut(c.name, LIM.name), scryfall: scry(cut(c.name, LIM.name)), lines: (c.lines || []).slice(0, LIM.lines).map(t => cut(t, LIM.line)) }));
    const d = o.deck && o.deck.text ? { file: cut(o.deck.file, LIM.file), text: cut(o.deck.text, LIM.deckText) } : null;
    return { v: 1, kind: kind === 'deck' ? 'deck' : 'teach', version: cut(o.version, LIM.version), source: cut(o.source || 'banner', 24),
      cid: cut(o.cid, 24), ts: o.ts || Date.now(), cards, deck: kind === 'deck' ? d : null, note: cut(o.note, LIM.note), hp: '' };
  }
  const isUrl = u => /^https:\/\/script\.google(usercontent)?\.com\/\S+$/.test(String(u || ''));
  async function send(url, ticket, fetchFn, timeoutMs) {
    if (!isUrl(url)) return { state: 'unconfigured' };
    const f = fetchFn || (root.fetch && root.fetch.bind(root));
    if (!f) return { state: 'failed', error: 'nofetch' };
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ac && setTimeout(() => ac.abort(), timeoutMs || 20000);
    try {
      const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(ticket), redirect: 'follow', signal: ac ? ac.signal : undefined });
      if (!r.ok) return { state: 'failed', error: 'http ' + r.status };
      let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ }
      return j && j.ok ? { state: 'sent', id: j.id } : { state: 'failed', error: (j && j.error) || 'noreply' };
    } catch (e) { return { state: 'failed', error: e && e.name === 'AbortError' ? 'timeout' : 'network' }; }
    finally { if (t) clearTimeout(t); }
  }
  const api = { build, send, isUrl, LIM };
  root.__isfTicket = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
