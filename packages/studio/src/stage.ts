// The stage: draws the character with the game's own pencil art, and turns drags on the
// bone handles into pose edits (FK rotate, IK for arms/legs, move the hips).
import { figureSvg, DEFS } from '@sketchbound/client/art';
import { rig, evalClip, composePose, keyPose, BMAP, HOME, type BoneId, type Pose, type ClipKey, norm } from '@sketchbound/shared';
import { S, clip, emit, on, begin, commit, editKey, clipEnd, bindingsFor } from './state';
import { toast } from './ui';

const svg = document.getElementById('stage') as unknown as SVGSVGElement;
const solve = rig.solve as (p: Pose) => Record<BoneId, { x: number; y: number; r: number }>;
const GROUND = rig.GROUND as number;
const D2R = Math.PI / 180;
export const pan = { x: 0, y: 0 };
export const opts = { path: true };

const TINT = (id: string, r: number, g: number, b: number, a: number) =>
  `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%"><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} -4 -4 -4 0 4" result="c"/><feComposite in="c" in2="SourceAlpha" operator="in" result="m"/><feComponentTransfer in="m"><feFuncA type="linear" slope="${a}"/></feComponentTransfer></filter>`;
const EXTRA = `<defs>${TINT('onP', 0.2, 0.5, 1, 0.38)}${TINT('onN', 1, 0.45, 0.15, 0.38)}${TINT('dim', 0.4, 0.4, 0.45, 0.35)}
<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20,0 L0,0 0,20" fill="none" stroke="#1b1b1d" stroke-width=".5" opacity=".08"/></pattern></defs>`;

let vb = { x: 0, y: 0, w: 400, h: 300 };
function fitView() {
  const r = svg.getBoundingClientRect(), asp = Math.max(0.3, r.width / Math.max(1, r.height));
  let h = 330 / S.view.zoom, w = h * asp; if (w < 380 / S.view.zoom) { w = 380 / S.view.zoom; h = w / asp; }
  vb = { x: HOME.x - w / 2 - pan.x, y: 262 - h / 2 - pan.y, w, h };
  svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
}

/** pose shown at time t: the clip, with a weapon hold laid over it when one is bound and the clip is a body move */
export function shownPose(t: number) {
  const c = clip(), s = evalClip(c, t);
  let pose = s.pose;
  if (S.view.overlayHold && c.kind !== 'hold' && ['idle', 'walk', 'run'].includes(c.kind)) {
    const h = S.lib[bindingsFor(S.eq.weapon).hold ?? ''] ?? S.game.clips[bindingsFor(S.eq.weapon).hold ?? ''];
    if (h) pose = composePose(pose, evalClip(h, t).pose, h.mask ?? 'upper');
  }
  return { ...s, pose };
}
const dir = () => (S.view.flip ? -1 : 1);
const fig = (pose: Pose, hand: string, extra: object = {}) => figureSvg({ eq: S.eq, pose, px: HOME.x, dir: dir(), hand, sw: 0, ...extra });

export function render() {
  const c = clip(); if (!c) return;
  fitView();
  const s = shownPose(S.t), end = clipEnd(c);
  let g = DEFS + EXTRA + `<rect x="${vb.x - 50}" y="${vb.y - 50}" width="${vb.w + 100}" height="${vb.h + 100}" fill="#ededee"/><rect x="${vb.x - 50}" y="${vb.y - 50}" width="${vb.w + 100}" height="${vb.h + 100}" fill="url(#grid)"/>`;
  // ground: scrolls under looping moves with root motion so foot sliding shows
  const scroll = S.view.rootMotion && c.loop ? -(s.root % 40) * dir() : 0;
  let ticks = ''; for (let x = Math.floor((vb.x - 80) / 40) * 40; x < vb.x + vb.w + 80; x += 40) ticks += `M${(x + scroll).toFixed(1)},${GROUND} l-7,9 `;
  g += `<rect x="${vb.x - 50}" y="${GROUND}" width="${vb.w + 100}" height="${vb.h}" fill="#e3e3e5"/><path d="M${vb.x - 50},${GROUND} L${vb.x + vb.w + 50},${GROUND}" stroke="#1b1b1d" stroke-width="1.5" opacity=".45"/><path d="${ticks}" stroke="#1b1b1d" stroke-width="1" opacity=".22"/>`;
  g += `<path d="M${HOME.x},${vb.y} L${HOME.x},${GROUND}" stroke="#1b1b1d" stroke-dasharray="3 5" opacity=".14"/>`;
  // root motion of a one-shot move: where the character ends up
  if (S.view.rootMotion && !c.loop && c.rootMotion) {
    const x1 = HOME.x + c.rootMotion * dir();
    g += `<path d="M${HOME.x},${GROUND + 14} L${x1},${GROUND + 14}" stroke="#3b6fd8" stroke-width="2" stroke-dasharray="5 4"/><path d="M${x1},${GROUND + 9} l${6 * dir()},5 l${-6 * dir()},5" fill="none" stroke="#3b6fd8" stroke-width="2"/><text x="${(HOME.x + x1) / 2}" y="${GROUND + 30}" text-anchor="middle" font-size="11" fill="#3b6fd8">root motion ${c.rootMotion}px</text>`;
  }
  // onion skin: the keys either side of the playhead
  if (S.view.onion && !S.playing) {
    const prev = [...c.keys].reverse().find(k => k.t < S.t - 1e-4) ?? (c.loop && c.keys.length > 1 ? c.keys[c.keys.length - 1] : null);
    const next = c.keys.find(k => k.t > S.t + 1e-4) ?? (c.loop && c.keys.length > 1 ? c.keys[0] : null);
    if (prev) g += `<g filter="url(#onP)" pointer-events="none">${fig(keyPose(prev), prev.h ?? 'relax', { noHit: true })}</g>`;
    if (next && next !== prev) g += `<g filter="url(#onN)" pointer-events="none">${fig(keyPose(next), next.h ?? 'relax', { noHit: true })}</g>`;
  }
  // motion path of the selected bone's tip across the whole clip
  if (opts.path && S.bone !== 'root' && end > 0) {
    let d = ''; const n = Math.min(120, Math.max(24, Math.round(end * 60)));
    for (let i = 0; i <= n; i++) { const p = tip(evalClip(c, (end * i) / n).pose, S.bone); d += (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ',' + p.y.toFixed(1); }
    let dots = ''; for (const k of c.keys) { const p = tip(keyPose(k), S.bone); dots += `<circle cx="${sx(p.x).toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6" fill="${k.hit ? '#e5484d' : '#1b1b1d'}" opacity=".55"/>`; }
    g += `<path d="${d}" fill="none" stroke="#c48a00" stroke-width="1.3" stroke-dasharray="2 3" opacity=".8" pointer-events="none"/>${dots}`;
  }
  g += fig(s.pose, s.hand, { showBones: S.view.bones, sel: S.bone, idx: 0 });
  // hit flash on keys that land a hit
  const kk = c.keys.find(k => Math.abs(k.t - S.t) < 0.5 / S.fps && (k.hit || k.shoot));
  if (kk) { const p = tip(s.pose, 'handR'); g += `<circle cx="${sx(p.x)}" cy="${p.y}" r="16" fill="none" stroke="#e5484d" stroke-width="2.4" stroke-dasharray="4 3" pointer-events="none"/>`; }
  svg.innerHTML = g;
}
const sx = (x: number) => HOME.x + (x - HOME.x) * dir();
export function tip(pose: Pose, id: BoneId) {
  const W = solve(pose), w = W[id], b = BMAP[id], r = w.r * D2R, L = id === 'head' ? 31 : b.len;
  return { x: w.x + Math.cos(r) * L, y: w.y + Math.sin(r) * L };
}

// ---- dragging bones ----
const toFig = (e: PointerEvent) => {
  const m = svg.getScreenCTM()!.inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
  return { x: HOME.x + (p.x - HOME.x) * dir(), y: p.y };
};
const LIMB: Partial<Record<BoneId, [BoneId, BoneId]>> = {
  armR_l: ['armR_u', 'armR_l'], handR: ['armR_u', 'armR_l'], armL_l: ['armL_u', 'armL_l'], handL: ['armL_u', 'armL_l'],
  legR_l: ['legR_u', 'legR_l'], legL_l: ['legL_u', 'legL_l'],
};
type Drag = { bone: BoneId; key: ClipKey; mode: 'move' | 'rot' | 'ik' | 'spin'; fx0: number; fy0: number; dx0: number; dy0: number; a0: number } | null;
let drag: Drag = null, panning: { x: number; y: number; px: number; py: number } | null = null;

svg.addEventListener('pointerdown', e => {
  const el = (e.target as Element).closest('[data-bone]') as Element | null;
  if (e.button === 1 || e.button === 2 || (e.button === 0 && !el && e.altKey)) { panning = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  if (!el) return;
  const bone = el.getAttribute('data-bone') as BoneId;
  S.bone = bone; S.playing = false; emit('sel', 'time');
  begin();
  const key = editKey();
  if (!key) { commit(); toast('ไม่มีคีย์ตรงนี้ · กด S เพื่อใส่คีย์ หรือเปิด Auto-key'); return; }
  const p = toFig(e);
  const ik = (S.view.ik || e.ctrlKey || e.metaKey) && LIMB[bone];
  drag = { bone, key, mode: bone === 'root' ? (e.shiftKey ? 'spin' : 'move') : ik ? 'ik' : 'rot', fx0: p.x, fy0: p.y, dx0: key.dx, dy0: key.dy, a0: keyPose(key).a.root };
  svg.setPointerCapture(e.pointerId); e.preventDefault();
});
svg.addEventListener('pointermove', e => {
  if (panning) { const r = svg.getBoundingClientRect(), k = vb.w / r.width; pan.x = panning.px + (e.clientX - panning.x) * k; pan.y = panning.py + (e.clientY - panning.y) * k; render(); return; }
  if (!drag) return;
  const p = toFig(e), k = drag.key, pose = keyPose(k);
  if (drag.mode === 'move') { k.dx = Math.round((drag.dx0 + p.x - drag.fx0) * 10) / 10; k.dy = Math.round((drag.dy0 + p.y - drag.fy0) * 10) / 10; }
  else if (drag.mode === 'spin') { k.a.root = Math.round(norm(drag.a0 + (p.x - drag.fx0) * 1.2)); }
  else if (drag.mode === 'rot') {
    const W = solve(pose), w = W[drag.bone], parentR = w.r - pose.a[drag.bone];
    let a = Math.atan2(p.y - w.y, p.x - w.x) / D2R - parentR;
    if (e.shiftKey) a = Math.round(a / 15) * 15;
    k.a[drag.bone] = Math.round(norm(a) * 10) / 10;
  } else ik(k, pose, LIMB[drag.bone]!, p);
  emit('clip');
});
const end = (e: PointerEvent) => { if (panning) { panning = null; } if (drag) { drag = null; commit(); } try { svg.releasePointerCapture(e.pointerId); } catch { /* */ } };
svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
svg.addEventListener('contextmenu', e => e.preventDefault());
svg.addEventListener('wheel', e => { e.preventDefault(); S.view.zoom = Math.max(0.4, Math.min(4, S.view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); emit('view'); }, { passive: false });
svg.addEventListener('dblclick', e => { if (!(e.target as Element).closest('[data-bone]')) { pan.x = pan.y = 0; S.view.zoom = 1; emit('view'); } });

/** two-bone IK: place the end of the lower bone at p, keeping the elbow/knee on the side it bends to now */
function ik(k: ClipKey, pose: Pose, [u, l]: [BoneId, BoneId], p: { x: number; y: number }) {
  const W = solve(pose), S0 = W[u], E0 = W[l];
  const L1 = Math.hypot(E0.x - S0.x, E0.y - S0.y), L2 = BMAP[l].len;
  const dx = p.x - S0.x, dy = p.y - S0.y, d = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(L1 + L2 - 0.01, Math.hypot(dx, dy)));
  const th = Math.atan2(dy, dx), al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const bend = pose.a[l] < 0 || (pose.a[l] === 0 && u.startsWith('arm')) ? 1 : -1;
  const ru = th + bend * al, ex = S0.x + Math.cos(ru) * L1, ey = S0.y + Math.sin(ru) * L1;
  const rl = Math.atan2(S0.y + Math.sin(th) * d - ey, S0.x + Math.cos(th) * d - ex);
  const parentR = S0.r - pose.a[u];
  k.a[u] = Math.round(norm(ru / D2R - parentR) * 10) / 10;
  k.a[l] = Math.round(norm((rl - ru) / D2R) * 10) / 10;
}

on(['clip', 'time', 'view', 'eq', 'sel'], render);
new ResizeObserver(() => render()).observe(svg);
