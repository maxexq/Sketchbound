// Right side: clip settings, the key at the playhead, and a slider per bone.
import { CLIP_KINDS, KIND_TH, EASES, EASE_TH, EASE_FN, HANDS, BMAP, CLIP_ID, restPose, evalClip, type BoneId, type ClipKey, type Ease, type Clip } from '@sketchbound/shared';
import { S, clip, emit, on, begin, commit, edit, editKey, keyAt, setTime, round, uniqueId, saveLocal, bindingsFor, deleteKeys } from './state';
import { h, toast } from './ui';
import { setBinding, WEAPONS, SLOT_TH } from './sync';

const root = document.getElementById('right')!;
const HAND_TH: Record<string, string> = { relax: 'ผ่อนคลาย', open: 'กางนิ้ว', fist: 'กำหมัด', point: 'ชี้', peace: 'ชูสองนิ้ว', chop: 'สันมือ', claw: 'กรงเล็บ', grip: 'กำด้าม' };
const restA = restPose().a;
const opt = (v: string, label: string, sel: boolean) => h('option', { value: v, selected: sel }, label);
const num = (v: number, step: number, onInput: (v: number) => void, attrs = {}) => {
  const i = h('input', { type: 'number', value: String(v), step: String(step), ...attrs }) as HTMLInputElement;
  i.addEventListener('focus', () => begin()); i.addEventListener('input', () => { if (i.value !== '' && Number.isFinite(+i.value)) { begin(); onInput(+i.value); } });
  i.addEventListener('change', () => commit()); i.addEventListener('blur', () => commit());
  return i;
};
const chk = (label: string, v: boolean, set: (v: boolean) => void, title = '') => h('label', { class: 'chk', title }, h('input', { type: 'checkbox', checked: v, onchange: (e: Event) => edit(() => set((e.target as HTMLInputElement).checked)) }), label);

// ---------- clip card ----------
function clipCard(c: Clip) {
  const name = h('input', { type: 'text', value: c.name, maxlength: 40 }) as HTMLInputElement;
  name.addEventListener('focus', begin); name.addEventListener('input', () => { c.name = name.value || c.id; emit('lib'); }); name.addEventListener('change', commit);
  const id = h('input', { type: 'text', value: c.id, title: 'id ที่เกมใช้เรียกท่านี้ (ตั้งเป็น id ของท่าเดิม เช่น slash เพื่อแทนท่านั้นในเกม)' }) as HTMLInputElement;
  id.addEventListener('change', () => {
    const v = id.value.trim(); if (v === c.id) return;
    if (!CLIP_ID.test(v)) { toast('id ใช้ได้แค่ a-z 0-9 _ - และขึ้นต้นด้วยตัวอักษร', 'err'); id.value = c.id; return; }
    if (S.lib[v]) { toast(`มีคลิป ${v} อยู่แล้ว`, 'err'); id.value = c.id; return; }
    delete S.lib[c.id]; c.id = v; S.lib[v] = c; S.id = v; saveLocal(); emit('lib', 'clip'); build();
  });
  const kind = h('select', { onchange: (e: Event) => edit(() => { c.kind = (e.target as HTMLSelectElement).value as Clip['kind']; if (c.kind === 'hold') c.mask = 'upper'; if (['idle', 'walk', 'run'].includes(c.kind)) c.loop = true; build(); }) },
    ...CLIP_KINDS.map(k => opt(k, KIND_TH[k], c.kind === k)));
  const weapon = h('select', { onchange: (e: Event) => edit(() => { c.weapon = (e.target as HTMLSelectElement).value; if (c.weapon !== 'any') { S.eq.weapon = c.weapon; emit('eq'); } }) },
    opt('any', 'ทุกอาวุธ', (c.weapon ?? 'any') === 'any'), ...Object.entries(WEAPONS).map(([k, v]) => opt(k, v, c.weapon === k)));
  const drag = h('input', { type: 'range', min: '0', max: '0.5', step: '0.05', value: String(c.drag ?? 0.2), title: 'ปลายแขนขาขยับตามช้ากว่าต้นนิดหน่อย ให้ท่าดูสะบัด' }) as HTMLInputElement;
  drag.addEventListener('pointerdown', begin); drag.addEventListener('input', () => { begin(); c.drag = +drag.value; emit('clip'); }); drag.addEventListener('change', commit);
  const b = bindingsFor(c.weapon && c.weapon !== 'any' ? c.weapon : S.eq.weapon), used = Object.entries(b).filter(([, v]) => v === c.id || (Array.isArray(v) && v.includes(c.id))).map(([k]) => SLOT_TH[k] ?? k);
  const slot = h('select', {}, ...Object.entries(SLOT_TH).map(([k, v]) => opt(k, v, defaultSlot(c) === k)));
  const w = c.weapon && c.weapon !== 'any' ? c.weapon : S.eq.weapon;
  return h('div', { class: 'card' },
    h('h3', {}, 'Clip', h('small', {}, 'ตั้งค่าคลิป')),
    h('div', { class: 'f' },
      h('label', {}, 'ชื่อ'), name,
      h('label', {}, 'id ในเกม'), id,
      h('label', {}, 'ชนิด'), kind,
      h('label', {}, 'อาวุธ'), weapon,
      h('label', {}, 'ความยาว (วิ)'), num(c.len, 0.05, v => { c.len = Math.max(round(v), ...c.keys.map(k => k.t), 0.05); emit('clip'); }, { min: '0.05' }),
      h('label', {}, 'ความเร็วในเกม'), num(c.rate ?? 1, 0.1, v => { c.rate = Math.max(0.1, v); emit('clip'); }, { min: '0.1' }),
      h('label', { title: 'ระยะที่ตัวละครเคลื่อนที่จริง (px) ต่อการเล่น 1 รอบ' }, 'Root motion'), num(c.rootMotion ?? 0, 1, v => { c.rootMotion = v; emit('clip'); }),
      h('label', {}, 'สะบัดตาม'), drag,
      h('div', { class: 'full' }, chk('เล่นวน (loop)', c.loop, v => (c.loop = v))),
      h('div', { class: 'full' }, chk('แขน + อาวุธหมุนตามทิศที่เล็ง', !!c.aim, v => (c.aim = v), 'ในเกม แขนหน้าจะหมุนตามเป้าหมาย')),
      h('div', { class: 'full' }, chk('ท่าปิดคอมโบ', !!c.comboEnd, v => (c.comboEnd = v))),
      h('div', { class: 'full' }, chk('คุมทั้งตัว (ไม่ผสมท่ายืน)', (c.mask ?? 'full') === 'full', v => (c.mask = v ? 'full' : 'upper'), 'ปิดไว้ = ใช้แค่หัว แขน มือ แล้ววางทับขาของท่ายืน/เดิน/วิ่ง')),
    ),
    h('div', { class: 'note info', style: 'margin-top:8px' },
      used.length ? `เกมใช้ท่านี้เป็น: ${used.join(', ')} ของ${WEAPONS[w] ?? w}` : 'ยังไม่ได้ผูกกับเกม เลือกช่องแล้วกด "ใช้ในเกม" จากนั้นกดบันทึกลงเกม',
      h('div', { class: 'pair', style: 'margin-top:6px' }, slot, h('button', { class: 'primary', style: 'padding:4px 10px', onclick: () => setBinding(w, (slot as HTMLSelectElement).value, c.id) }, 'ใช้ในเกม'))),
  );
}
const defaultSlot = (c: Clip) => (c.kind === 'hold' ? 'hold' : c.kind === 'idle' ? 'idle' : c.kind === 'walk' ? 'walk' : c.kind === 'run' ? 'run' : c.kind === 'skill' ? 'skills' : 'attack');

// ---------- key card ----------
function easeCurve(e: Ease) {
  const cv = h('canvas', { class: 'easeview', width: 260, height: 46 }) as HTMLCanvasElement, g = cv.getContext('2d')!;
  requestAnimationFrame(() => {
    const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H); g.strokeStyle = '#ffffff14'; g.strokeRect(6.5, 6.5, W - 13, H - 13);
    g.beginPath(); for (let i = 0; i <= 60; i++) { const k = i / 60, x = 6 + k * (W - 12), y = H - 6 - EASE_FN[e](k) * (H - 12); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = '#f5c542'; g.lineWidth = 2; g.stroke();
  });
  return cv;
}
function keyCard(c: Clip) {
  const k = keyAt(S.t) ?? (S.sel.size === 1 ? [...S.sel][0] : null);
  if (!k) return h('div', { class: 'card' }, h('h3', {}, 'Keyframe'),
    h('div', { class: 'note' }, 'หัวอ่านไม่ได้อยู่บนคีย์ ', S.view.autoKey ? 'ลากกระดูกหรือขยับสไลเดอร์เพื่อสร้างคีย์อัตโนมัติ หรือ ' : '', h('button', { class: 'iconbtn', onclick: () => edit(() => { editKey(); }) }, '+ ใส่คีย์ (S)')));
  const i = c.keys.indexOf(k);
  const set = (fn: (k: ClipKey) => void) => edit(() => { fn(k); build(); });
  const hitOn = !!k.hit;
  const hit = k.hit ?? { t: 'high' as const, dmg: 10, push: 16 };
  return h('div', { class: 'card' },
    h('h3', {}, 'Keyframe', h('small', {}, `คีย์ที่ ${i + 1} จาก ${c.keys.length}`), h('span', { class: 'act' },
      h('button', { class: 'iconbtn', title: 'คีย์ก่อนหน้า (J)', onclick: () => c.keys[i - 1] && (setTime(c.keys[i - 1].t), (S.sel = new Set([c.keys[i - 1]])), emit('sel')) }, '‹'),
      h('button', { class: 'iconbtn', title: 'คีย์ถัดไป (K)', onclick: () => c.keys[i + 1] && (setTime(c.keys[i + 1].t), (S.sel = new Set([c.keys[i + 1]])), emit('sel')) }, '›'),
      h('button', { class: 'iconbtn', title: 'ลบคีย์ (Del)', onclick: () => deleteKeys([k]) }, '🗑'))),
    h('div', { class: 'f' },
      h('label', {}, 'เวลา (วิ)'), num(k.t, 1 / S.fps, v => { k.t = round(Math.max(0, v)); c.len = Math.max(c.len, k.t); setTime(k.t); emit('clip'); }, { min: '0' }),
      h('label', {}, 'เข้าหาคีย์แบบ'), h('select', { onchange: (e: Event) => set(k => (k.e = (e.target as HTMLSelectElement).value as Ease)) }, ...EASES.map(es => opt(es, EASE_TH[es], k.e === es))),
      h('div', { class: 'full' }, easeCurve(k.e)),
      h('label', {}, 'มือ'), h('select', { onchange: (e: Event) => set(k => (k.h = (e.target as HTMLSelectElement).value as ClipKey['h'])) }, ...HANDS.map(x => opt(x, HAND_TH[x], (k.h ?? 'relax') === x))),
      h('div', { class: 'full' }, chk('จังหวะโดน (hit) ที่คีย์นี้', hitOn, v => { if (v) k.hit = { ...hit }; else delete k.hit; build(); })),
      ...(hitOn ? [
        h('label', {}, 'ตำแหน่ง'), h('select', { onchange: (e: Event) => set(k => (k.hit!.t = (e.target as HTMLSelectElement).value as 'high')) }, opt('high', 'บน', hit.t === 'high'), opt('low', 'ล่าง/ท้อง', hit.t === 'low'), opt('launch', 'ลอยล้ม', hit.t === 'launch')),
        h('label', {}, 'ดาเมจ / ผลัก'), h('div', { class: 'pair' }, num(hit.dmg, 1, v => { k.hit!.dmg = v; emit('clip'); }), num(hit.push, 1, v => { k.hit!.push = v; emit('clip'); })),
        h('div', { class: 'full' }, chk('เป็นเตะ/หมัด (เสียงต่าง)', !!hit.kick, v => { k.hit!.kick = v || undefined; })),
      ] : []),
      h('label', {}, 'ยิงออกไป'), h('select', { onchange: (e: Event) => set(k => { const v = (e.target as HTMLSelectElement).value; if (v === 'none') delete k.shoot; else k.shoot = { kind: v as 'arrow', hit: k.shoot?.hit ?? { t: 'high', dmg: 8, push: 10 } }; }) },
        opt('none', 'ไม่มี', !k.shoot), opt('arrow', 'ลูกธนู', k.shoot?.kind === 'arrow'), opt('bullet', 'กระสุน', k.shoot?.kind === 'bullet'), opt('orb', 'ลูกเวท', k.shoot?.kind === 'orb'), opt('nova', 'คลื่นเวท', k.shoot?.kind === 'nova')),
      h('div', { class: 'full' }, chk('ตัวกระแทกพื้น (สั่นจอ)', !!k.thud, v => { if (v) k.thud = true; else delete k.thud; })),
    ));
}

// ---------- bones card ----------
type SL = { id: BoneId | 'dx' | 'dy'; th: string; min: number; max: number };
const GROUPS: { th: string; items: SL[] }[] = [
  { th: 'ลำตัว + หัว', items: [{ id: 'dx', th: 'ตัว ซ้าย/ขวา', min: -120, max: 120 }, { id: 'dy', th: 'ตัว ขึ้น/ลง', min: -80, max: 80 }, { id: 'root', th: 'หมุนทั้งตัว', min: -180, max: 180 }, { id: 'spine', th: 'เอนลำตัว', min: -90, max: 90 }, { id: 'head', th: 'หมุนหัว', min: -90, max: 90 }, { id: 'wing', th: 'ปีก/ผ้าคลุม', min: -90, max: 90 }] },
  { th: 'แขนหน้า (มืออาวุธ)', items: [{ id: 'armR_u', th: 'ต้นแขน', min: -180, max: 180 }, { id: 'armR_l', th: 'ข้อศอก', min: -180, max: 180 }, { id: 'handR', th: 'ข้อมือ', min: -180, max: 180 }] },
  { th: 'แขนหลัง', items: [{ id: 'armL_u', th: 'ต้นแขน', min: -180, max: 180 }, { id: 'armL_l', th: 'ข้อศอก', min: -180, max: 180 }, { id: 'handL', th: 'ข้อมือ', min: -180, max: 180 }] },
  { th: 'ขาหน้า', items: [{ id: 'legR_u', th: 'สะโพก', min: -180, max: 180 }, { id: 'legR_l', th: 'เข่า', min: -180, max: 180 }] },
  { th: 'ขาหลัง', items: [{ id: 'legL_u', th: 'สะโพก', min: -180, max: 180 }, { id: 'legL_l', th: 'เข่า', min: -180, max: 180 }] },
];
const closed = new Set<string>();
const sliders: { it: SL; range: HTMLInputElement; box: HTMLInputElement; lab: HTMLElement; row: HTMLElement }[] = [];
function bonesCard() {
  sliders.length = 0;
  const card = h('div', { class: 'card' }, h('h3', {}, 'Bones', h('small', {}, 'ค่าต่างจากท่าพัก ณ หัวอ่าน'), h('span', { class: 'act' }, h('button', { class: 'iconbtn', title: 'คืนค่ากระดูกที่เลือก (R)', onclick: () => edit(() => { const k = editKey(); if (k) k.a[S.bone] = restA[S.bone]; }) }, 'รีเซ็ต'))));
  for (const g of GROUPS) {
    const grp = h('div', { class: 'grp' + (closed.has(g.th) ? ' closed' : '') }, h('button', { onclick: () => { closed.has(g.th) ? closed.delete(g.th) : closed.add(g.th); grp.classList.toggle('closed'); } }, g.th));
    for (const it of g.items) {
      const range = h('input', { type: 'range', min: String(it.min), max: String(it.max), step: '0.5' }) as HTMLInputElement;
      const box = h('input', { type: 'number', step: '1' }) as HTMLInputElement;
      const lab = h('label', { onclick: () => { if (it.id !== 'dx' && it.id !== 'dy') { S.bone = it.id; emit('sel'); } } }, it.th);
      const apply = (v: number) => { begin(); const k = editKey(); if (!k) return; if (it.id === 'dx') k.dx = v; else if (it.id === 'dy') k.dy = v; else k.a[it.id] = Math.round((restA[it.id] + v) * 10) / 10; if (it.id !== 'dx' && it.id !== 'dy') S.bone = it.id; emit('clip'); };
      range.addEventListener('input', () => { box.value = String(Math.round(+range.value)); apply(+range.value); });
      range.addEventListener('change', commit);
      box.addEventListener('input', () => { if (box.value !== '' && Number.isFinite(+box.value)) { range.value = box.value; apply(+box.value); } });
      box.addEventListener('change', commit);
      const row = h('div', { class: 'sl' }, lab, range, box); grp.append(row); sliders.push({ it, range, box, lab, row });
    }
    card.append(grp);
  }
  return card;
}
function refreshSliders() {
  const c = clip(); if (!c) return;
  const p = evalClip(c, S.t).pose, k = keyAt(S.t), K = c.keys, i = k ? K.indexOf(k) : -1;
  for (const s of sliders) {
    const id = s.it.id;
    const v = id === 'dx' ? p.x - 300 : id === 'dy' ? p.y - 292 : p.a[id] - restA[id];
    if (document.activeElement !== s.range) s.range.value = String(v);
    if (document.activeElement !== s.box) s.box.value = String(Math.round(v * 10) / 10);
    s.row.classList.toggle('on', id === S.bone);
    // dot: this value changes at this key compared to the previous one
    const prev = i > 0 ? K[i - 1] : null, cur = k;
    const ch = !!(cur && prev && (id === 'dx' ? cur.dx !== prev.dx : id === 'dy' ? cur.dy !== prev.dy : (cur.a[id] ?? restA[id]) !== (prev.a[id] ?? restA[id])));
    s.lab.classList.toggle('anim', ch);
  }
}

let built = '';
export function build() {
  const c = clip(); if (!c) return;
  const keep = root.scrollTop;
  root.innerHTML = ''; root.append(clipCard(c), keyCard(c), bonesCard()); refreshSliders();
  root.scrollTop = keep; built = c.id + '|' + (keyAt(S.t)?.t ?? 'x') + '|' + c.keys.length;
}
const sig = () => { const c = clip(); return c ? c.id + '|' + (keyAt(S.t)?.t ?? 'x') + '|' + c.keys.length : ''; };
// rebuild when the open clip or the key under the playhead changes; otherwise just move the sliders
on(['clip', 'time', 'sel', 'lib'], () => { if (sig() !== built && !root.contains(document.activeElement) ) build(); else refreshSliders(); });
export { BMAP };
