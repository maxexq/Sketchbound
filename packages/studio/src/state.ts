// App state, the edit operations on the open clip, undo/redo and the change bus.
import {
  type Clip, type ClipKey, type BoneId, type Pose, type ClipPack, type Bindings,
  evalClip, keyPose, poseToKeyFields, sortKeys, clipEnd, mirrorKey, restPose, templateById, EQUIP_BASE, BMAP,
} from '@sketchbound/shared';

export type Equip = Record<string, string>;
export interface View { bones: boolean; onion: boolean; rootMotion: boolean; flip: boolean; ik: boolean; zoom: number; autoKey: boolean; overlayHold: boolean }
export const FPS_OPTS = [24, 30, 60];

export const S = {
  lib: {} as Record<string, Clip>,         // my clips (browser), the working copies
  game: { v: 1, clips: {}, bindings: {} } as ClipPack, // what the game has (server, or last save)
  id: '' as string,
  t: 0, playing: false, speed: 1, loopPlay: true, fps: 30,
  sel: new Set<ClipKey>(),
  bone: 'armR_u' as BoneId,
  view: { bones: true, onion: true, rootMotion: true, flip: false, ik: false, zoom: 1, autoKey: true, overlayHold: true } as View,
  eq: { ...EQUIP_BASE, weapon: 'katana' } as Equip,
  preset: '',
  online: false,
  trash: [] as { clip: Clip; hist?: { s: HState[]; i: number }; at: number }[],
};
export const clip = (): Clip => S.lib[S.id];

// ---- change bus: parts of the UI redraw on the topics they care about ----
type Topic = 'clip' | 'time' | 'sel' | 'lib' | 'view' | 'sync' | 'eq' | 'hist';
const subs: Record<string, (() => void)[]> = {};
export const on = (topics: Topic[], fn: () => void) => topics.forEach(t => (subs[t] ??= []).push(fn));
let pending = new Set<Topic>(), raf = 0;
export function emit(...topics: Topic[]) {
  topics.forEach(t => pending.add(t));
  if (!raf) raf = requestAnimationFrame(() => {
    raf = 0; const p = pending; pending = new Set();
    const fns = new Set<() => void>(); p.forEach(t => subs[t]?.forEach(f => fns.add(f))); fns.forEach(f => f());
  });
}

// ---- persistence of my clips in this browser ----
const LS = 'sketchbound.studio.v1';
export function saveLocal() {
  try { localStorage.setItem(LS, JSON.stringify({ lib: S.lib, id: S.id, eq: S.eq, view: S.view, fps: S.fps, game: S.game, trash: S.trash.map(t => ({ clip: t.clip, at: t.at })) })); } catch { /* private mode */ }
}
export function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || 'null'); if (!d) return false;
    S.lib = d.lib ?? {}; S.id = d.id ?? ''; Object.assign(S.eq, d.eq ?? {}); Object.assign(S.view, d.view ?? {}); S.fps = d.fps ?? 30;
    if (d.game) S.game = d.game;
    if (Array.isArray(d.trash)) S.trash = d.trash;
    return Object.keys(S.lib).length > 0;
  } catch { return false; }
}
let saveT = 0;
const saveSoon = () => { clearTimeout(saveT); saveT = window.setTimeout(saveLocal, 300); };

// ---- history: per clip, a list of named states (undo/redo, History panel, survives reload) ----
export interface HState { l: string; j: string; at: number }
const hist: Record<string, { s: HState[]; i: number }> = {};
const HLS = 'sketchbound.history.v1', HMAX = 200, HKEEP = 60;
const js = (c: Clip) => JSON.stringify({ ...c, updated: undefined });
const H = (id = S.id, base?: string) => (hist[id] ??= { s: [{ l: 'เปิดคลิป', j: base ?? js(S.lib[id]), at: Date.now() }], i: 0 });
function push(id: string, l: string, j: string, base: string) {
  const h = H(id, base);
  h.s.length = h.i + 1;
  if (h.s[h.i].j !== base) { h.s.push({ l: 'แก้ไข (ไม่ได้บันทึกประวัติ)', j: base, at: Date.now() }); }
  h.s.push({ l, j, at: Date.now() });
  while (h.s.length > HMAX) h.s.shift();
  h.i = h.s.length - 1; saveHistSoon(); emit('hist');
}
let before: string | null = null, label = '';
/** call before a change starts (pointerdown, first slider input); the label names the step in History */
export function begin(l?: string) { if (before === null) { before = js(clip()); label = l ?? ''; } else if (l && !label) label = l; }
export function label_(l: string) { if (before !== null && !label) label = l; }
/** call when the change is done; records one step if anything changed */
export function commit(l?: string) {
  if (before === null) return;
  const now = js(clip());
  if (now !== before) push(S.id, l || label || 'แก้ไข', now, before);
  before = null; label = ''; saveSoon(); emit('clip', 'lib');
}
/** one-shot change: snapshot, run, commit */
export function edit(fn: () => void, l?: string) { begin(l); fn(); sortKeys(clip()); commit(); emit('clip', 'sel'); }
function restore(json: string) {
  const c = JSON.parse(json) as Clip; S.lib[S.id] = c;
  const ts = new Set([...S.sel].map(k => k.t)); S.sel = new Set(c.keys.filter(k => ts.has(k.t)));
  saveSoon(); saveHistSoon(); emit('clip', 'sel', 'lib', 'hist');
}
export function jump(i: number) {
  const h = H(); if (i < 0 || i >= h.s.length || i === h.i) return false;
  if (before !== null) commit();
  h.i = i; restore(h.s[i].j); return true;
}
export function undo() { const h = H(), l = h.s[h.i]?.l; return jump(h.i - 1) ? l : false; }
export function redo() { const h = H(); return jump(h.i + 1) ? h.s[h.i].l : false; }
export const history = () => H();
/** a change that came from outside (an agent over MCP, a file edit): keep it undoable */
export function recordExternal(id: string, next: Clip, l: string) {
  const base = js(S.lib[id]); S.lib[id] = next; push(id, l, js(next), base);
}
export function renameHistory(from: string, to: string) { if (hist[from]) { hist[to] = hist[from]; delete hist[from]; saveHistSoon(); } }

let hT = 0;
const saveHistSoon = () => { clearTimeout(hT); hT = window.setTimeout(saveHist, 800); };
addEventListener('pagehide', () => { saveLocal(); saveHist(); });
addEventListener('visibilitychange', () => { if (document.hidden) { saveLocal(); saveHist(); } });
function saveHist() {
  for (const keep of [HKEEP, 15, 3]) {
    const out: Record<string, { s: HState[]; i: number }> = {};
    for (const [id, h] of Object.entries(hist)) {
      if (!S.lib[id]) continue;
      const from = Math.max(0, h.s.length - keep);
      out[id] = { s: h.s.slice(from), i: Math.max(0, h.i - from) };
    }
    try { localStorage.setItem(HLS, JSON.stringify(out)); return; } catch { /* too big: keep fewer steps */ }
  }
}
export function loadHistory() {
  try { const d = JSON.parse(localStorage.getItem(HLS) || '{}'); for (const [id, h] of Object.entries(d as typeof hist)) if (S.lib[id] && h.s?.length) {
    // the saved clip may have changed after the last saved step; then that is a new step
    hist[id] = h; const cur = js(S.lib[id]); if (h.s[h.i]?.j !== cur) { h.s.length = h.i + 1; h.s.push({ l: 'แก้ไข', j: cur, at: Date.now() }); h.i++; }
  } } catch { /* */ }
}

// ---- deleted clips can come back ----
export function restoreClip(i: number) {
  const t = S.trash.splice(i, 1)[0]; if (!t) return;
  const c = t.clip; if (S.lib[c.id]) c.id = uniqueId(c.id);
  S.lib[c.id] = c; if (t.hist) hist[c.id] = t.hist;
  openClip(c.id); saveSoon(); emit('lib');
}

// ---- time & keys ----
export const frame = () => 1 / S.fps;
export const snapT = (t: number) => Math.max(0, Math.round(t * S.fps) / S.fps);
export const keyAt = (t: number, c = clip()) => c.keys.find(k => Math.abs(k.t - t) < 0.5 / S.fps) ?? null;
export const keyIndex = (k: ClipKey) => clip().keys.indexOf(k);
export function setTime(t: number) {
  const end = clipEnd(clip()); S.t = Math.max(0, Math.min(t, end)); emit('time');
}
/** the key being edited at the playhead, created when needed (auto-key) */
export function editKey(): ClipKey | null {
  const c = clip(); let k = keyAt(S.t);
  if (!k) {
    if (!S.view.autoKey) return null;
    k = { t: round(snapT(S.t)), e: 'io', ...poseToKeyFields(evalClip(c, S.t).pose), h: evalClip(c, S.t).hand };
    c.keys.push(k); sortKeys(c); c.len = Math.max(c.len, k.t);
  }
  S.sel = new Set([k]); return k;
}
export const round = (v: number) => Math.round(v * 1000) / 1000;
export const fmtT = (t: number) => `${Math.round(t * S.fps)}f`;
export const boneTh = (id: string) => (id === 'dx' ? 'ตัว ซ้าย/ขวา' : id === 'dy' ? 'ตัว ขึ้น/ลง' : (BMAP as Record<string, { th: string }>)[id]?.th ?? id);
export const poseNow = (): Pose => evalClip(clip(), S.t).pose;

export function addKey(t = S.t) {
  edit(() => { const c = clip(); let k = keyAt(t); if (!k) { k = { t: round(snapT(t)), e: 'io', ...poseToKeyFields(evalClip(c, t).pose), h: evalClip(c, t).hand }; c.keys.push(k); c.len = Math.max(c.len, k.t); } S.sel = new Set([k]); }, `ใส่คีย์ ${fmtT(t)}`);
}
export function deleteKeys(keys = [...S.sel]) {
  const c = clip(); if (!keys.length) return;
  if (keys.length >= c.keys.length) keys = keys.slice(1); // a clip keeps at least one key
  edit(() => { c.keys = c.keys.filter(k => !keys.includes(k)); S.sel.clear(); }, `ลบ ${keys.length} คีย์`);
}
let clipboard: ClipKey[] = [];
export function copyKeys() { const ks = [...S.sel].sort((a, b) => a.t - b.t); if (!ks.length) { const k = keyAt(S.t); if (k) ks.push(k); } clipboard = structuredClone(ks); return clipboard.length; }
export function pasteKeys() {
  if (!clipboard.length) return 0;
  const t0 = clipboard[0].t;
  edit(() => {
    const c = clip(), added: ClipKey[] = [];
    for (const src of clipboard) {
      const t = round(snapT(S.t + src.t - t0)), ex = keyAt(t), k = { ...structuredClone(src), t };
      if (ex) c.keys.splice(c.keys.indexOf(ex), 1);
      c.keys.push(k); added.push(k); c.len = Math.max(c.len, t);
    }
    S.sel = new Set(added);
  }, `วาง ${clipboard.length} คีย์`);
  return clipboard.length;
}
export function mirrorSel() {
  edit(() => { const c = clip(), ks = S.sel.size ? [...S.sel] : [editKey()].filter(Boolean) as ClipKey[]; for (const k of ks) { const m = mirrorKey(k); k.a = m.a; } void c; }, 'สลับซ้าย/ขวา');
}
export function resetBone(id = S.bone) {
  edit(() => { const k = editKey(); if (k) k.a[id] = restPose().a[id]; }, 'รีเซ็ต ' + boneTh(id));
}
export function applyPose(fields: Pick<ClipKey, 'dx' | 'dy' | 'a'>, hand?: string) {
  edit(() => { const k = editKey(); if (!k) return; k.dx = fields.dx; k.dy = fields.dy; k.a = { ...fields.a }; if (hand) k.h = hand as ClipKey['h']; }, 'ใส่ท่านิ่ง');
}
export function selectKeysInRange(t0: number, t1: number, add = false) {
  if (!add) S.sel.clear();
  for (const k of clip().keys) if (k.t >= Math.min(t0, t1) - 1e-6 && k.t <= Math.max(t0, t1) + 1e-6) S.sel.add(k);
  emit('sel');
}
export function jumpKey(dir: 1 | -1) {
  const ts = clip().keys.map(k => k.t), eps = 1e-4;
  const t = dir > 0 ? ts.find(x => x > S.t + eps) : [...ts].reverse().find(x => x < S.t - eps);
  if (t !== undefined) { setTime(t); const k = keyAt(t); if (k) { S.sel = new Set([k]); emit('sel'); } }
}

// ---- clips in the library ----
export function uniqueId(base: string) {
  base = base.replace(/[^A-Za-z0-9_-]/g, '').replace(/^[^A-Za-z]+/, '') || 'clip';
  let id = base, i = 2; while (S.lib[id]) id = `${base}${i++}`; return id;
}
export function openClip(id: string) {
  if (!S.lib[id]) return; S.id = id; S.sel.clear(); S.t = 0; S.playing = false;
  const c = S.lib[id]; if (c.weapon && c.weapon !== 'any' && c.weapon !== S.eq.weapon) { S.eq.weapon = c.weapon; emit('eq'); }
  const k = keyAt(0); if (k) S.sel.add(k);
  saveSoon(); emit('clip', 'sel', 'time', 'lib');
}
export function addClip(c: Clip, open = true) {
  c = structuredClone(c); c.id = uniqueId(c.id); delete c.updated; S.lib[c.id] = c; if (open) openClip(c.id); saveSoon(); emit('lib'); return c;
}
export function newFromTemplate(tid: string, name?: string) {
  const t = templateById(tid); if (!t) return;
  const c = t.clip(); if (name) c.name = name; c.id = tid + '_my';
  return addClip(c);
}
export function newBlank(kind: Clip['kind'] = 'attack') {
  const c: Clip = { v: 1, id: 'move', name: 'ท่าใหม่', kind, loop: kind === 'idle' || kind === 'walk' || kind === 'run', len: 0.8, mask: kind === 'hold' ? 'upper' : 'full', weapon: S.eq.weapon || 'any',
    keys: [{ t: 0, e: 'lin', ...poseToKeyFields(restPose()), h: 'relax' }] };
  return addClip(c);
}
export function deleteClip(id: string) {
  S.trash.unshift({ clip: S.lib[id], hist: hist[id], at: Date.now() }); S.trash.length = Math.min(S.trash.length, 15);
  delete S.lib[id]; delete hist[id];
  if (S.id === id) { const first = Object.keys(S.lib)[0]; if (first) openClip(first); else newFromTemplate('slash', 'ฟันเดี่ยว (ของฉัน)'); }
  saveSoon(); emit('lib');
}

// ---- game sync status of a clip ----
// stable JSON (sorted object keys) so key order never makes a clip look changed
const stable = (v: unknown): string => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => (v as Record<string, unknown>)[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable((v as Record<string, unknown>)[k])).join(',') + '}'
  : JSON.stringify(v);
const strip = (c: Clip | undefined) => (c ? stable({ ...c, updated: undefined }) : '');
export const sameClip = (a?: Clip, b?: Clip) => strip(a) === strip(b);
export type SyncState = 'synced' | 'dirty' | 'local';
export function syncState(id: string): SyncState {
  const g = S.game.clips[id]; if (!g) return 'local';
  return strip(g) === strip(S.lib[id]) ? 'synced' : 'dirty';
}
export function bindingsFor(weapon: string): Bindings { return S.game.bindings[weapon] ?? {}; }
export { keyPose, clipEnd };
