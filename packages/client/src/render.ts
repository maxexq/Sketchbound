// Draws one frame of the zone as SVG, from server snapshots. Ported from the prototype's mapDraw.
import { rig, MOBS, rng, roadZ, inPond, type Layout, type PlayerView, type MobView, type ShotView } from '@sticky/shared';
import { figureSvg, shotArt, treeArt, swirlSvg, sparkSvg, DEFS, LNK } from './art';

const R = rig as unknown as {
  INK: string; PAPER: string; GROUND: number; ELEMENTS: Record<string, { c: string[] }>; BONES: { id: string }[];
  mkPose: (d: object) => Pose; animate: (n: string, t: number) => { pose: Pose; hand: string; wind: number };
  animLen: (n: string) => number; norm: (a: number) => number; TRACKS: Record<string, unknown>;
};
const { INK, PAPER, GROUND, ELEMENTS } = R;
interface Pose { x: number; y: number; a: Record<string, number> }

export const VIEW = { w: 640, h: 400 }, ZK = 0.6, SCALE = 0.42;
const f1 = (v: number) => v.toFixed(1);
const TXT = `paint-order="stroke" stroke="${PAPER}" stroke-width="3" stroke-linejoin="round" fill="${INK}"`;
const bar = (x: number, y: number, w: number, h: number, k: number, op: number) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${w}" height="${h}" rx="1.2" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>` +
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w * Math.max(0, Math.min(1, k)))}" height="${h}" rx="1.2" fill="${INK}" opacity="${op}"/>`;

/** static ground: paper, grid, road, pond, rocks, grass, signpost */
export function groundSvg(L: Layout): string {
  const d = L.def, W = d.width, H = d.depth * ZK, G = rng(d.seed + 1);
  let g = `<rect x="-80" y="-80" width="${W + 160}" height="${H + 160}" fill="url(#h1)" opacity=".55"/><rect x="0" y="0" width="${W}" height="${H}" fill="${PAPER}" stroke="${INK}" stroke-width="2.2"/>`;
  let grid = ''; for (let x = 40; x < W; x += 40) grid += `M${x},0 L${x},${H} `; for (let z = 40; z < d.depth; z += 40) grid += `M0,${z * ZK} L${W},${z * ZK} `;
  g += `<path d="${grid}" fill="none" stroke="${INK}" stroke-width=".7" opacity=".07"/>`;
  const pd = 'M' + d.road.map(([x, z]) => x + ',' + f1(z * ZK)).join(' L');
  g += `<path d="${pd}" ${LNK} stroke-width="33" opacity=".3"/><path d="${pd}" fill="none" stroke="#e7e6e3" stroke-width="30.5" stroke-linejoin="round"/>`;
  let peb = ''; for (let i = 0; i < 70; i++) { const x = G() * W, y = (roadZ(d, x) + (G() - 0.5) * 38) * ZK; peb += `M${f1(x)},${f1(y)} l${f1(3 + G() * 5)},0 `; }
  g += `<path d="${peb}" ${LNK} stroke-width="1.1" opacity=".45"/>`;
  const P = d.pond, py = P.z * ZK, pry = P.rz * ZK;
  g += `<ellipse cx="${P.x}" cy="${py}" rx="${P.rx}" ry="${pry}" fill="${PAPER}" stroke="${INK}" stroke-width="1.8"/><ellipse cx="${P.x}" cy="${py}" rx="${P.rx}" ry="${pry}" fill="url(#h1)"/>` +
    `<path d="M${P.x - 80},${py - 12} q20,-7 40,0 M${P.x + 10},${py + 14} q24,-8 48,0 M${P.x - 40},${py + 26} q16,-6 32,0 M${P.x + 40},${py - 24} q14,-5 28,0" ${LNK} stroke-width="1.2" opacity=".7"/>`;
  const sx = L.sign.x, sy = L.sign.z * ZK;
  g += `<path d="M${sx},${sy} L${sx},${sy - 30}" ${LNK} stroke-width="2.4"/><rect x="${sx - 34}" y="${sy - 44}" width="68" height="18" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/><text x="${sx}" y="${sy - 31}" text-anchor="middle" font-size="11" fill="${INK}">${d.th}</text>`;
  for (const r of L.rocks) g += `<g transform="translate(${f1(r.x)} ${f1(r.z * ZK)}) scale(${r.k.toFixed(2)})"><path d="M-13,2 L-10,-9 L-2,-14 L9,-10 L14,-1 L9,4 L-8,4Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><path d="M-13,2 L-10,-9 L-2,-14 L-1,4 L-8,4Z" fill="url(#h2)" opacity=".8"/><path d="M-2,-14 L1,-4 L9,-10 M1,-4 L-1,4" ${LNK} stroke-width="1"/></g>`;
  let tuft = '', fl = '';
  for (let i = 0; i < 230; i++) {
    const x = G() * W, z = G() * d.depth; if (Math.abs(z - roadZ(d, x)) < 24 || inPond(d, x, z, 4)) continue; const y = z * ZK;
    tuft += `M${f1(x)},${f1(y)} l-3,-6 M${f1(x)},${f1(y)} l0,-8 M${f1(x)},${f1(y)} l3.5,-6 `;
    if (i % 6 === 0) fl += `<circle cx="${f1(x + 9)}" cy="${f1(y - 3)}" r="2.2" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>`;
  }
  return g + `<path d="${tuft}" ${LNK} stroke-width="1" opacity=".5"/>${fl}`;
}

export function treeSvgs(L: Layout) { return L.trees.map(t => ({ x: t.x, z: t.z, svg: treeArt(rng(t.seed)) })); }

// ---- bodies: animation runs on the client from the server's {anim name, start time}; springs add follow-through ----
const STIFF: Record<string, number> = { root: 900, spine: 900, head: 260, wing: 150, armR_u: 1100, armR_l: 1000, handR: 900, armL_u: 520, armL_l: 330, handL: 260, legL_u: 900, legL_l: 800, legR_u: 900, legR_l: 800 };
const spring = (x: number, v: number, t: number, k: number, h: number, z = 0.62): [number, number] => {
  const a = k * (t - x) - 2 * z * Math.sqrt(k) * v; v += a * h; return [x + v * h, v];
};
export interface Body { disp: Pose; vel: Pose; sway: number; swayV: number; hand: string }
export const newBody = (): Body => ({ disp: R.mkPose({}), vel: { x: 0, y: 0, a: Object.fromEntries(R.BONES.map(b => [b.id, 0])) }, sway: 0, swayV: 0, hand: 'relax' });

export function stepBody(b: Body, p: PlayerView, now: number, dt: number) {
  const A = p.anim; let t = (now - A.t0) * A.r;
  if (!A.loop && R.TRACKS[A.n]) t = Math.min(Math.max(0, t), R.animLen(A.n) - 1e-3);
  const r = R.animate(A.n, Math.max(0, t)), tgt = r.pose; b.hand = r.hand;
  const n = Math.max(1, Math.round(dt / 0.004)), h = dt / n, d = b.disp, v = b.vel;
  for (let i = 0; i < n; i++) {
    [d.x, v.x] = spring(d.x, v.x, tgt.x, 900, h); [d.y, v.y] = spring(d.y, v.y, tgt.y, 900, h);
    for (const id in STIFF) { const goal = d.a[id] + R.norm(tgt.a[id] - d.a[id]); [d.a[id], v.a[id]] = spring(d.a[id], v.a[id], goal, STIFF[id], h); }
    const sT = Math.max(-45, Math.min(45, r.wind + v.x * 0.05 - v.y * 0.02)) + (r.wind ? Math.sin(now * 13) * 5 : 0);
    [b.sway, b.swayV] = spring(b.sway, b.swayV, sT, 90, h);
  }
}

function mobSvg(m: MobView, now: number, t: number): string {
  const hop = m.moving ? Math.abs(Math.sin(t * 7)) * 7 : Math.abs(Math.sin(t * 2.2)) * 1.5, sq = m.moving ? Math.sin(t * 14) * 0.08 : Math.sin(t * 2.2) * 0.04;
  const hurt = now - m.hurtT < 0.16 ? Math.sin(now * 90) * 3 : 0, lunge = now - m.lungeT < 0.2 ? Math.sin((now - m.lungeT) / 0.2 * Math.PI) * 12 : 0;
  let body;
  if (m.kind === 'scrib') body = `<ellipse cx="0" cy="-11" rx="12.5" ry="10.5" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/><path d="M-9,-12 q4,-10 10,-2 q4,6 -4,8 q-9,2 -8,-6 q2,-8 12,-4 q6,4 0,10 q-8,5 -12,-2 q-3,-9 8,-12" ${LNK} stroke-width="1"/><circle cx="3.5" cy="-13" r="1.7" fill="${INK}"/><circle cx="8.5" cy="-12.5" r="1.7" fill="${INK}"/>`;
  else if (m.kind === 'blot') body = `<path d="M0,-27 q3,6 9,5 q8,-2 6,6 q8,1 6,8 q-1,8 -9,7 l2,3 l-6,-2 q-8,3 -14,-1 l-5,3 l1,-5 q-7,-3 -5,-10 q-5,-6 3,-9 q-2,-8 6,-6 q3,-1 6,-9z" fill="${INK}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="2" cy="-12" r="2.8" fill="${PAPER}"/><circle cx="9" cy="-12" r="2.8" fill="${PAPER}"/><circle cx="3" cy="-12" r="1.1" fill="${INK}"/><circle cx="10" cy="-12" r="1.1" fill="${INK}"/><path d="M-9,-14 q1,-5 5,-7" fill="none" stroke="${PAPER}" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>`;
  else body = `<path d="M-9,-7 L-9,0 M7,-7 L7,0" ${LNK} stroke-width="4.2"/><path d="M-17,-32 L13,-32 L13,-7 L-17,-7Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-17,-32 L-11,-38 L19,-38 L13,-32Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-17,-32 L-11,-38 L19,-38 L13,-32Z" fill="url(#h1)"/><path d="M13,-32 L19,-38 L19,-13 L13,-7Z" fill="${INK}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-17,-18 L13,-18" ${LNK} stroke-width="1.2"/><path d="M-8,-27 l5,2 M7,-27 l-5,2" ${LNK} stroke-width="1.6"/><circle cx="-5" cy="-23" r="1.5" fill="${INK}"/><circle cx="4" cy="-23" r="1.5" fill="${INK}"/>`;
  let sy = 1 - sq, sx = 1 + sq, op = 1;
  if (m.dead) { const k = Math.min(1, (now - m.deadT) / 0.5); sy = 1 - 0.85 * k; sx = 1 + 0.5 * k; op = 1 - k; if (op <= 0) return ''; }
  return `<ellipse cx="0" cy="0" rx="13" ry="4" fill="${INK}" opacity="${(0.16 * op).toFixed(2)}"/><g opacity="${op.toFixed(2)}" transform="translate(${f1(hurt + lunge * m.dir)} ${f1(-hop)}) scale(${(m.dir * sx).toFixed(3)} ${sy.toFixed(3)})">${body}</g>`;
}

export interface Float { x: number; z: number; h: number; txt: string; kind: 'dmg' | 'crit' | 'hurt' | 'info' | 'lvl'; t: number }
export interface Spark { x: number; z: number; h: number; t: number; c: string[] }
export interface Frame {
  L: Layout; trees: { x: number; z: number; svg: string }[]; now: number; clock: number;
  me: PlayerView | undefined; players: PlayerView[]; bodies: Map<number, Body>; mobs: MobView[]; shots: ShotView[];
  floats: Float[]; sparks: Spark[]; mark: { x: number; z: number; t: number } | null; cam: { x: number; y: number }; online: number;
}

/** returns [ground transform, overlay svg] */
export function drawFrame(F: Frame): [string, string] {
  const d = F.L.def, c = F.cam, P = (x: number, z: number) => [x - c.x, z * ZK - c.y];
  let out = '';
  if (F.mark && F.clock - F.mark.t < 0.6) {
    const [x, y] = P(F.mark.x, F.mark.z), k = (F.clock - F.mark.t) / 0.6;
    out += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(10 + 10 * k)}" ry="${f1(4 + 4 * k)}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-dasharray="5 4" opacity="${(1 - k).toFixed(2)}"/>`;
  }
  for (const q of F.L.portals) {
    const [x, y] = P(q.x, q.z);
    out += `<g transform="translate(${f1(x)} ${f1(y)}) scale(1 .45)">${swirlSvg(0, 0, F.clock * 0.6, 1, 1.25)}</g><text x="${f1(x)}" y="${f1(y + 24)}" text-anchor="middle" font-size="10" ${TXT}>วาร์ป</text>`;
  }
  const tgt = F.me?.target != null ? F.mobs.find(m => m.id === F.me!.target) : undefined;
  if (tgt && !tgt.dead) {
    const [x, y] = P(tgt.x, tgt.z);
    out += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="19" ry="7" fill="none" stroke="${INK}" stroke-width="1.8" stroke-dasharray="6 4" stroke-dashoffset="${f1(F.clock * 30)}"/>`;
  }
  const D: [number, string][] = [];
  const onScreen = (x: number, y: number, m = 80) => x > -m && x < VIEW.w + m && y > -m && y < VIEW.h + m * 1.5;
  for (const t of F.trees) { const [x, y] = P(t.x, t.z); if (onScreen(x, y)) D.push([t.z, `<g transform="translate(${f1(x)} ${f1(y)})">${t.svg}</g>`]); }
  for (const m of F.mobs) {
    const [x, y] = P(m.x, m.z); if (!onScreen(x, y)) continue; const s = mobSvg(m, F.now, F.clock + m.id); if (!s) continue; const K = MOBS[m.kind];
    let h = `<g transform="translate(${f1(x)} ${f1(y)})">${s}</g>`;
    if (!m.dead && (m.hp < K.hp || m === tgt)) h += bar(x - 13, y - K.height - 9, 26, 3.4, m.hp / K.hp, 0.85) + `<text x="${f1(x)}" y="${f1(y + 14)}" text-anchor="middle" font-size="9.5" ${TXT}>${K.th}</text>`;
    D.push([m.z, h]);
  }
  for (const a of F.players) {
    const [x, y] = P(a.x, a.z); if (!onScreen(x, y)) continue; const b = F.bodies.get(a.id); if (!b) continue; const mine = a.id === F.me?.id;
    let h = `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="11" ry="3.6" fill="${INK}" opacity=".16"/>` +
      `<g transform="translate(${f1(x)} ${f1(y)}) scale(${SCALE}) translate(0 ${-GROUND})">` +
      figureSvg({ eq: a.eq, pose: b.disp, px: 0, dir: a.dir, sw: b.sway, hand: b.hand, idx: a.id, trail: '', noHit: true }) + `</g>`;
    h += `<text x="${f1(x)}" y="${f1(y + 15)}" text-anchor="middle" font-size="10" font-weight="${mine ? 700 : 400}" ${TXT}>${esc(a.name)} Lv.${a.lv}</text>`;
    h += bar(x - 16, y + 19, 32, 3.2, a.hp / a.maxHp, 0.85) + (mine ? bar(x - 16, y + 23.6, 32, 2.6, a.sp / a.maxSp, 0.4) : '');
    D.push([a.z + 0.5, h]);
  }
  D.sort((a, b) => a[0] - b[0]); out += D.map(d => d[1]).join('');
  for (const q of F.shots) { const [x, y] = P(q.x, q.z); out += `<g transform="translate(${f1(x)} ${f1(y - q.h)}) rotate(${q.ang}) scale(.8)">${shotArt(q.kind, ELEMENTS[q.el]?.c ?? ELEMENTS.mono.c, F.now - q.t)}</g>`; }
  for (const s of F.sparks) { const [x, y] = P(s.x, s.z); out += sparkSvg([{ x, y: y - s.h, t: s.t, c: s.c, k: 0 }], F.clock); }
  for (const fl of F.floats) {
    const k = F.clock - fl.t; if (k > 1) continue; const [x, y] = P(fl.x, fl.z), big = fl.kind === 'crit' || fl.kind === 'lvl';
    out += `<text x="${f1(x)}" y="${f1(y - fl.h - 34 * k * (2 - k))}" text-anchor="middle" font-size="${fl.kind === 'lvl' ? 17 : big ? 18 : fl.kind === 'info' ? 10.5 : fl.kind === 'hurt' ? 12 : 14}" font-weight="700" class="disp" opacity="${Math.min(1, (1 - k) * 2.2).toFixed(2)}" ${TXT}>${fl.txt}</text>`;
  }
  const p = F.me;
  if (p) {
    out += `<rect x="8" y="8" width="150" height="46" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="1.4" opacity=".95"/><text x="16" y="23" font-size="11.5" font-weight="700" fill="${INK}">${esc(p.name)}  Lv.${p.lv}</text>` +
      `<text x="16" y="36" font-size="8.5" fill="${INK}">HP</text>` + bar(34, 29.5, 84, 6, p.hp / p.maxHp, 0.85) + `<text x="122" y="36" font-size="8.5" fill="${INK}">${p.hp}</text>` +
      `<text x="16" y="47" font-size="8.5" fill="${INK}">SP</text>` + bar(34, 40.5, 84, 6, p.sp / p.maxSp, 0.4) + `<text x="122" y="47" font-size="8.5" fill="${INK}">${p.sp}</text>` +
      bar(8, 392, 624, 3.4, p.exp / (p.lv * 40), 0.7) + `<text x="320" y="388" text-anchor="middle" font-size="8.5" ${TXT}>EXP ${p.exp} / ${p.lv * 40}</text>`;
  }
  const mx = 536, my = 8, mw = 96, mh = 64, kx = mw / d.width, kz = mh / d.depth;
  out += `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="1.4" opacity=".95"/>` +
    `<path d="M${d.road.map(([x, z]) => f1(mx + Math.max(0, Math.min(d.width, x)) * kx) + ',' + f1(my + z * kz)).join(' L')}" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".3"/>` +
    `<ellipse cx="${mx + d.pond.x * kx}" cy="${my + d.pond.z * kz}" rx="${d.pond.rx * kx}" ry="${d.pond.rz * kz}" fill="url(#h2)" opacity=".6"/>`;
  for (const m of F.mobs) if (!m.dead) out += `<circle cx="${f1(mx + m.x * kx)}" cy="${f1(my + m.z * kz)}" r="1.2" fill="${INK}" opacity=".45"/>`;
  for (const a of F.players) out += a.id === p?.id
    ? `<path d="M${f1(mx + a.x * kx)},${f1(my + a.z * kz - 3.5)} l3,6 l-6,0Z" fill="${INK}"/>`
    : `<circle cx="${f1(mx + a.x * kx)}" cy="${f1(my + a.z * kz)}" r="2" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>`;
  out += `<text x="${mx + mw / 2}" y="${my + mh + 11}" text-anchor="middle" font-size="9" ${TXT}>${d.th} · ออนไลน์ ${F.online}</text>`;
  return [`translate(${f1(-c.x)} ${f1(-c.y)})`, out];
}

export const DEFS_SVG = DEFS;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
