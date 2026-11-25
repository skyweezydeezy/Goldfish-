// A tiny MQTT 3.1.1 broker (QoS 0) for the browser tests of "Play a friend" (tests/ui/remote-nearby.ui.js), so they need no internet.
// Playwright's routeWebSocket hands each page's WebSocket to attach(); the broker answers CONNECT, SUBSCRIBE, UNSUBSCRIBE and PINGREQ and
// delivers each PUBLISH to every client subscribed to its topic (the sender too, as a real broker does). It keeps a log of what passed.
module.exports = function mockBroker() {
  const clients = new Set(), log = [];
  const varint = n => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); o.push(n ? d | 128 : d); } while (n); return o; };
  const pkt = (b0, body) => Buffer.concat([Buffer.from([b0, ...varint(body.length)]), body]);
  function handle(c, first, body) {
    const type = first >> 4;
    if (type === 1) return c.ws.send(Buffer.from([0x20, 2, 0, 0]));                       // CONNECT -> CONNACK accepted
    if (type === 8 || type === 10) {                                                      // SUBSCRIBE / UNSUBSCRIBE
      let q = 2; const topics = [];
      while (q + 2 <= body.length) { const l = body.readUInt16BE(q); topics.push(body.toString('utf8', q + 2, q + 2 + l)); q += 2 + l + (type === 8 ? 1 : 0); }
      topics.forEach(t => (type === 8 ? c.subs.add(t) : c.subs.delete(t)));
      return c.ws.send(type === 8 ? Buffer.concat([Buffer.from([0x90, 2 + topics.length, body[0], body[1]]), Buffer.alloc(topics.length)]) : Buffer.from([0xb0, 2, body[0], body[1]]));
    }
    if (type === 3) {                                                                     // PUBLISH
      const l = body.readUInt16BE(0), topic = body.toString('utf8', 2, 2 + l), payload = body.toString('utf8', 2 + l);
      log.push({ topic, payload });
      const out = pkt(0x30, body);
      for (const o of clients) if (o.subs.has(topic)) o.ws.send(out);
      return;
    }
    if (type === 12) return c.ws.send(Buffer.from([0xd0, 0]));                            // PINGREQ -> PINGRESP
  }
  function attach(ws) {
    const c = { ws, subs: new Set(), buf: Buffer.alloc(0) };
    clients.add(c);
    ws.onMessage(d => {
      c.buf = Buffer.concat([c.buf, Buffer.from(d)]);
      for (;;) {
        if (c.buf.length < 2) return;
        let n = 0, mul = 1, i = 1, b;
        do { if (i >= c.buf.length) return; b = c.buf[i++]; n += (b & 127) * mul; mul *= 128; } while (b & 128);
        if (c.buf.length < i + n) return;
        const first = c.buf[0], body = c.buf.subarray(i, i + n); c.buf = c.buf.subarray(i + n);
        handle(c, first, body);
      }
    });
    ws.onClose(() => clients.delete(c));
  }
  const inject = (topic, obj) => { const l = Buffer.byteLength(topic), body = Buffer.concat([Buffer.from([l >> 8, l & 255]), Buffer.from(topic), Buffer.from(JSON.stringify(obj))]); for (const o of clients) if (o.subs.has(topic)) o.ws.send(pkt(0x30, body)); };      // a message from nobody in particular
  return { attach, log, inject, count: () => clients.size, dropAll: () => { for (const c of [...clients]) { try { c.ws.close({ code: 1011 }); } catch (e) {} clients.delete(c); } } };
};
