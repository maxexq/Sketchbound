// Pose Studio sync server: the studio (deployed anywhere) talks to this over HTTP to "save to game".
// It reads and writes packages/shared/src/data/clips.json and pushes every change (including edits
// made by an AI agent through the MCP server) to open studios over Server-Sent Events.
// Node built-ins only. Env: PORT (8790), HOST (127.0.0.1), SKETCHBOUND_CLIPS, STUDIO_TOKEN, STUDIO_ORIGINS.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store';
import type { Clip, Bindings } from '@sketchbound/shared';

const store = new Store();
const PORT = Number(process.env.PORT ?? 8790), HOST = process.env.HOST ?? '127.0.0.1';
const TOKEN = process.env.STUDIO_TOKEN ?? '';
const ORIGINS = (process.env.STUDIO_ORIGINS ?? '*').split(',').map(s => s.trim());
const clients = new Set<http.ServerResponse>();

function cors(req: http.IncomingMessage, res: http.ServerResponse) {
  const o = req.headers.origin ?? '';
  res.setHeader('Access-Control-Allow-Origin', ORIGINS.includes('*') ? '*' : ORIGINS.includes(o) ? o : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
  // a studio served over https may call this server on localhost (Chrome Private Network Access)
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}
const send = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body));
};
const body = (req: http.IncomingMessage) => new Promise<unknown>((ok, bad) => {
  let s = ''; req.setEncoding('utf8');
  req.on('data', c => { s += c; if (s.length > 2e6) { bad(new Error('body too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : null); } catch (e) { bad(e); } });
});

function broadcast() {
  const msg = `event: pack\ndata: ${JSON.stringify({ rev: store.rev(), pack: store.read() })}\n\n`;
  for (const c of clients) c.write(msg);
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url ?? '/', 'http://x'), parts = url.pathname.split('/').filter(Boolean);
  if (TOKEN && req.headers.authorization !== 'Bearer ' + TOKEN && url.searchParams.get('token') !== TOKEN) return send(res, 401, { error: 'token required' });
  try {
    if (parts[0] !== 'api') return send(res, 404, { error: 'not found' });
    const [, what, id] = parts;
    if (what === 'health') return send(res, 200, { ok: true, file: store.file, rev: store.rev(), clips: store.list().length });
    if (what === 'pack' && req.method === 'GET') return send(res, 200, { rev: store.rev(), pack: store.read() });
    if (what === 'events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`event: pack\ndata: ${JSON.stringify({ rev: store.rev(), pack: store.read() })}\n\n`);
      clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (what === 'clips') {
      if (!id && req.method === 'GET') return send(res, 200, store.list());
      if (id && req.method === 'GET') { const c = store.get(id); return c ? send(res, 200, c) : send(res, 404, { error: 'no clip ' + id }); }
      if (id && req.method === 'PUT') { const c = (await body(req)) as Clip; if (c?.id !== id) return send(res, 400, { error: 'id in body must match url' }); return send(res, 200, store.put(c)); }
      if (id && req.method === 'DELETE') return send(res, store.remove(id) ? 200 : 404, { ok: true });
    }
    if (what === 'bindings' && req.method === 'PUT') {
      const b = (await body(req)) as Record<string, Bindings>;
      if (id) return send(res, 200, store.bind(id, b as Bindings));
      store.replaceBindings(b); return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: (e as Error).message }); }
});

// any writer (this server, the MCP server, a git pull, a text editor) → tell the studios
let timer: NodeJS.Timeout | undefined, last = store.rev();
const onChange = () => { clearTimeout(timer); timer = setTimeout(() => { const r = store.rev(); if (r !== last) { last = r; broadcast(); } }, 60); };
fs.mkdirSync(path.dirname(store.file), { recursive: true });
fs.watch(path.dirname(store.file), (_e, f) => { if (!f || path.basename(store.file) === String(f)) onChange(); });
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Pose Studio sync on http://${HOST}:${PORT}  →  ${store.file}${TOKEN ? '  (token required)' : ''}`);
});
