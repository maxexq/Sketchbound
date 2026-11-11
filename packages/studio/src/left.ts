// Left side: the one-shot weapon hold wizard, what the game uses now, my clips, and templates.
import { figureSvg } from '@sketchbound/client/art';
import { rig, templates, poseTemplates, evalClip, keyPose, poseToKeyFields, restPose, KIND_TH, HOME, EQUIP_BASE, type Pose, type Clip, type ClipKey } from '@sketchbound/shared';
import { S, clip, emit, on, openClip, addClip, newFromTemplate, newBlank, deleteClip, restoreClip, syncState, applyPose, uniqueId, bindingsFor } from './state';
import { h, modal, menu, toast } from './ui';
import { WEAPONS, SLOT_TH, saveToGame, removeFromGame } from './sync';

const root = document.getElementById('left')!;
const wtype = rig.wtype as (eq: Record<string, string>) => string;

/** a small static drawing of a pose (no pencil filters, so dozens stay cheap) */
export function thumbSvg(pose: Pose, hand = 'relax', eq: Record<string, string> = S.eq, vb = '170 140 260 230') {
  const f = figureSvg({ eq, pose, px: HOME.x, dir: 1, hand, noHit: true }).replace(/ filter="url\(#(wA|pc)\)"/g, '');
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"><path d="M170,342 L430,342" stroke="#1b1b1d" stroke-width="1.2" opacity=".25"/>${f}</svg>`;
}
const showT = (c: Clip) => c.keys.find(k => k.hit || k.shoot)?.t ?? c.len * 0.45;

// a sensible starting grip for each weapon family; the user drags it into shape
const HOLD_SEED: Record<string, Partial<Record<string, number>>> = {
  blade: { spine: -88, head: 4, armR_u: 120, armR_l: -75, handR: -60, armL_u: 130, armL_l: -90, handL: -40 },
  pole: { spine: -88, armR_u: 105, armR_l: -40, handR: -20, armL_u: 140, armL_l: -60, handL: -30 },
  fist: { spine: -86, head: 6, armR_u: 120, armR_l: -95, handR: -40, armL_u: 128, armL_l: -100, handL: -40 },
  bow: { spine: -90, armR_u: 120, armR_l: -20, handR: -70, armL_u: 175, armL_l: -20 },
  gun: { spine: -90, armR_u: 140, armR_l: -60, handR: -30, armL_u: 170, armL_l: -40 },
  magic: { spine: -90, armR_u: 125, armR_l: -45, handR: -30, armL_u: 175, armL_l: -25 },
};
export function holdWizard() {
  modal(close => h('div', { style: 'width:min(620px,92vw)' },
    h('h2', {}, 'ทำท่าถืออาวุธ', h('small', {}, 'ภาพเดียว แล้วเกมใช้กับยืน เดิน วิ่ง และก่อนตี')),
    h('ol', { class: 'steps', style: 'margin-top:8px' },
      h('li', {}, h('b', {}, '1'), 'เลือกอาวุธด้านล่าง'), h('li', {}, h('b', {}, '2'), 'ลากจุดสีจัดแขนกับมือให้ถืออาวุธในภาพเดียว'), h('li', {}, h('b', {}, '3'), 'กด "บันทึกลงเกม" มุมขวาบน ท่าเดิน วิ่ง ยืน เกมทำให้เอง')),
    h('div', { class: 'wgrid' }, ...Object.entries(WEAPONS).filter(([w]) => w !== 'none').map(([w, th]) => {
      const eq = { ...EQUIP_BASE, weapon: w }, seed = HOLD_SEED[wtype(eq)] ?? HOLD_SEED.blade, p = restPose(); Object.assign(p.a, seed);
      const b = h('button', { onclick: () => {
        close(); S.eq.weapon = w;
        const existing = bindingsFor(w).hold;
        if (existing && S.lib[existing]) { openClip(existing); toast('เปิดท่าถือเดิมของ' + th + 'ให้แก้ต่อ'); return; }
        const k: ClipKey = { t: 0, e: 'io', ...poseToKeyFields(p), h: 'grip' };
        addClip({ v: 1, id: 'hold_' + w, name: 'ถือ' + th, kind: 'hold', loop: false, len: 0.5, mask: 'upper', weapon: w, aim: true, keys: [k] });
        S.view.overlayHold = true; emit('eq', 'view');
        toast('ลากจุดสีจัดท่าถือ แล้วกด "บันทึกลงเกม"', 'ok');
      } }); b.innerHTML = thumbSvg(p, 'grip', eq, '200 150 220 210') + `<span>${th}</span>`; return b;
    }))));
}

function heroCard() {
  return h('div', { class: 'card hero' },
    h('button', { class: 'primary', onclick: holdWizard }, '+ ทำถืออาวุธ · ช็อตเดียว'),
    h('p', {}, 'ง่ายสุด: เลือกอาวุธ → ', h('b', {}, 'ลากจุดสีจัดท่าภาพเดียว'), ' → ', h('b', {}, 'บันทึกลงเกม'), ' · ท่ายืน เดิน วิ่ง เกมทำให้เอง'));
}

function gameCard() {
  const w = S.eq.weapon, b = bindingsFor(w);
  const nm = (id?: string) => (id ? S.lib[id]?.name ?? S.game.clips[id]?.name ?? id : '');
  const rows = (['hold', 'idle', 'walk', 'run', 'attack'] as const).map(slot => {
    const id = b[slot];
    return h('div', { class: 'row', onclick: () => id && S.lib[id] && openClip(id), title: id ? 'เปิดคลิปนี้' : 'ใช้ท่ามาตรฐานของเกม' },
      h('span', { class: 'nm' }, SLOT_TH[slot]), id ? h('span', { class: 'ok' }, '✓ ' + nm(id)) : h('span', { class: 'none' }, 'ท่ามาตรฐาน'));
  });
  for (const s of b.skills ?? []) rows.push(h('div', { class: 'row', onclick: () => S.lib[s] && openClip(s) }, h('span', { class: 'nm' }, 'สกิล'), h('span', { class: 'ok' }, '✓ ' + nm(s))));
  const others = Object.entries(S.game.bindings).filter(([k, v]) => k !== w && Object.keys(v).length);
  return h('div', { class: 'card' },
    h('h3', {}, 'ท่าที่เกมใช้อยู่', h('small', {}, WEAPONS[w] ?? w)),
    h('div', { class: 'list' }, ...rows),
    others.length ? h('div', { class: 'note', style: 'margin-top:6px' }, 'อาวุธอื่นที่มีท่าของเรา: ', ...others.map(([k], i) => h('a', { href: '#', style: 'color:var(--accent2)', onclick: (e: Event) => { e.preventDefault(); S.eq.weapon = k; emit('eq', 'lib'); } }, (i ? ', ' : '') + (WEAPONS[k] ?? k)))) : null);
}

let filter = '', kindF = '';
function libCard() {
  const q = h('input', { class: 'search', placeholder: 'ค้นหาคลิป…', value: filter }) as HTMLInputElement;
  q.addEventListener('input', () => { filter = q.value; list.replaceChildren(...items()); });
  const items = () => Object.values(S.lib)
    .filter(c => (!filter || (c.name + c.id).toLowerCase().includes(filter.toLowerCase())) && (!kindF || c.kind === kindF))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'th'))
    .map(c => {
      const st = syncState(c.id);
      const r = h('div', { class: 'row' + (c.id === S.id ? ' on' : ''), onclick: () => openClip(c.id), oncontextmenu: (e: MouseEvent) => { e.preventDefault(); clipMenu(e, c); } },
        h('span', { class: 'dot ' + (st === 'synced' ? 'ok' : st === 'local' ? 'local' : ''), title: st === 'synced' ? 'ตรงกับในเกม' : st === 'local' ? 'ยังไม่อยู่ในเกม' : 'แก้แล้ว ยังไม่บันทึกลงเกม' }),
        h('span', { class: 'nm' }, c.name), h('span', { class: 'meta' }, KIND_TH[c.kind]));
      return r;
    });
  const list = h('div', { class: 'list' }, ...items());
  const kinds = h('select', { style: 'background:var(--bg);border:1px solid var(--line2);border-radius:6px;font-size:11.5px', onchange: (e: Event) => { kindF = (e.target as HTMLSelectElement).value; list.replaceChildren(...items()); } },
    h('option', { value: '' }, 'ทุกชนิด'), ...Object.entries(KIND_TH).map(([k, v]) => h('option', { value: k, selected: kindF === k }, v)));
  return h('div', { class: 'card' },
    h('h3', {}, 'คลิปของฉัน', h('span', { class: 'act' }, kinds, h('button', { class: 'iconbtn', title: 'คลิปเปล่าใหม่', onclick: (e: MouseEvent) => menu(e.clientX, e.clientY, Object.entries(KIND_TH).map(([k, v]) => ({ label: 'คลิปเปล่า · ' + v, run: () => newBlank(k as Clip['kind']) }))) }, '+'))),
    q, list,
    S.trash.length ? h('button', { class: 'iconbtn', style: 'margin-top:6px', onclick: (e: MouseEvent) => menu(e.clientX, e.clientY, S.trash.map((t, i) => ({ label: `กู้คืน "${t.clip.name}" · ${ago(t.at)}`, run: () => restoreClip(i) }))) }, `🗑 ลบล่าสุด (${S.trash.length}) · กู้คืน`) : null);
}
const ago = (at: number) => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'เมื่อกี้' : m < 60 ? `${m} นาทีก่อน` : m < 1440 ? `${Math.round(m / 60)} ชม.ก่อน` : `${Math.round(m / 1440)} วันก่อน`; };
function clipMenu(e: MouseEvent, c: Clip) {
  menu(e.clientX, e.clientY, [
    { label: 'เปิด', run: () => openClip(c.id) },
    { label: 'ทำสำเนา', run: () => addClip({ ...structuredClone(c), id: uniqueId(c.id + '_copy'), name: c.name + ' (สำเนา)' }) },
    { label: 'บันทึกลงเกม', run: () => saveToGame(c.id) },
    ...(S.game.clips[c.id] ? [{ label: 'เอาออกจากเกม', run: () => removeFromGame(c.id) }] : []),
    '-',
    { label: 'ลบจากคลังนี้', run: () => { deleteClip(c.id); toast(`ลบ "${c.name}" แล้ว${S.game.clips[c.id] ? ' (ในเกมยังอยู่)' : ''}`, '', { label: 'เลิกทำ', run: () => restoreClip(0) }); } },
  ]);
}

let tab: 'clips' | 'poses' = 'clips';
const TCACHE = new Map<string, string>();
function tplCard() {
  const tabs = h('div', { class: 'tabs' },
    h('button', { class: tab === 'clips' ? 'on' : '', onclick: () => { tab = 'clips'; render(); } }, 'ท่าเคลื่อนไหว'),
    h('button', { class: tab === 'poses' ? 'on' : '', onclick: () => { tab = 'poses'; render(); } }, 'ท่านิ่ง'));
  const grid = h('div', { class: 'thumbs' });
  const eqKey = S.eq.weapon + S.eq.outfit + S.eq.hair;
  if (tab === 'clips') for (const t of templates()) {
    const key = 'c' + t.id + eqKey; let svg = TCACHE.get(key);
    if (!svg) { const c = t.clip(), s = evalClip(c, showT(c)); svg = thumbSvg(s.pose, s.hand); TCACHE.set(key, svg); }
    const b = h('button', { class: 'thumb', title: 'เริ่มคลิปใหม่จาก ' + t.name, onclick: () => { newFromTemplate(t.id, t.name + ' (ของฉัน)'); toast('สร้างคลิปจากเทมเพลต ' + t.name, 'ok'); } });
    b.innerHTML = svg + `<span>${t.name}</span>`; grid.append(b);
  } else for (const p of poseTemplates()) {
    const key = 'p' + p.id + eqKey; let svg = TCACHE.get(key);
    if (!svg) { svg = thumbSvg(keyPose(p.key), p.hand); TCACHE.set(key, svg); }
    const b = h('button', { class: 'thumb', title: 'ใช้ท่านี้กับคีย์ที่หัวอ่าน', onclick: () => { applyPose(p.key, p.hand); toast('ใส่ท่า ' + p.name + ' ที่หัวอ่าน', 'ok'); } });
    b.innerHTML = svg + `<span>${p.name}</span>`; grid.append(b);
  }
  return h('div', { class: 'card' },
    h('h3', {}, 'Templates', h('small', {}, tab === 'clips' ? 'แม่แบบท่า · กดเพื่อเริ่ม' : 'กดเพื่อใส่ท่าที่คีย์ปัจจุบัน')),
    h('ol', { class: 'steps', style: 'margin-bottom:8px' }, h('li', {}, h('b', {}, '1'), 'กดเลือกแม่แบบด้านล่าง'), h('li', {}, h('b', {}, '2'), 'ลากจุดสีบนตัวละครให้ได้ท่าที่ชอบ'), h('li', {}, h('b', {}, '3'), 'กด บันทึกลงเกม มุมขวาบน')),
    tabs, grid);
}

export function render() {
  const keep = root.scrollTop;
  root.replaceChildren(heroCard(), gameCard(), libCard(), tplCard());
  root.scrollTop = keep;
}
on(['lib', 'sync', 'eq'], () => { if (!root.contains(document.activeElement) || document.activeElement?.tagName !== 'INPUT') render(); });
export { clip };
