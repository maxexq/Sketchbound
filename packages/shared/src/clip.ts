// Clip format shared by the game, Pose Studio and the MCP server.
// A clip is a list of whole-body keyframes on one timeline. It converts to the rig's
// keyframe-track format (rig.TRACKS) so the game plays a saved clip exactly like a built-in move.
import * as rig from './rig';
import clipPack from './data/clips.json';

export const BONE_IDS = ['root', 'spine', 'wing', 'head', 'armL_u', 'armL_l', 'handL', 'armR_u', 'armR_l', 'handR', 'legL_u', 'legL_l', 'legR_u', 'legR_l'] as const;
export type BoneId = (typeof BONE_IDS)[number];

export const EASES = ['lin', 'io', 'out', 'in', 'back', 'step'] as const;
export type Ease = (typeof EASES)[number];
export const EASE_TH: Record<Ease, string> = { lin: 'เส้นตรง', io: 'นุ่ม เข้า-ออก', out: 'พุ่งแล้วเบรก', in: 'ค่อยๆ เร่ง', back: 'เลยแล้วเด้งกลับ', step: 'กระโดดทันที' };

export const HANDS = ['relax', 'open', 'fist', 'point', 'peace', 'chop', 'claw', 'grip'] as const;
export type Hand = (typeof HANDS)[number];

export const CLIP_KINDS = ['idle', 'walk', 'run', 'attack', 'skill', 'hold', 'emote', 'react', 'jump'] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];
export const KIND_TH: Record<ClipKind, string> = { idle: 'ยืน', walk: 'เดิน', run: 'วิ่ง', attack: 'โจมตี', skill: 'สกิล', hold: 'ถืออาวุธ', emote: 'อีโมต', react: 'ท่าโดน', jump: 'กระโดด' };

export type HitType = 'high' | 'low' | 'launch';
export interface Hit { t: HitType; push: number; dmg: number; kick?: boolean }
export interface Shot { kind: 'arrow' | 'bullet' | 'orb' | 'nova'; hit: Hit }

/** One whole-body key. Angles are degrees local to the parent bone (same as rig poses); dx/dy move the hips from the stand spot. */
export interface ClipKey {
  t: number;              // seconds from clip start
  e: Ease;                // easing used to arrive at this key
  dx: number; dy: number;
  a: Partial<Record<BoneId, number>>; // missing bones use the rest angle
  h?: Hand;               // free-hand shape from this key on
  hit?: Hit;              // melee impact when this key is reached
  shoot?: Shot;           // projectile leaves when this key is reached
  thud?: boolean;         // body hits the floor (camera shake)
}

export type Mask = 'full' | 'upper';
export interface Clip {
  v: 1;
  id: string;
  name: string;
  kind: ClipKind;
  loop: boolean;
  len: number;            // seconds; >= last key time
  rate?: number;          // playback speed in game (1 = as authored)
  keys: ClipKey[];
  rootMotion?: number;    // px the character really travels per play (attacks) or per cycle (walk/run)
  mask?: Mask;            // 'upper' = only arms, hands and head; blends over the stand/walk/run legs
  weapon?: string;        // weapon id this clip is made for, or 'any'
  drag?: number;          // follow-through: limbs further down the chain arrive later (0..0.5); default by ease
  aim?: boolean;          // arm + weapon rotate toward the aim direction in game
  comboEnd?: boolean;     // last hit of a combo
  updated?: string;       // ISO time, set by the store
}

export interface Bindings { hold?: string; idle?: string; walk?: string; run?: string; attack?: string; skills?: string[] }
export interface ClipPack { v: 1; clips: Record<string, Clip>; bindings: Record<string, Bindings> }

export interface Pose { x: number; y: number; a: Record<BoneId, number> }
interface BoneDef { id: BoneId; th: string; parent: BoneId | null; len: number; rest: number; d: number; at?: number; ox?: number; oy?: number }
export const BONES = rig.BONES as unknown as BoneDef[];
export const BMAP = rig.BMAP as unknown as Record<BoneId, BoneDef>;
export const HOME = rig.HOME as { x: number; y: number };
export const UPPER: BoneId[] = ['head', 'armL_u', 'armL_l', 'handL', 'armR_u', 'armR_l', 'handR'];

export const norm = (a: number) => ((a + 180) % 360 + 360) % 360 - 180;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
export const EASE_FN: Record<Ease, (k: number) => number> = {
  lin: k => k,
  io: k => k * k * (3 - 2 * k),
  out: k => 1 - Math.pow(1 - k, 4),
  in: k => k * k * k,
  back: k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  step: k => (k >= 1 ? 1 : 0),
};
// the game's evalTrack looks easings up by name, so teach it the new ones too
Object.assign(rig.EASE as Record<string, (k: number) => number>, EASE_FN);
const DEFAULT_DRAG: Record<Ease, number> = { lin: 0, io: 0.2, out: 0.35, in: 0.15, back: 0.3, step: 0 };

export function restPose(): Pose {
  const a = {} as Record<BoneId, number>; for (const b of BONES) a[b.id] = b.rest;
  return { x: HOME.x, y: HOME.y, a };
}
export function keyPose(k: Pick<ClipKey, 'dx' | 'dy' | 'a'>): Pose {
  const p = restPose(); p.x += k.dx; p.y += k.dy;
  for (const id of BONE_IDS) if (k.a[id] !== undefined) p.a[id] = k.a[id]!;
  return p;
}
/** full angles for every bone, rounded for storage */
export function poseToKeyFields(p: Pose): Pick<ClipKey, 'dx' | 'dy' | 'a'> {
  const r = (v: number) => Math.round(v * 10) / 10;
  const a: Partial<Record<BoneId, number>> = {}; for (const id of BONE_IDS) a[id] = r(p.a[id]);
  return { dx: r(p.x - HOME.x), dy: r(p.y - HOME.y), a };
}

export const sortKeys = (c: Clip) => { c.keys.sort((x, y) => x.t - y.t); return c; };
export const clipEnd = (c: Clip) => Math.max(c.len, c.keys.length ? c.keys[c.keys.length - 1].t : 0);

export interface ClipSample { pose: Pose; hand: Hand; key: number; root: number }
/**
 * Pose at time t. Same maths as the game's evalTrack: each segment eases into its arrival key,
 * and bones deeper in the chain lag a little (drag) so limbs whip instead of moving as one block.
 * A looping clip blends from the last key back into the first.
 */
export function evalClip(c: Clip, t: number): ClipSample {
  const K = c.keys, end = clipEnd(c);
  if (!K.length) return { pose: restPose(), hand: 'relax', key: -1, root: 0 };
  let u = c.loop ? ((t % end) + end) % end : Math.max(0, Math.min(t, end));
  const cycles = c.loop ? Math.floor(t / end) : 0;
  let i = 0; while (i < K.length && K[i].t <= u) i++;
  // i = index of the arrival key; previous key = i-1
  let A: ClipKey, B: ClipKey, t0: number, t1: number;
  if (i === 0) { // before the first key
    if (c.loop) { A = K[K.length - 1]; B = K[0]; t0 = A.t - end; t1 = B.t; }
    else { const k = K[0]; return { pose: keyPose(k), hand: k.h ?? 'relax', key: 0, root: rootAt(c, u, cycles) }; }
  } else if (i === K.length) { // after the last key
    if (c.loop && K.length > 1) { A = K[K.length - 1]; B = K[0]; t0 = A.t; t1 = B.t + end; }
    else { const k = K[K.length - 1]; return { pose: keyPose(k), hand: handAt(K, K.length - 1), key: K.length - 1, root: rootAt(c, u, cycles) }; }
  } else { A = K[i - 1]; B = K[i]; t0 = A.t; t1 = B.t; }
  const PA = keyPose(A), PB = keyPose(B), f = EASE_FN[B.e] ?? EASE_FN.lin;
  const k = t1 > t0 ? clamp01((u - t0) / (t1 - t0)) : 1, L = c.drag ?? DEFAULT_DRAG[B.e] ?? 0;
  const kk = (d: number) => f(clamp01(k * (1 + L) - (L * d) / 4));
  const a = {} as Record<BoneId, number>;
  for (const b of BONES) a[b.id] = PA.a[b.id] + norm(PB.a[b.id] - PA.a[b.id]) * kk(b.d);
  const k0 = kk(0), bi = i === K.length ? 0 : i, ai = (bi - 1 + K.length) % K.length;
  return { pose: { x: PA.x + (PB.x - PA.x) * k0, y: PA.y + (PB.y - PA.y) * k0, a }, hand: k > 0.4 ? handAt(K, bi) : handAt(K, ai), key: k >= 1 ? bi : -1, root: rootAt(c, u, cycles) };
}
function handAt(K: ClipKey[], i: number): Hand { for (let j = i; j >= 0; j--) if (K[j].h) return K[j].h!; return 'relax'; }
/** how far root motion has carried the character at time u of the current cycle */
function rootAt(c: Clip, u: number, cycles: number) {
  const m = c.rootMotion ?? 0, end = clipEnd(c);
  if (!m || !end) return 0;
  return c.loop ? m * (cycles + u / end) : m * EASE_FN.io(clamp01(u / end));
}

/** upper-body clips (weapon holds) ride on top of a base pose */
export function composePose(base: Pose, over: Pose, mask: Mask = 'upper'): Pose {
  if (mask === 'full') return over;
  const a = { ...base.a }; for (const id of UPPER) a[id] = over.a[id];
  return { x: base.x, y: base.y, a };
}

const SWAP: [BoneId, BoneId][] = [['armL_u', 'armR_u'], ['armL_l', 'armR_l'], ['handL', 'handR'], ['legL_u', 'legR_u'], ['legL_l', 'legR_l']];
/** swap left and right limbs (same facing) */
export function mirrorKey<K extends Pick<ClipKey, 'a'>>(k: K): K {
  const a = { ...k.a };
  for (const [l, r] of SWAP) { const v = a[l]; a[l] = a[r]; a[r] = v; if (a[l] === undefined) delete a[l]; if (a[r] === undefined) delete a[r]; }
  return { ...k, a };
}

/** rig track (what rig.animate plays) from a clip */
export function clipToTrack(c: Clip) {
  const K = [...c.keys].sort((x, y) => x.t - y.t), mk = rig.mkTrack as (keys: unknown[], shift?: number) => unknown[];
  const defs: unknown[] = []; let prev = 0;
  const push = (k: ClipKey, d: number) => defs.push({ d: Math.max(1e-3, d), e: k.e, def: { dx: k.dx, dy: k.dy, a: k.a }, h: k.h, hit: k.hit, shoot: k.shoot, thud: k.thud });
  K.forEach(k => { push(k, k.t - prev); prev = Math.max(prev + 1e-3, k.t); });
  if (c.loop && K.length) push(K[0], clipEnd(c) - prev + K[0].t);
  else if (clipEnd(c) > prev + 1e-3 && K.length) push(K[K.length - 1], clipEnd(c) - prev);
  return mk(defs, c.loop ? 0 : c.rootMotion ?? 0);
}

type TrackKey = { t0: number; t1: number; e: string; p: Pose; hit: Hit | null; shoot: Shot | null; thud: boolean; h: string };
/** clip from a built-in rig track (used for templates) */
export function trackToClip(id: string, name: string, kind: ClipKind, track: TrackKey[] & { shift?: number }): Clip {
  const keys: ClipKey[] = [{ t: 0, e: 'lin', ...poseToKeyFields(restPose()), h: 'relax' }];
  for (const k of track) {
    const key: ClipKey = { t: round3(k.t1), e: (EASES as readonly string[]).includes(k.e) ? (k.e as Ease) : 'io', ...poseToKeyFields(k.p) };
    if (k.h) key.h = k.h as Hand; if (k.hit) key.hit = { ...k.hit }; if (k.shoot) key.shoot = { kind: k.shoot.kind, hit: { ...k.shoot.hit } }; if (k.thud) key.thud = true;
    keys.push(key);
  }
  return { v: 1, id, name, kind, loop: false, len: keys[keys.length - 1].t, keys, rootMotion: track.shift || 0, mask: 'full', weapon: 'any' };
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** clip sampled from a procedural rig animation (idle breathing, run cycle, ...) */
export function sampleToClip(id: string, name: string, kind: ClipKind, period: number, n: number, fn: (t: number) => { pose: Pose; hand: string }, extra: Partial<Clip> = {}): Clip {
  const keys: ClipKey[] = [];
  for (let i = 0; i < n; i++) { const t = (period * i) / n, r = fn(t); keys.push({ t: round3(t), e: 'io', ...poseToKeyFields(r.pose), h: r.hand as Hand }); }
  return { v: 1, id, name, kind, loop: true, len: round3(period), keys, mask: 'full', weapon: 'any', drag: 0, ...extra };
}

// ---- validation ----
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const CLIP_ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
export function validateClip(c: unknown): string[] {
  const e: string[] = [], x = c as Clip;
  if (!x || typeof x !== 'object') return ['clip must be an object'];
  if (x.v !== 1) e.push('v must be 1');
  if (typeof x.id !== 'string' || !CLIP_ID.test(x.id)) e.push('id must match ' + CLIP_ID);
  if (typeof x.name !== 'string' || !x.name) e.push('name is required');
  if (!(CLIP_KINDS as readonly string[]).includes(x.kind)) e.push('kind must be one of ' + CLIP_KINDS.join(','));
  if (typeof x.loop !== 'boolean') e.push('loop must be boolean');
  if (!isNum(x.len) || x.len <= 0 || x.len > 30) e.push('len must be 0 < len <= 30 seconds');
  if (!Array.isArray(x.keys) || !x.keys.length) e.push('keys must be a non-empty array');
  else x.keys.forEach((k, i) => {
    if (!isNum(k.t) || k.t < 0) e.push(`keys[${i}].t must be >= 0`);
    if (!(EASES as readonly string[]).includes(k.e)) e.push(`keys[${i}].e must be one of ${EASES.join(',')}`);
    if (!isNum(k.dx) || !isNum(k.dy)) e.push(`keys[${i}].dx/dy must be numbers`);
    if (!k.a || typeof k.a !== 'object') e.push(`keys[${i}].a must be an object of bone angles`);
    else for (const [b, v] of Object.entries(k.a)) { if (!(BONE_IDS as readonly string[]).includes(b)) e.push(`keys[${i}].a.${b} is not a bone`); else if (!isNum(v)) e.push(`keys[${i}].a.${b} must be a number`); }
    if (k.h !== undefined && !(HANDS as readonly string[]).includes(k.h)) e.push(`keys[${i}].h must be one of ${HANDS.join(',')}`);
    if (k.hit && (!['high', 'low', 'launch'].includes(k.hit.t) || !isNum(k.hit.dmg) || !isNum(k.hit.push))) e.push(`keys[${i}].hit needs t (high|low|launch), dmg, push`);
  });
  if (x.mask !== undefined && x.mask !== 'full' && x.mask !== 'upper') e.push('mask must be full or upper');
  return e;
}

// ---- the game's clip pack (written by Pose Studio's "save to game") ----
export const CLIP_PACK = clipPack as unknown as ClipPack;
const ATTACK_KINDS: ClipKind[] = ['attack', 'skill'];
/** put clips into the rig so rig.animate / attackEvents can play them by id. Same id as a built-in move replaces it. */
export function registerClips(pack: ClipPack) {
  const T = rig.TRACKS as Record<string, unknown>, A = rig.ATTACKS as Record<string, { th: string }>;
  for (const c of Object.values(pack.clips ?? {})) {
    if (validateClip(c).length) continue;
    T[c.id] = clipToTrack(c);
    if (ATTACK_KINDS.includes(c.kind)) A[c.id] = { th: c.name };
  }
}
registerClips(CLIP_PACK);
