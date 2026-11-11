// Pose Studio entry: wires the top bar, stage toolbar, timeline transport, shortcuts and playback.
import { DEFS } from '@sketchbound/client/art';
import { KIND_TH, PRESETS, presetEquip, clipEnd } from '@sketchbound/shared';
import { S, clip, emit, on, loadLocal, saveLocal, openClip, newFromTemplate, setTime, frame, jumpKey, addKey, deleteKeys, copyKeys, pasteKeys, mirrorSel, resetBone, undo, redo, syncState, FPS_OPTS, edit } from './state';
import { $, h, modal, modalOpen, toast } from './ui';
import { render as renderStage, pan, opts as stageOpts } from './stage';
import { draw as drawTl, fit, tl, onClipOpened } from './timeline';
import { build as buildPanels } from './panels';
import { render as renderLeft, holdWizard } from './left';
import { connect, saveToGame, settings, WEAPONS } from './sync';
import { openPreview } from './preview';
import { importFiles, exportMenu } from './io';

// pencil patterns and filters once for every inline drawing (thumbnails, previews)
document.body.append(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), { innerHTML: DEFS }));
(document.body.lastChild as SVGElement).setAttribute('style', 'position:absolute;width:0;height:0');

// ---------- boot ----------
if (!loadLocal() || !S.lib[S.id]) {
  if (!Object.keys(S.lib).length) { newFromTemplate('slash', 'ฟันเดี่ยว (ของฉัน)'); }
  else openClip(Object.keys(S.lib)[0]);
}

// ---------- top bar ----------
function topbar() {
  const c = clip(); if (!c) return;
  $('clipName').textContent = c.name;
  const k = $('clipKind'); k.textContent = KIND_TH[c.kind]; k.className = 'badge k-' + c.kind;
  const st = syncState(c.id); $('dirtyDot').hidden = st === 'synced';
  const b = $('syncBtn'); b.className = 'sync ' + (S.online ? (st === 'synced' ? 'on' : 'dirty') : 'off');
  $('syncText').textContent = S.online ? (st === 'synced' ? 'Synced · ตรงกับไฟล์ในเกม' : st === 'local' ? 'ท่านี้ยังไม่อยู่ในเกม' : 'มีการแก้ ยังไม่บันทึกลงเกม') : 'ออฟไลน์ · เก็บในเบราว์เซอร์';
}
on(['clip', 'lib', 'sync'], topbar);
$('btnSave').onclick = () => saveToGame();
$('btnPreview').onclick = openPreview;
$('btnImport').onclick = importFiles;
$('btnExport').onclick = exportMenu;
$('syncBtn').onclick = settings;
$('btnKeys').onclick = shortcuts;

// ---------- stage toolbar ----------
function toolbar() {
  const t = $('toolbar'), v = S.view;
  const tog = (key: keyof typeof v, label: string, title: string) => h('button', { class: v[key] ? 'on' : '', title, onclick: () => { (v as unknown as Record<string, boolean>)[key] = !v[key]; emit('view'); } }, label);
  const zoom = h('input', { type: 'range', min: '0.4', max: '3', step: '0.05', value: String(v.zoom), title: 'ซูม (ล้อเมาส์บนเวที)', oninput: (e: Event) => { v.zoom = +(e.target as HTMLInputElement).value; emit('view'); } });
  const preset = h('select', { title: 'ชุดตัวละคร', onchange: (e: Event) => { const p = (e.target as HTMLSelectElement).value; S.preset = p; const w = S.eq.weapon; Object.assign(S.eq, p ? presetEquip(p) : { hair: 'none', outfit: 'none', wings: 'none', offhand: 'none', element: 'mono' }); if (!p) S.eq.weapon = w; emit('eq', 'lib'); } },
    h('option', { value: '' }, 'ตัวเปล่า'), ...Object.entries(PRESETS).map(([k, p]) => h('option', { value: k, selected: S.preset === k }, p.th)));
  const weapon = h('select', { title: 'อาวุธ', onchange: (e: Event) => { S.eq.weapon = (e.target as HTMLSelectElement).value; emit('eq', 'lib'); } },
    ...Object.entries(WEAPONS).map(([k, th]) => h('option', { value: k, selected: S.eq.weapon === k }, th)));
  t.replaceChildren(
    tog('bones', '⟋ ข้อต่อ', 'แสดงกระดูก (B)'), tog('onion', '◐ Onion', 'เงาคีย์ก่อน/หลัง (O)'), tog('rootMotion', '↔ Root motion', 'แสดงการเคลื่อนที่จริง (P)'), tog('flip', '⇋ Flip', 'กลับด้าน (F)'), tog('ik', '⌖ IK', 'ลากมือ/เท้าแล้วแขนขางอตาม (I หรือกด Ctrl ค้างขณะลาก)'),
    h('button', { class: stageOpts.path ? 'on' : '', title: 'เส้นทางของกระดูกที่เลือก', onclick: () => { stageOpts.path = !stageOpts.path; toolbar(); renderStage(); } }, '∿ เส้นทาง'),
    h('span', { class: 'sep' }), preset, weapon, h('span', { class: 'sep' }), h('span', { style: 'color:var(--faint);font-size:12px' }, '🔍'), zoom);
}
on(['view', 'eq'], () => { toolbar(); saveLocal(); });

// ---------- timeline transport ----------
const fmt = (t: number) => { const f = Math.round(t * S.fps); return `${Math.floor(f / S.fps)}:${String(f % S.fps).padStart(2, '0')}f · ${t.toFixed(3)}s`; };
function tlbar() {
  const b = $('tlBar'), v = S.view;
  const btn = (label: string, title: string, run: () => void, cls = '') => h('button', { title, class: cls, onclick: run }, label);
  const speed = h('select', { title: 'ความเร็วเล่น', onchange: (e: Event) => { S.speed = +(e.target as HTMLSelectElement).value; } }, ...[0.1, 0.25, 0.5, 1, 1.5, 2].map(s => h('option', { value: String(s), selected: S.speed === s }, s + '×')));
  const fps = h('select', { title: 'เฟรมต่อวินาที (สำหรับ snap)', onchange: (e: Event) => { S.fps = +(e.target as HTMLSelectElement).value; emit('view'); } }, ...FPS_OPTS.map(f => h('option', { value: String(f), selected: S.fps === f }, f + ' fps')));
  b.replaceChildren(
    btn('⏮', 'ไปต้นคลิป (Home)', () => setTime(0)), btn('◆‹', 'คีย์ก่อนหน้า (J)', () => jumpKey(-1)), btn('‹', 'ถอย 1 เฟรม (←)', () => setTime(S.t - frame())),
    h('button', { class: 'play', id: 'playBtn', title: 'เล่น/หยุด (Space)', onclick: togglePlay }, S.playing ? '❚❚' : '▶'),
    btn('›', 'หน้า 1 เฟรม (→)', () => setTime(S.t + frame())), btn('›◆', 'คีย์ถัดไป (K)', () => jumpKey(1)), btn('⏭', 'ไปท้ายคลิป (End)', () => setTime(clipEnd(clip()))),
    h('span', { class: 'tc', id: 'tc' }, fmt(S.t)), speed, btn('↻', 'เล่นวน', () => { S.loopPlay = !S.loopPlay; tlbar(); }, S.loopPlay ? 'on' : ''), fps,
    h('span', { class: 'sep' }),
    btn('◆ + คีย์', 'ใส่คีย์ที่หัวอ่าน (S)', () => addKey()), btn('🗑', 'ลบคีย์ที่เลือก (Del)', () => deleteKeys()),
    btn('⧉', 'คัดลอกคีย์ (Ctrl+C)', () => toast(`คัดลอก ${copyKeys()} คีย์`)), btn('📋', 'วางที่หัวอ่าน (Ctrl+V)', () => pasteKeys()),
    btn('⇄', 'สลับซ้าย/ขวา (M)', mirrorSel), btn('⟲', 'รีเซ็ตกระดูกที่เลือก (R)', () => resetBone()),
    h('span', { class: 'sep' }),
    btn('Auto-key', 'ขยับกระดูกแล้วสร้างคีย์ให้เอง (A)', () => { v.autoKey = !v.autoKey; tlbar(); }, v.autoKey ? 'on' : ''),
    btn('📈 Graph', 'กราฟค่ากระดูกที่เลือก (G)', () => { tl.graph = !tl.graph; tlbar(); drawTl(); }, tl.graph ? 'on' : ''),
    btn('⤢ Fit', 'ซูมให้เห็นทั้งคลิป (\\)', fit),
    h('span', { class: 'grow' }),
    btn('↶', 'Undo (Ctrl+Z)', () => undo()), btn('↷', 'Redo (Ctrl+Shift+Z)', () => redo()));
}
on(['time'], () => { const tc = document.getElementById('tc'); if (tc) tc.textContent = fmt(S.t); });
on(['view'], tlbar);

// ---------- playback ----------
let last = 0;
function togglePlay() {
  S.playing = !S.playing; last = performance.now();
  if (S.playing && S.t >= clipEnd(clip()) - 1e-4) S.t = 0;
  const p = document.getElementById('playBtn'); if (p) p.textContent = S.playing ? '❚❚' : '▶';
  if (S.playing) requestAnimationFrame(tick); else emit('time');
}
function tick(now: number) {
  if (!S.playing) { const p = document.getElementById('playBtn'); if (p) p.textContent = '▶'; return; }
  const c = clip(), end = clipEnd(c), dt = Math.min(0.1, (now - last) / 1000) * S.speed; last = now;
  let t = S.t + dt;
  if (t >= end) { if (S.loopPlay || c.loop) t = t % end; else { t = end; S.playing = false; } }
  S.t = t; emit('time'); requestAnimationFrame(tick);
}

// ---------- shortcuts ----------
const KEYS: [string, string][] = [
  ['Space', 'เล่น / หยุด'], ['← →', 'ทีละเฟรม (Shift = 10 เฟรม)'], ['J / K', 'คีย์ก่อนหน้า / ถัดไป'], ['Home / End', 'ต้น / ท้ายคลิป'],
  ['S', 'ใส่คีย์ที่หัวอ่าน'], ['Del', 'ลบคีย์ที่เลือก'], ['Ctrl+C / V', 'คัดลอก / วางคีย์'], ['Ctrl+A', 'เลือกทุกคีย์'],
  ['Ctrl+Z / Shift+Z', 'Undo / Redo'], ['M', 'สลับซ้าย/ขวา'], ['R', 'รีเซ็ตกระดูกที่เลือก'], ['A', 'Auto-key'],
  ['B / O / P / F / I', 'ข้อต่อ / Onion / Root motion / Flip / IK'], ['G', 'Graph editor'], ['\\', 'ซูมไทม์ไลน์ให้พอดี'], ['Ctrl+S', 'บันทึกลงเกม'],
  ['ลากจุด', 'หมุนกระดูก (Shift = ทีละ 15°)'], ['Ctrl+ลากมือ/เท้า', 'IK ชั่วคราว'], ['ลากสะโพก', 'ย้ายตัว (Shift = หมุนทั้งตัว)'], ['คลิกขวา/Alt+ลาก', 'เลื่อนมุมมองเวที'],
  ['ล้อเมาส์บนไทม์ไลน์', 'เลื่อนแถว (Shift = เลื่อนเวลา, Ctrl = ซูม)'], ['Alt+ลากคีย์', 'ก๊อปปี้คีย์'], ['ดับเบิลคลิกไทม์ไลน์', 'ใส่คีย์ตรงนั้น'], ['คลิกขวาที่คีย์', 'easing, hit, ลบ ฯลฯ'],
];
function shortcuts() {
  modal(() => h('div', { style: 'width:min(760px,92vw)' }, h('h2', {}, 'คีย์ลัด'),
    h('div', { class: 'kbd' }, ...KEYS.flatMap(([k, d]) => [h('kbd', {}, k), h('span', {}, d)]))));
}
document.addEventListener('keydown', e => {
  if (modalOpen()) return;
  const tag = (e.target as HTMLElement).tagName; if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), v = S.view;
  const tog = (key: keyof typeof v) => { (v as unknown as Record<string, boolean>)[key] = !v[key]; emit('view'); };
  let hit = true;
  if (mod && k === 'z') e.shiftKey ? redo() : undo();
  else if (mod && k === 'y') redo();
  else if (mod && k === 'c') toast(`คัดลอก ${copyKeys()} คีย์`);
  else if (mod && k === 'v') pasteKeys();
  else if (mod && k === 's') saveToGame();
  else if (mod && k === 'a') { S.sel = new Set(clip().keys); emit('sel'); }
  else if (mod) hit = false;
  else if (e.key === ' ') togglePlay();
  else if (e.key === 'ArrowLeft') setTime(S.t - frame() * (e.shiftKey ? 10 : 1));
  else if (e.key === 'ArrowRight') setTime(S.t + frame() * (e.shiftKey ? 10 : 1));
  else if (e.key === 'Home') setTime(0);
  else if (e.key === 'End') setTime(clipEnd(clip()));
  else if (k === 'j') jumpKey(-1);
  else if (k === 'k') jumpKey(1);
  else if (k === 's') addKey();
  else if (e.key === 'Delete' || e.key === 'Backspace') deleteKeys();
  else if (k === 'm') mirrorSel();
  else if (k === 'r') resetBone();
  else if (k === 'a') { v.autoKey = !v.autoKey; tlbar(); toast('Auto-key ' + (v.autoKey ? 'เปิด' : 'ปิด')); }
  else if (k === 'b') tog('bones');
  else if (k === 'o') tog('onion');
  else if (k === 'p') tog('rootMotion');
  else if (k === 'f') tog('flip');
  else if (k === 'i') tog('ik');
  else if (k === 'g') { tl.graph = !tl.graph; tlbar(); drawTl(); }
  else if (e.key === '\\') fit();
  else if (e.key === '?') shortcuts();
  else hit = false;
  if (hit) e.preventDefault();
});

// ---------- timeline height ----------
$('tlResize').addEventListener('pointerdown', e => {
  const y0 = e.clientY, h0 = $('timeline').getBoundingClientRect().height, el = e.target as HTMLElement; el.setPointerCapture(e.pointerId);
  const mv = (ev: PointerEvent) => document.documentElement.style.setProperty('--tl-h', Math.max(140, Math.min(innerHeight * 0.7, h0 - (ev.clientY - y0))) + 'px');
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', () => el.removeEventListener('pointermove', mv), { once: true });
});

// a different clip was opened: refit the timeline, rebuild panels
let openId = '';
on(['clip', 'lib'], () => { if (S.id !== openId) { openId = S.id; onClipOpened(); buildPanels(); } });
document.getElementById('right')!.addEventListener('focusout', () => setTimeout(() => { if (!document.getElementById('right')!.contains(document.activeElement)) emit('sel'); }, 0));

toolbar(); tlbar(); renderLeft(); buildPanels(); topbar(); renderStage();
openId = S.id;
connect();
// first visit: show the shortcut sheet entry point and the wizard hint
if (!localStorage.getItem('sketchbound.seen')) { try { localStorage.setItem('sketchbound.seen', '1'); } catch { /* */ } toast('เริ่มง่ายสุด: กด "ทำถืออาวุธ · ช็อตเดียว" ด้านซ้าย', '', { label: 'เริ่มเลย', run: holdWizard }); }
void pan; void edit;
