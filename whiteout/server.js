// Standalone server: serves the game and relays presence between browsers over WebSocket,
// standing in for the claude.ai room when the game runs outside an artifact.
// Usage: node whiteout/server.js [port]   then open http://localhost:8080 in two or more browsers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.glb': 'model/gltf-binary' };
// index.html is written for the artifact host, which adds the document skeleton; add it here too.
const HEAD = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>';

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (p === '/') p = '/index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(p === '/index.html' ? HEAD + data + '</body></html>' : data);
  });
});

const peers = new Map();
const frame = (sock, op, data) => {
  const len = data.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  if (!sock.destroyed) sock.write(Buffer.concat([head, data]));
};
const sendText = (sock, s) => frame(sock, 1, Buffer.from(s));

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || !req.url.startsWith('/ws')) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const id = crypto.randomBytes(8).toString('hex');
  const me = { sock, presence: {} };
  sendText(sock, JSON.stringify({ hello: id, peers: [...peers].map(([k, v]) => [k, v.presence]) }));
  peers.set(id, me);
  let buf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, masked = buf[1] & 0x80;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) { sock.destroy(); return; }
      const start = off + (masked ? 4 : 0), end = start + len;
      if (buf.length < end) return;
      const payload = Buffer.from(buf.subarray(start, end));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[off + (i & 3)];
      buf = buf.subarray(end);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { frame(sock, 10, payload); continue; }
      if (op !== 1 || len > 4096) continue; // same 4 KiB presence cap as the artifact room
      let msg;
      try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; }
      if (!msg || typeof msg.p !== 'object' || !msg.p) continue;
      me.presence = msg.p;
      const out = JSON.stringify({ peer: id, p: msg.p });
      for (const [k, v] of peers) if (k !== id) sendText(v.sock, out);
    }
  });
  const bye = () => {
    if (!peers.delete(id)) return;
    const out = JSON.stringify({ left: id });
    for (const v of peers.values()) sendText(v.sock, out);
  };
  sock.on('end', () => sock.end()); // HTTP sockets allow half-open; finish the close so 'close' fires
  sock.on('close', bye);
  sock.on('error', bye);
});

server.listen(port, () => console.log(`Whiteout Alley: http://localhost:${port}`));
