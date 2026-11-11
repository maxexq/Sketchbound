// Timeline in the style of a video editor: zoomable ruler with frames, a master key row, an events
// row, per-group and per-bone rows with value sparklines, box select, drag/duplicate keys,
// a clip-length handle and a graph editor for the selected bone. Drawn on one canvas.
import { evalClip, keyPose, BMAP, EASE_FN, EASES, EASE_TH, restPose, type BoneId, type ClipKey, type Ease } from '@sketchbound/shared';
import { S, clip, emit, on, begin, commit, setTime, snapT, round, clipEnd, keyAt, addKey, deleteKeys, copyKeys, pasteKeys, mirrorSel, edit, frame } from './state';
import { menu, toast } from './ui';

const cv = document.getElementById('tl') as HTMLCanvasElement, ctx = cv.getContext('2d')!;
const LBL = 196, RH = 28, ROW = 24, MROW = 30;
const C = { bg: '#1c1c1f', alt: '#202024', line: '#2f2f35', text: '#ececee', muted: '#9a9aa3', faint: '#5d5d66', accent: '#f5c542', hit: '#ff6b6b', shoot: '#c58bff', thud: '#ffa94d', ph: '#ff5a5f', out: '#17171a', key: '#d9d9de', blue: '#7fb3ff' };

type Group = { id: string; th: string; bones: (BoneId | 'pos')[]; color: string };
const GROUPS: Group[] = [
  { id: 'body', th: 'ลำตัว + หัว', bones: ['pos', 'root', 'spine', 'head', 'wing'], color: '#f5c542' },
  { id: 'armR', th: 'แขนหน้า (ถืออาวุธ)', bones: ['armR_u', 'armR_l', 'handR'], color: '#ff8a65' },
  { id: 'armL', th: 'แขนหลัง', bones: ['armL_u', 'armL_l', 'handL'], color: '#7fb3ff' },
  { id: 'legR', th: 'ขาหน้า', bones: ['legR_u', 'legR_l'], color: '#5ad19a' },
  { id: 'legL', th: 'ขาหลัง', bones: ['legL_u', 'legL_l'], color: '#c58bff' },
];
export const tl = { pps: 400, scroll: 0, vscroll: 0, graph: false, open: new Set<string>(['armR']), fitNext: true };
type Row = { kind: 'master' | 'events' | 'group' | 'bone'; y: number; h: number; g?: Group; bone?: BoneId | 'pos' };

let W = 0, Hh = 0;
const X = (t: number) => LBL + (t - tl.scroll) * tl.pps;
const T = (x: number) => (x - LBL) / tl.pps + tl.scroll;

function rows(): Row[] {
  const out: Row[] = []; let y = RH - tl.vscroll;
  const add = (r: Omit<Row, 'y'>) => { out.push({ ...r, y } as Row); y += r.h; };
  add({ kind: 'master', h: MROW }); add({ kind: 'events', h: ROW });
  for (const g of GROUPS) { add({ kind: 'group', h: ROW, g }); if (tl.open.has(g.id)) for (const b of g.bones) add({ kind: 'bone', h: ROW - 2, g, bone: b }); }
  return out;
}
const boneTh = (b: BoneId | 'pos') => (b === 'pos' ? 'ตำแหน่งสะโพก' : BMAP[b].th);
const restA = restPose().a;
const val = (k: { dx: number; dy: number; a: Partial<Record<BoneId, number>> }, b: BoneId | 'pos') => (b === 'pos' ? k.dy : (k.a[b] ?? restA[b]) - restA[b]);
const changed = (i: number, b: BoneId | 'pos') => {
  const K = clip().keys; if (i === 0) return true;
  const a = keyPose(K[i - 1]), c = keyPose(K[i]);
  return b === 'pos' ? Math.abs(a.x - c.x) + Math.abs(a.y - c.y) > 0.05 : Math.abs(a.a[b] - c.a[b]) > 0.05;
};

// sampled values per bone, cached until the clip changes
let cache: { ver: number; dt: number; v: Record<string, number[]> } = { ver: -1, dt: 0, v: {} };
let ver = 0; on(['clip'], () => { ver++; });
function samples() {
  if (cache.ver === ver) return cache;
  const c = clip(), end = clipEnd(c), n = Math.min(400, Math.max(40, Math.round(end * 120))), dt = end / n, v: Record<string, number[]> = {};
  for (const g of GROUPS) for (const b of g.bones) v[b] = [];
  for (let i = 0; i <= n; i++) {
    const p = evalClip(c, i * dt).pose;
    for (const g of GROUPS) for (const b of g.bones) v[b].push(b === 'pos' ? p.y - 292 : p.a[b] - restA[b]);
  }
  return (cache = { ver, dt, v });
}

export function fit() {
  const end = Math.max(0.2, clipEnd(clip()));
  tl.pps = Math.max(40, (W - LBL - 40) / end); tl.scroll = -10 / tl.pps; draw();
}

// ---- drawing ----
function glyph(x: number, y: number, e: Ease, r: number, fill: string, stroke: string) {
  ctx.beginPath();
  if (e === 'step') ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
  else if (e === 'io') { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.closePath(); } // hourglass = eased both ways
  else if (e === 'out') { ctx.moveTo(x, y - r); ctx.lineTo(x - r, y); ctx.lineTo(x, y + r); ctx.arc(x, y, r, Math.PI / 2, -Math.PI / 2, true); }
  else if (e === 'in') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.arc(x, y, r, Math.PI / 2, -Math.PI / 2, false); }
  else if (e === 'back') { ctx.arc(x, y, r, 0, Math.PI * 2); }
  else { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke();
}
function label(s: string, x: number, y: number, color = C.text, font = '12px "IBM Plex Sans Thai", system-ui') { ctx.fillStyle = color; ctx.font = font; ctx.fillText(s, x, y); }

export function draw() {
  const c = clip(); if (!c || !W) return;
  const end = clipEnd(c), R = rows();
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, Hh);
  ctx.textBaseline = 'middle';

  if (tl.graph) drawGraph(end);
  else {
    // rows
    R.forEach((r, i) => {
      if (r.y + r.h < RH || r.y > Hh) return;
      ctx.fillStyle = r.kind === 'master' ? '#232327' : i % 2 ? C.alt : C.bg; ctx.fillRect(0, r.y, W, r.h);
      ctx.fillStyle = C.line; ctx.fillRect(0, r.y + r.h - 1, W, 1);
    });
    // area past the clip end
    ctx.fillStyle = C.out; ctx.fillRect(Math.max(LBL, X(end)), RH, W, Hh); ctx.fillRect(LBL, RH, Math.max(0, X(0) - LBL), Hh);
    gridLines(end);
    const S1 = samples();
    for (const r of R) {
      if (r.y + r.h < RH || r.y > Hh) continue;
      const cy = r.y + r.h / 2;
      if (r.kind === 'master') {
        // segments between keys show easing as a thin band
        for (let i = 1; i < c.keys.length; i++) { ctx.fillStyle = '#ffffff10'; ctx.fillRect(X(c.keys[i - 1].t), cy - 3, X(c.keys[i].t) - X(c.keys[i - 1].t), 6); }
        c.keys.forEach(k => { const on = S.sel.has(k); glyph(X(k.t), cy, k.e, on ? 7.5 : 6.5, on ? C.accent : k.hit || k.shoot ? '#5a2b2e' : C.key, on ? '#fff' : k.hit || k.shoot ? C.hit : '#0008'); });
      } else if (r.kind === 'events') {
        for (const k of c.keys) {
          const x = X(k.t);
          if (k.hit) { ctx.fillStyle = C.hit; ctx.beginPath(); ctx.moveTo(x - 6, cy + 6); ctx.lineTo(x, cy - 7); ctx.lineTo(x + 6, cy + 6); ctx.fill(); label(`${k.hit.t === 'launch' ? 'ลอย' : k.hit.t === 'low' ? 'ล่าง' : 'บน'} ${k.hit.dmg}`, x + 8, cy, C.hit, '11px "IBM Plex Sans Thai"'); }
          if (k.shoot) { ctx.fillStyle = C.shoot; ctx.beginPath(); ctx.arc(x, cy, 5.5, 0, 7); ctx.fill(); label(k.shoot.kind, x + 8, cy - (k.hit ? 0 : 0), C.shoot, '11px "IBM Plex Sans Thai"'); }
          if (k.thud) { ctx.fillStyle = C.thud; ctx.fillRect(x - 4.5, cy - 4.5, 9, 9); }
        }
      } else {
        const bones = r.kind === 'group' ? r.g!.bones : [r.bone!];
        // sparkline(s)
        const lo = Math.min(...bones.flatMap(b => S1.v[b])), hi = Math.max(...bones.flatMap(b => S1.v[b])), span = Math.max(8, hi - lo);
        ctx.save(); ctx.beginPath(); ctx.rect(LBL, r.y, W - LBL, r.h); ctx.clip();
        bones.forEach((b, bi) => {
          const v = S1.v[b]; ctx.beginPath();
          v.forEach((y, i) => { const x = X(i * S1.dt), yy = r.y + r.h - 4 - ((y - lo) / span) * (r.h - 8); i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); });
          ctx.strokeStyle = r.kind === 'bone' && r.bone === S.bone ? C.accent : r.g!.color; ctx.globalAlpha = r.kind === 'group' ? 0.35 + 0.15 * (bi % 2) : 0.75; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
        });
        ctx.restore();
        c.keys.forEach((k, i) => {
          const ch = bones.some(b => changed(i, b)), on = S.sel.has(k), x = X(k.t);
          if (x < LBL - 8) return;
          glyph(x, cy, k.e, r.kind === 'group' ? 5 : 4.5, on ? C.accent : ch ? r.g!.color : 'transparent', on ? '#fff' : ch ? '#0009' : C.faint);
        });
      }
    }
  }
  // box select
  if (drag?.mode === 'box') { ctx.fillStyle = '#f5c54218'; ctx.strokeStyle = '#f5c542aa'; const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1); ctx.fillRect(x, y, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0)); ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0)); }

  // label column
  ctx.fillStyle = '#1f1f23'; ctx.fillRect(0, RH, LBL, Hh); ctx.fillStyle = C.line; ctx.fillRect(LBL - 1, 0, 1, Hh);
  if (tl.graph) { label('Graph · ' + boneTh(S.bone), 12, RH + 14, C.accent, '600 12px "IBM Plex Sans Thai"'); label('ลากจุดขึ้นลงเพื่อแก้ค่า', 12, RH + 32, C.faint, '11px "IBM Plex Sans Thai"'); label('ซ้ายขวาเพื่อเลื่อนเวลา', 12, RH + 48, C.faint, '11px "IBM Plex Sans Thai"'); }
  else for (const r of R) {
    if (r.y + r.h < RH || r.y > Hh) continue;
    const cy = r.y + r.h / 2;
    if (r.kind === 'master') label('◆  คีย์ทั้งตัว', 12, cy, C.text, '600 12.5px "IBM Plex Sans Thai"');
    else if (r.kind === 'events') label('⚡  อีเวนต์ โดน/ยิง/กระแทก', 12, cy, C.muted, '12px "IBM Plex Sans Thai"');
    else if (r.kind === 'group') { label((tl.open.has(r.g!.id) ? '▾ ' : '▸ '), 10, cy, C.faint); ctx.fillStyle = r.g!.color; ctx.fillRect(26, cy - 5, 3, 10); label(r.g!.th, 36, cy, C.text, '600 12px "IBM Plex Sans Thai"'); }
    else { const on = r.bone === S.bone; if (on) { ctx.fillStyle = '#33302a'; ctx.fillRect(0, r.y, LBL - 1, r.h); } label(boneTh(r.bone!), 40, cy, on ? C.accent : C.muted, '12px "IBM Plex Sans Thai"'); }
  }
  drawRuler(end);
  // playhead
  const px = X(S.t);
  if (px >= LBL - 1) { ctx.fillStyle = C.ph; ctx.fillRect(Math.round(px) - 0.5, RH - 4, 1.5, Hh); ctx.beginPath(); ctx.moveTo(px - 6, 2); ctx.lineTo(px + 6, 2); ctx.lineTo(px + 6, RH - 10); ctx.lineTo(px, RH - 3); ctx.lineTo(px - 6, RH - 10); ctx.fill(); }
}
function step(): [number, number] { // major, minor tick spacing in seconds, fit to zoom
  const fr = frame(), cands = [fr, fr * 2, fr * 5, 0.1, 0.25, 0.5, 1, 2, 5];
  const minor = cands.find(s => s * tl.pps >= 8) ?? 5, major = cands.find(s => s * tl.pps >= 70) ?? 10; return [major, minor];
}
function gridLines(end: number) {
  const [major] = step(); ctx.fillStyle = '#ffffff08';
  for (let t = Math.ceil(T(LBL) / major) * major; X(t) < W; t += major) if (t >= 0) ctx.fillRect(Math.round(X(t)), RH, 1, Hh);
  ctx.fillStyle = '#f5c54266'; ctx.fillRect(Math.round(X(end)), RH, 1, Hh);
}
function drawRuler(end: number) {
  ctx.fillStyle = '#232327'; ctx.fillRect(LBL, 0, W - LBL, RH); ctx.fillStyle = C.line; ctx.fillRect(0, RH - 1, W, 1);
  ctx.fillStyle = '#1f1f23'; ctx.fillRect(0, 0, LBL - 1, RH);
  label(`${S.fps} fps · ${Math.round(end * S.fps)} เฟรม`, 12, RH / 2, C.faint, '11px "IBM Plex Mono", monospace');
  const [major, minor] = step();
  ctx.fillStyle = C.faint;
  for (let t = Math.max(0, Math.ceil(T(LBL) / minor) * minor); X(t) < W; t += minor) ctx.fillRect(Math.round(X(t)), RH - 6, 1, 5);
  for (let t = Math.max(0, Math.ceil(T(LBL) / major) * major); X(t) < W; t += major) {
    const x = Math.round(X(t)); ctx.fillStyle = C.muted; ctx.fillRect(x, RH - 12, 1, 11);
    label(major < 1 ? `${Math.round(t * S.fps)}f` : `${t.toFixed(0)}s`, x + 3, 9, C.muted, '10.5px "IBM Plex Mono", monospace');
  }
  // clip length handle
  const xe = X(end); ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(xe, RH - 1); ctx.lineTo(xe - 7, RH - 1); ctx.lineTo(xe, RH - 11); ctx.fill();
  if (clip().loop) label('↻', xe + 4, RH - 8, C.accent, '12px system-ui');
}

// graph editor: the selected bone's value over time, keys as draggable points
let gRange = { lo: -90, hi: 90 };
function gY(v: number) { return RH + 14 + (1 - (v - gRange.lo) / (gRange.hi - gRange.lo)) * (Hh - RH - 28); }
function gV(y: number) { return gRange.lo + (1 - (y - RH - 14) / (Hh - RH - 28)) * (gRange.hi - gRange.lo); }
function drawGraph(end: number) {
  const c = clip(), S1 = samples(), b: BoneId | 'pos' = S.bone === 'root' && false ? 'pos' : S.bone, g = GROUPS.find(g => g.bones.includes(b))!;
  const vals = g.bones.flatMap(x => S1.v[x]).concat(c.keys.map(k => val(k, b)));
  if (!(drag?.mode === 'gval')) { const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(10, (hi - lo) * 0.15); gRange = { lo: lo - pad, hi: hi + pad }; }
  ctx.fillStyle = C.out; ctx.fillRect(Math.max(LBL, X(end)), RH, W, Hh);
  gridLines(end);
  // horizontal value grid
  const st = [5, 10, 15, 30, 45, 90].find(s => (Hh - RH) / ((gRange.hi - gRange.lo) / s) > 26) ?? 90;
  for (let v = Math.ceil(gRange.lo / st) * st; v < gRange.hi; v += st) { const y = gY(v); ctx.fillStyle = v === 0 ? '#ffffff22' : '#ffffff0a'; ctx.fillRect(LBL, Math.round(y), W, 1); label(`${v}°`, W - 34, y - 7, C.faint, '10px "IBM Plex Mono"'); }
  for (const x of g.bones) {
    const on = x === b; ctx.beginPath();
    S1.v[x].forEach((v, i) => { const xx = X(i * S1.dt), y = gY(v); i ? ctx.lineTo(xx, y) : ctx.moveTo(xx, y); });
    ctx.strokeStyle = on ? C.accent : g.color; ctx.globalAlpha = on ? 1 : 0.28; ctx.lineWidth = on ? 2 : 1.2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  c.keys.forEach(k => { const on = S.sel.has(k); ctx.beginPath(); ctx.arc(X(k.t), gY(val(k, b)), on ? 6 : 4.5, 0, 7); ctx.fillStyle = on ? C.accent : '#fff'; ctx.fill(); ctx.strokeStyle = '#000a'; ctx.stroke(); });
}

// ---- interaction ----
type Drag = { mode: 'scrub' | 'len' | 'keys' | 'box' | 'gval'; x0: number; y0: number; x1: number; y1: number; t0?: number; orig?: Map<ClipKey, number>; key?: ClipKey; v0?: number; moved?: boolean; add?: boolean } | null;
let drag: Drag = null;
const pos = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

function hitKey(x: number, y: number): ClipKey | null {
  const c = clip();
  if (tl.graph) { for (const k of c.keys) if (Math.hypot(X(k.t) - x, gY(val(k, S.bone)) - y) < 8) return k; return null; }
  const r = rows().find(r => y >= r.y && y < r.y + r.h); if (!r) return null;
  if (r.kind === 'events') { let best: ClipKey | null = null, bd = 9; for (const k of c.keys) if ((k.hit || k.shoot || k.thud) && Math.abs(X(k.t) - x) < bd) { bd = Math.abs(X(k.t) - x); best = k; } return best; }
  let best: ClipKey | null = null, bd = 8; for (const k of c.keys) { const d = Math.abs(X(k.t) - x); if (d < bd) { bd = d; best = k; } } return best;
}

cv.addEventListener('pointerdown', e => {
  const { x, y } = pos(e); cv.focus(); S.playing = false;
  if (e.button === 2) return;
  if (y < RH && x > LBL) {
    if (Math.abs(x - X(clipEnd(clip()))) < 8) { begin(); drag = { mode: 'len', x0: x, y0: y, x1: x, y1: y }; }
    else { drag = { mode: 'scrub', x0: x, y0: y, x1: x, y1: y }; setTime(e.shiftKey ? T(x) : snapT(T(x))); }
  } else if (x < LBL) {
    const r = rows().find(r => y >= r.y && y < r.y + r.h);
    if (r?.kind === 'group') { tl.open.has(r.g!.id) ? tl.open.delete(r.g!.id) : tl.open.add(r.g!.id); draw(); }
    else if (r?.kind === 'bone' && r.bone !== 'pos') { S.bone = r.bone!; emit('sel'); }
    else if (r?.kind === 'bone') { S.bone = 'root'; emit('sel'); }
    return;
  } else {
    const k = hitKey(x, y);
    if (k) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) { S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k); }
      else if (!S.sel.has(k)) S.sel = new Set([k]);
      begin();
      if (e.altKey) { // alt-drag duplicates the selection
        const c = clip(), copies = [...S.sel].map(s => ({ ...structuredClone(s) })); c.keys.push(...copies); S.sel = new Set(copies);
      }
      drag = { mode: tl.graph ? 'gval' : 'keys', x0: x, y0: y, x1: x, y1: y, key: k, orig: new Map([...S.sel].map(s => [s, s.t])), v0: val(k, S.bone) };
      setTime(k.t); emit('sel');
    } else drag = { mode: 'box', x0: x, y0: y, x1: x, y1: y, add: e.shiftKey };
  }
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  const { x, y } = pos(e);
  cv.style.cursor = y < RH && Math.abs(x - X(clipEnd(clip()))) < 8 ? 'ew-resize' : hitKey(x, y) ? 'grab' : x < LBL ? 'pointer' : 'default';
  if (!drag) return;
  drag.x1 = x; drag.y1 = y; if (Math.abs(x - drag.x0) + Math.abs(y - drag.y0) > 3) drag.moved = true;
  const c = clip();
  if (drag.mode === 'scrub') setTime(e.shiftKey ? T(x) : snapT(T(x)));
  else if (drag.mode === 'len') { const last = Math.max(...c.keys.map(k => k.t)); c.len = round(Math.max(last, frame(), snapT(T(x)))); emit('clip'); }
  else if (drag.mode === 'keys' || (drag.mode === 'gval' && Math.abs(x - drag.x0) > Math.abs(y - drag.y0) * 1.5)) {
    if (!drag.moved) return;
    let dt = (x - drag.x0) / tl.pps; const minT = Math.min(...drag.orig!.values()); dt = Math.max(-minT, dt);
    for (const [k, t0] of drag.orig!) k.t = round(e.shiftKey ? t0 + dt : snapT(t0 + dt));
    c.len = Math.max(c.len, ...c.keys.map(k => k.t)); setTime(drag.key!.t); emit('clip');
  } else if (drag.mode === 'gval') {
    if (!drag.moved) return;
    const v = Math.round(gV(y) * 10) / 10, k = drag.key!;
    if (S.bone === ('pos' as BoneId)) k.dy = v; else k.a[S.bone] = Math.round((restA[S.bone] + v) * 10) / 10;
    emit('clip');
  } else if (drag.mode === 'box') draw();
});
cv.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.mode === 'box') {
    if (!d.moved) { if (!d.add) S.sel.clear(); setTime(snapT(T(d.x0))); emit('sel'); }
    else {
      const t0 = T(Math.min(d.x0, d.x1)), t1 = T(Math.max(d.x0, d.x1)); if (!d.add) S.sel.clear();
      for (const k of clip().keys) if (k.t >= t0 && k.t <= t1) S.sel.add(k);
      emit('sel');
    }
    draw();
  } else if (d.mode === 'keys' || d.mode === 'gval' || d.mode === 'len') {
    // two keys on the same frame: the moved one wins
    const c = clip(), seen = new Map<number, ClipKey>();
    for (const k of [...c.keys].sort((a, b) => (S.sel.has(a) ? 1 : 0) - (S.sel.has(b) ? 1 : 0))) seen.set(Math.round(k.t * 1000), k);
    c.keys = [...seen.values()].sort((a, b) => a.t - b.t);
    commit();
  }
  try { cv.releasePointerCapture(e.pointerId); } catch { /* */ }
});
cv.addEventListener('dblclick', e => { const { x, y } = pos(e); if (x > LBL && y > RH && !hitKey(x, y)) addKey(snapT(T(x))); });
cv.addEventListener('contextmenu', e => {
  e.preventDefault(); const { x, y } = pos(e), k = hitKey(x, y);
  if (k && !S.sel.has(k)) { S.sel = new Set([k]); emit('sel'); }
  const t = snapT(T(x));
  menu(e.clientX, e.clientY, k ? [
    ...EASES.map(es => ({ label: `easing: ${EASE_TH[es]}`, run: () => edit(() => S.sel.forEach(s => (s.e = es))) })), '-',
    { label: 'ใส่จังหวะโดน (hit)', run: () => edit(() => S.sel.forEach(s => (s.hit ??= { t: 'high', dmg: 10, push: 16 }))) },
    { label: 'ลบจังหวะโดน', run: () => edit(() => S.sel.forEach(s => { delete s.hit; delete s.shoot; })) },
    { label: 'คัดลอก', kbd: 'Ctrl+C', run: () => copyKeys() },
    { label: 'วางที่หัวอ่าน', kbd: 'Ctrl+V', run: () => pasteKeys() },
    { label: 'สลับซ้าย/ขวา', kbd: 'M', run: () => mirrorSel() }, '-',
    { label: 'ลบคีย์', kbd: 'Del', run: () => deleteKeys() },
  ] : [
    { label: 'ใส่คีย์ตรงนี้', kbd: 'S', run: () => addKey(t) },
    { label: 'วางคีย์ตรงนี้', kbd: 'Ctrl+V', run: () => { setTime(t); pasteKeys(); } },
    { label: 'ตั้งความยาวคลิปตรงนี้', run: () => edit(() => { const c = clip(); c.len = Math.max(t, ...c.keys.map(k => k.t)); }) },
    { label: 'เลือกทุกคีย์', kbd: 'Ctrl+A', run: () => { S.sel = new Set(clip().keys); emit('sel'); } },
  ]);
});
cv.addEventListener('wheel', e => {
  e.preventDefault(); const { x } = pos(e);
  if (e.ctrlKey || e.altKey || e.metaKey) { const t = T(x); tl.pps = Math.max(20, Math.min(4000, tl.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); tl.scroll = t - (x - LBL) / tl.pps; }
  else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || tl.graph) tl.scroll = Math.max(-40 / tl.pps, tl.scroll + (e.deltaX || e.deltaY) / tl.pps);
  else { const R = rows(), total = R[R.length - 1].y + R[R.length - 1].h + tl.vscroll - RH, max = Math.max(0, total - (Hh - RH)); tl.vscroll = Math.max(0, Math.min(max, tl.vscroll + e.deltaY)); }
  draw();
}, { passive: false });

function resize() {
  const r = cv.getBoundingClientRect(); W = r.width; Hh = r.height;
  cv.width = Math.round(W * devicePixelRatio); cv.height = Math.round(Hh * devicePixelRatio);
  if (tl.fitNext) { tl.fitNext = false; fit(); } else draw();
}
new ResizeObserver(resize).observe(cv);
on(['clip', 'time', 'sel', 'view'], draw);
on(['lib'], () => { /* a different clip may be open */ });
export function onClipOpened() { tl.fitNext = false; fit(); tl.vscroll = 0; }
export { EASE_FN, toast };
