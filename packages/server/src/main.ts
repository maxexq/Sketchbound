// Game server: one zone (ทุ่งดินสอ), 20 ticks a second, full snapshots over WebSocket.
// Clients only send intent (move here, attack that, use skill k); everything else is decided here.
import { WebSocketServer, WebSocket } from 'ws';
import { Zone, TICK_HZ, type ClientMsg, type ServerMsg } from '@sticky/shared';

const PORT = Number(process.env.PORT ?? 8787);
const zone = new Zone('pencil-field');
const wss = new WebSocketServer({ port: PORT });
const conns = new Map<WebSocket, number | null>();

const send = (ws: WebSocket, m: ServerMsg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

function parse(raw: unknown): ClientMsg | null {
  try {
    const m = JSON.parse(String(raw));
    if (m?.t === 'hello' && typeof m.name === 'string') return { t: 'hello', name: m.name, preset: typeof m.preset === 'string' ? m.preset : undefined };
    if (m?.t === 'move' && Number.isFinite(m.x) && Number.isFinite(m.z)) return { t: 'move', x: m.x, z: m.z };
    if (m?.t === 'target' && Number.isInteger(m.id)) return { t: 'target', id: m.id };
    if (m?.t === 'skill' && Number.isInteger(m.k) && m.k >= 1 && m.k <= 4) return { t: 'skill', k: m.k };
  } catch { /* ignore junk */ }
  return null;
}

wss.on('connection', ws => {
  conns.set(ws, null);
  ws.on('message', raw => {
    const msg = parse(raw); if (!msg) return;
    const id = conns.get(ws);
    if (msg.t === 'hello') {
      if (id != null) return;
      const p = zone.join(msg.name, msg.preset);
      conns.set(ws, p.id);
      send(ws, { t: 'welcome', you: p.id, map: 'pencil-field', time: zone.time });
      console.log(`+ ${p.name} (#${p.id}) joined, ${zone.players.size} online`);
    } else if (id != null) zone.input(id, msg);
  });
  ws.on('close', () => {
    const id = conns.get(ws); conns.delete(ws);
    if (id != null) { zone.leave(id); console.log(`- #${id} left, ${zone.players.size} online`); }
  });
});

const dt = 1 / TICK_HZ;
let last = performance.now(), acc = 0;
setInterval(() => {
  const now = performance.now(); acc += (now - last) / 1000; last = now;
  const events = [];
  while (acc >= dt) { events.push(...zone.step(dt)); acc -= dt; }
  if (!conns.size) return;
  const snap = JSON.stringify({ t: 'snap', time: zone.time, ...zone.views(), events } satisfies ServerMsg);
  for (const ws of conns.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(snap);
}, 1000 / TICK_HZ);

console.log(`Sticky World server on ws://localhost:${PORT}`);
