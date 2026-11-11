// Client: connects, sends intent, and draws server snapshots ~100 ms in the past so movement is smooth.
import { buildLayout, MAPS, PRESETS, SKILLS, hotbar, type ServerMsg, type ClientMsg, type PlayerView, type MobView, type ShotView, rig } from '@sketchbound/shared';
import { DEFS_SVG, drawFrame, groundSvg, treeSvgs, newBody, stepBody, VIEW, ZK, type Body, type Float, type Spark } from './render';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = $('svg') as unknown as SVGSVGElement, status = $('status');
const ELEMENTS = (rig as unknown as { ELEMENTS: Record<string, { c: string[] }> }).ELEMENTS;
const INTERP = 0.1;

const L = buildLayout(MAPS['pencil-field']);
const trees = treeSvgs(L);
svg.innerHTML = DEFS_SVG + `<g id="mg">${groundSvg(L)}</g><g id="md"></g>`;
const mg = svg.querySelector('#mg')!, md = svg.querySelector('#md')!;

const presetSel = $('preset') as HTMLSelectElement;
presetSel.innerHTML = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.th}</option>`).join('');
const nameIn = $('name') as HTMLInputElement;
nameIn.value = new URLSearchParams(location.search).get('name') ?? '';

interface Snap { time: number; players: PlayerView[]; mobs: MobView[]; shots: ShotView[] }
let ws: WebSocket | null = null, you: number | null = null, offset: number | null = null;
const snaps: Snap[] = [], bodies = new Map<number, Body>(), floats: Float[] = [], sparks: Spark[] = [];
let mark: { x: number; z: number; t: number } | null = null;
const cam = { x: 0, y: 0 };
const local = () => performance.now() / 1000;

function connect(name: string, preset: string) {
  const url = new URLSearchParams(location.search).get('server') ?? `ws://${location.hostname || 'localhost'}:8787`;
  ws = new WebSocket(url);
  status.textContent = 'กำลังเชื่อมต่อ…';
  ws.onopen = () => send({ t: 'hello', name, preset });
  ws.onclose = () => { status.textContent = 'หลุดการเชื่อมต่อ — รีเฟรชเพื่อเข้าใหม่'; you = null; };
  ws.onmessage = e => onMsg(JSON.parse(e.data) as ServerMsg);
}
const send = (m: ClientMsg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

function onMsg(m: ServerMsg) {
  if (m.t === 'welcome') { you = m.you; status.textContent = 'ออนไลน์'; return; }
  const est = m.time - local();
  offset = offset == null ? est : Math.max(est, offset + (est - offset) * 0.05); // follow the server clock, never jump backward much
  snaps.push({ time: m.time, players: m.players, mobs: m.mobs, shots: m.shots });
  while (snaps.length > 30) snaps.shift();
  const now = local();
  const byId = new Map(m.players.map(p => [p.id, p]));
  for (const e of m.events) {
    if (e.k === 'dmg') {
      floats.push({ x: e.x + (Math.random() - 0.5) * 14, z: e.z, h: e.h + 12, txt: e.n + (e.crit ? '!' : ''), kind: e.crit ? 'crit' : 'dmg', t: now });
      sparks.push({ x: e.x, z: e.z, h: e.h * 0.6, t: now, c: ELEMENTS[e.el]?.c ?? ELEMENTS.mono.c });
    } else {
      const p = byId.get(e.id); if (!p) continue;
      if (e.k === 'hurt') floats.push({ x: p.x, z: p.z, h: 64, txt: '-' + e.n, kind: 'hurt', t: now });
      if (e.k === 'exp' && e.id === you) floats.push({ x: p.x, z: p.z, h: 70, txt: '+' + e.n + ' EXP', kind: 'info', t: now });
      if (e.k === 'lvl') floats.push({ x: p.x, z: p.z, h: 84, txt: 'LEVEL UP!', kind: 'lvl', t: now });
      if (e.k === 'ko' && e.id === you) floats.push({ x: p.x, z: p.z, h: 84, txt: 'ล้มแล้ว…', kind: 'lvl', t: now });
      if (e.k === 'info' && e.id === you) floats.push({ x: p.x, z: p.z, h: 62, txt: e.txt, kind: 'info', t: now });
    }
  }
}

/** positions between the two snapshots around time t */
function sample(t: number): Snap | null {
  if (!snaps.length) return null;
  let i = snaps.length - 1; while (i > 0 && snaps[i - 1].time > t) i--;
  const b = snaps[i], a = snaps[i - 1];
  if (!a || b.time <= a.time) return b;
  const k = Math.max(0, Math.min(1, (t - a.time) / (b.time - a.time)));
  const lerp = <T extends { id: number; x: number; z: number }>(A: T[], B: T[]) => {
    const old = new Map(A.map(o => [o.id, o]));
    return B.map(o => { const p = old.get(o.id); return p && Math.hypot(o.x - p.x, o.z - p.z) < 80 ? { ...o, x: p.x + (o.x - p.x) * k, z: p.z + (o.z - p.z) * k } : o; });
  };
  return { time: t, players: lerp(a.players, b.players), mobs: lerp(a.mobs, b.mobs), shots: lerp(a.shots, b.shots) };
}

let last = local();
function frame() {
  const clock = local(), dt = Math.min(0.05, clock - last); last = clock;
  requestAnimationFrame(frame);
  if (offset == null) return;
  const now = clock + offset - INTERP, s = sample(now); if (!s) return;
  for (const p of s.players) { let b = bodies.get(p.id); if (!b) bodies.set(p.id, b = newBody()); stepBody(b, p, now, dt); }
  for (const id of bodies.keys()) if (!s.players.some(p => p.id === id)) bodies.delete(id);
  const me = s.players.find(p => p.id === you);
  if (me) {
    cam.x = Math.max(-30, Math.min(L.def.width - 610, me.x - 320));
    cam.y = Math.max(-70, Math.min(L.def.depth * ZK - 370, me.z * ZK - 240));
    renderHotbar(me);
  }
  while (floats.length && clock - floats[0].t > 1) floats.shift();
  while (sparks.length && clock - sparks[0].t > 0.22) sparks.shift();
  const [tf, overlay] = drawFrame({ L, trees, now, clock, me, players: s.players, bodies, mobs: s.mobs, shots: s.shots, floats, sparks, mark, cam, online: s.players.length });
  mg.setAttribute('transform', tf); md.innerHTML = overlay;
}
requestAnimationFrame(frame);

// ---- input ----
svg.addEventListener('pointerdown', e => {
  if (you == null) return;
  const r = svg.getBoundingClientRect(), X = (e.clientX - r.left) / r.width * VIEW.w, Y = (e.clientY - r.top) / r.height * VIEW.h;
  const s = snaps[snaps.length - 1];
  if (s) for (const m of s.mobs) {
    if (m.dead) continue; const sx = m.x - cam.x, sy = m.z * ZK - cam.y;
    if (Math.abs(X - sx) < 18 && Y > sy - 46 && Y < sy + 8) { send({ t: 'target', id: m.id }); return; }
  }
  const x = X + cam.x, z = (Y + cam.y) / ZK;
  send({ t: 'move', x, z }); mark = { x, z, t: local() };
});
addEventListener('keydown', e => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || !/^[1-4]$/.test(e.key)) return;
  send({ t: 'skill', k: Number(e.key) });
});

let hotbarKey = '';
function renderHotbar(me: PlayerView) {
  const list = hotbar(me.eq), key = list.join();
  if (key === hotbarKey) return; hotbarKey = key;
  const bar = $('hotbar');
  bar.querySelectorAll('button').forEach(b => b.remove());
  list.forEach((n, i) => {
    const b = document.createElement('button'), sp = i ? SKILLS.spCost[n] ?? 0 : 0;
    b.textContent = `${i + 1} · ${SKILLS.attacks[n]}${sp ? ` (${sp} SP)` : ''}`;
    b.onclick = () => send({ t: 'skill', k: i + 1 });
    bar.insertBefore(b, status);
  });
}

$('join').addEventListener('submit', e => {
  e.preventDefault(); if (ws) return;
  connect(nameIn.value.trim() || 'ผู้เล่น', presetSel.value);
  ($('join') as HTMLFormElement).style.display = 'none';
});
