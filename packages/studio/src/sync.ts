// Talks to the sync server (packages/studio-server) that owns the game's clips.json.
// Live: Server-Sent Events push every change, including edits an AI agent makes over MCP.
// Offline: "save to game" downloads clips.json to drop into packages/shared/src/data/.
import type { Clip, ClipPack, Bindings } from '@sketchbound/shared';
import { S, emit, saveLocal, syncState, openClip, sameClip, recordExternal } from './state';
import { toast, download, h, modal } from './ui';

export const WEAPONS: Record<string, string> = { none: 'มือเปล่า', katana: 'คาตานะ', great: 'ดาบยักษ์', axe: 'ขวาน', scythe: 'เคียว', spear: 'หอก', staff: 'คทา', bow: 'ธนู', gun: 'ปืน' };
export const SLOT_TH: Record<string, string> = { hold: 'ท่าถือ', idle: 'ยืน', walk: 'เดิน', run: 'วิ่ง', attack: 'ตีปกติ', skills: 'สกิล' };

const LS = 'sketchbound.sync';
const cfg = (() => {
  const q = new URLSearchParams(location.search);
  let saved: { url?: string; token?: string } = {}; try { saved = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { /* */ }
  return { url: (q.get('sync') ?? saved.url ?? 'http://127.0.0.1:8790').replace(/\/$/, ''), token: q.get('token') ?? saved.token ?? '' };
})();
const hdr = (): HeadersInit => ({ 'content-type': 'application/json', ...(cfg.token ? { authorization: 'Bearer ' + cfg.token } : {}) });
let es: EventSource | null = null, everOnline = false;

export function connect() {
  es?.close(); S.online = false; emit('sync');
  if (!cfg.url) return;
  try { es = new EventSource(`${cfg.url}/api/events${cfg.token ? '?token=' + encodeURIComponent(cfg.token) : ''}`); } catch { return; }
  es.addEventListener('pack', ev => {
    const first = !S.online; S.online = true; everOnline = true;
    applyServerPack(JSON.parse((ev as MessageEvent).data).pack as ClipPack, first);
    emit('sync', 'lib');
  });
  es.onerror = () => { if (S.online) toast('หลุดการเชื่อมต่อกับเกม · จะลองใหม่อัตโนมัติ', 'err'); S.online = false; emit('sync'); };
}

/** server pack arrived: clips nobody edited here follow the server (agent edits show up live) */
function applyServerPack(pack: ClipPack, first: boolean) {
  const prev = S.game; S.game = { v: 1, clips: pack.clips ?? {}, bindings: pack.bindings ?? {} };
  let added = 0; const updated: string[] = [], conflict: string[] = [];
  for (const [id, c] of Object.entries(S.game.clips)) {
    const mine = S.lib[id];
    if (!mine) { S.lib[id] = structuredClone(c); added++; continue; }
    const wasSynced = !!prev.clips[id] && sameClip(prev.clips[id], mine);
    if (wasSynced && !sameClip(c, mine)) { recordExternal(id, structuredClone(c), 'แก้จาก agent / ไฟล์'); updated.push(id); }
    else if (!wasSynced && prev.clips[id] && !sameClip(prev.clips[id], c) && !sameClip(c, mine)) conflict.push(id);
  }
  if (!first) {
    if (updated.length) toast(`อัปเดตจากเกม/agent: ${updated.map(i => S.lib[i].name).join(', ')} · Ctrl+Z เพื่อย้อน`, 'ok');
    for (const id of conflict) toast(`agent/ไฟล์แก้ "${S.lib[id].name}" แต่คุณมีการแก้ที่ยังไม่บันทึก`, '', { label: 'ใช้ของ agent', run: () => { recordExternal(id, structuredClone(S.game.clips[id]), 'ใช้เวอร์ชันจาก agent / ไฟล์'); if (id === S.id) emit('clip', 'sel'); emit('lib', 'sync'); saveLocal(); } });
    if (added) toast(`มีท่าใหม่จากเกม/agent ${added} ท่า`, 'ok', { label: 'เปิดดู', run: () => openClip(Object.keys(S.game.clips).find(i => !prev.clips[i]) ?? S.id) });
  }
  if (updated.includes(S.id)) emit('clip', 'sel');
  saveLocal();
}

async function api(path: string, method: string, body?: unknown) {
  const r = await fetch(cfg.url + path, { method, headers: hdr(), body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? r.statusText);
  return j;
}

export async function saveToGame(id = S.id) {
  const c = S.lib[id]; if (!c) return;
  const autoBind = c.kind === 'hold' && c.weapon && c.weapon !== 'any' && S.game.bindings[c.weapon]?.hold !== id;
  if (S.online) {
    try {
      const saved = (await api('/api/clips/' + encodeURIComponent(id), 'PUT', c)) as Clip;
      S.game.clips[id] = saved; S.lib[id] = { ...c, updated: saved.updated };
      if (autoBind) await setBinding(c.weapon!, 'hold', id, true);
      toast(`บันทึก "${c.name}" ลงเกมแล้ว · เกมโหลดท่าใหม่ทันที`, 'ok');
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e as Error).message, 'err'); return; }
  } else {
    S.game.clips[id] = structuredClone(c);
    if (autoBind) (S.game.bindings[c.weapon!] ??= {}).hold = id;
    offlineHelp();
  }
  saveLocal(); emit('lib', 'sync', 'clip');
}
export async function saveAllDirty() {
  const ids = Object.keys(S.lib).filter(id => syncState(id) !== 'synced' && (S.game.clips[id] || id === S.id));
  for (const id of ids) await saveToGame(id);
}
export async function removeFromGame(id: string) {
  if (S.online) { try { await api('/api/clips/' + encodeURIComponent(id), 'DELETE'); } catch (e) { toast((e as Error).message, 'err'); return; } }
  delete S.game.clips[id]; saveLocal(); emit('lib', 'sync');
}
export async function setBinding(weapon: string, slot: string, id: string | null, quiet = false) {
  const b: Bindings = { ...(S.game.bindings[weapon] ?? {}) };
  if (slot === 'skills') b.skills = id ? [...new Set([...(b.skills ?? []), id])] : [];
  else if (id) (b as Record<string, string>)[slot] = id; else delete (b as Record<string, string>)[slot];
  S.game.bindings[weapon] = b;
  if (S.online) { try { await api('/api/bindings', 'PUT', S.game.bindings); } catch (e) { toast((e as Error).message, 'err'); } }
  if (!quiet) toast(`${WEAPONS[weapon] ?? weapon} · ${SLOT_TH[slot]} → ${id ? S.lib[id]?.name ?? id : 'ไม่ใช้'}${S.online ? '' : ' (ออฟไลน์: กดบันทึกลงเกมเพื่อดาวน์โหลด clips.json)'}`, 'ok');
  if (id && !S.game.clips[id] && S.lib[id]) await saveToGame(id); else { saveLocal(); emit('lib', 'sync', 'clip'); }
}
export const gamePack = (): ClipPack => ({ v: 1, clips: S.game.clips, bindings: S.game.bindings });

let helped = false;
function offlineHelp() {
  download('clips.json', JSON.stringify(gamePack(), null, 1) + '\n');
  if (helped) { toast('ดาวน์โหลด clips.json แล้ว', 'ok'); return; }
  helped = true;
  modal(close => h('div', {},
    h('h2', {}, 'บันทึกแบบออฟไลน์'),
    h('p', {}, 'ยังไม่ได้เชื่อมกับเกม ผมดาวน์โหลดไฟล์ clips.json ให้แล้ว วางไฟล์นี้ที่ packages/shared/src/data/clips.json แล้วเกมจะใช้ท่าใหม่ทันที'),
    h('p', {}, 'หรือเปิดตัวเชื่อมต่อในเครื่องที่มีโค้ดเกม แล้วการบันทึกครั้งถัดไปจะเข้าเกมเองอัตโนมัติ:'),
    h('pre', { class: 'note' }, 'npm run studio:sync'),
    h('div', { class: 'pair' }, h('button', { class: 'primary', onclick: () => { close(); settings(); } }, 'ตั้งค่าการเชื่อมต่อ'), h('button', { class: 'ghost', onclick: close }, 'ปิด'))));
}

export function settings() {
  modal(close => {
    const url = h('input', { type: 'text', value: cfg.url, placeholder: 'http://127.0.0.1:8790' }) as HTMLInputElement;
    const tok = h('input', { type: 'text', value: cfg.token, placeholder: 'ไม่ต้องใส่ถ้ารันในเครื่อง' }) as HTMLInputElement;
    return h('div', { style: 'width:min(520px,90vw)' },
      h('h2', {}, 'เชื่อมต่อกับเกม', h('small', {}, S.online ? 'เชื่อมอยู่' : 'ยังไม่เชื่อม')),
      h('p', { class: 'note' }, 'Pose Studio คุยกับ sync server ที่อ่าน/เขียน clips.json ของเกม รันในโฟลเดอร์เกมด้วย ', h('code', {}, 'npm run studio:sync'), ' แล้ว agent ที่ใช้ MCP ก็จะแก้ท่าให้เห็นสดๆ ที่นี่'),
      h('div', { class: 'f', style: 'margin:12px 0' }, h('label', {}, 'Sync URL'), url, h('label', {}, 'Token'), tok),
      h('div', { class: 'pair' },
        h('button', { class: 'primary', onclick: () => { cfg.url = url.value.trim().replace(/\/$/, ''); cfg.token = tok.value.trim(); try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch { /* */ } connect(); close(); } }, 'เชื่อมต่อ'),
        h('button', { class: 'ghost', onclick: () => { download('clips.json', JSON.stringify(gamePack(), null, 1) + '\n'); } }, 'ดาวน์โหลด clips.json')));
  });
}
export const isEverOnline = () => everOnline;
