// Import / export: one clip, my whole library, the game pack, the old prototype's moves, and PNG sprite sheets.
import { figureSvg, DEFS } from '@sketchbound/client/art';
import { validateClip, poseToKeyFields, evalClip, clipEnd, HOME, type Clip, type ClipPack, type ClipKey, type Pose } from '@sketchbound/shared';
import { S, clip, addClip } from './state';
import { h, modal, toast, download } from './ui';
import { gamePack } from './sync';

const file = document.getElementById('file') as HTMLInputElement;
export function importFiles() { file.value = ''; file.click(); }
file.addEventListener('change', async () => {
  let n = 0; const bad: string[] = [];
  for (const f of Array.from(file.files ?? [])) {
    try { for (const c of toClips(JSON.parse(await f.text()))) { const e = validateClip(c); if (e.length) bad.push(`${c.id ?? f.name}: ${e[0]}`); else { addClip(c, n === 0); n++; } } }
    catch (e) { bad.push(f.name + ': ' + (e as Error).message); }
  }
  if (n) toast(`นำเข้า ${n} คลิป`, 'ok');
  if (bad.length) toast('นำเข้าไม่ได้: ' + bad.slice(0, 2).join(' · '), 'err');
});

type Legacy = Record<string, { th?: string; keys: { d: number; e: string; h?: string; pose: Pose; hit?: ClipKey['hit']; shoot?: ClipKey['shoot']; thud?: boolean }[] }>;
/** accepts a clip, an array of clips, a clip pack / library, or the prototype's saved moves */
function toClips(j: unknown): Clip[] {
  if (Array.isArray(j)) return j as Clip[];
  const o = j as Record<string, unknown>;
  if (o && o.v === 1 && Array.isArray(o.keys)) return [o as unknown as Clip];
  if (o && typeof o.clips === 'object') return Object.values(o.clips as Record<string, Clip>);
  // prototype Pose Studio (localStorage sticky-world.moves.v1): keys carry durations and full poses
  const legacy = Object.entries(o as Legacy).filter(([, m]) => m && Array.isArray(m.keys));
  if (legacy.length) return legacy.map(([id, m]) => {
    let t = 0; const keys: ClipKey[] = [{ t: 0, e: 'lin', dx: 0, dy: 0, a: {} }];
    for (const k of m.keys) { t += k.d; keys.push({ t: Math.round(t * 1000) / 1000, e: (['lin', 'io', 'out'].includes(k.e) ? k.e : 'io') as ClipKey['e'], ...poseToKeyFields(k.pose), h: k.h as ClipKey['h'], ...(k.hit ? { hit: k.hit } : {}), ...(k.shoot ? { shoot: k.shoot } : {}), ...(k.thud ? { thud: true } : {}) }); }
    return { v: 1, id: id.replace(/[^A-Za-z0-9_-]/g, '') || 'move', name: m.th ?? id, kind: 'attack', loop: false, len: t, keys, mask: 'full', weapon: 'any' } as Clip;
  });
  throw new Error('ไม่รู้จักรูปแบบไฟล์');
}

export function exportMenu() {
  const c = clip();
  modal(close => h('div', { style: 'width:min(560px,92vw)' },
    h('h2', {}, 'Export'),
    h('div', { style: 'display:grid;gap:8px;margin-top:10px' },
      opt('คลิปนี้ (.json)', `${c.name} · ${c.keys.length} คีย์`, () => download(`${c.id}.clip.json`, JSON.stringify(c, null, 1))),
      opt('คลังทั้งหมดของฉัน (.json)', `${Object.keys(S.lib).length} คลิป · ใช้ย้ายเครื่องหรือแบ็กอัป`, () => download('sketchbound-library.json', JSON.stringify({ v: 1, clips: S.lib, bindings: S.game.bindings } as ClipPack, null, 1))),
      opt('clips.json ของเกม', 'ไฟล์เดียวกับที่เกมโหลด วางที่ packages/shared/src/data/', () => download('clips.json', JSON.stringify(gamePack(), null, 1) + '\n')),
      opt('Sprite sheet (.png)', 'เรียงเฟรมเป็นแถว สำหรับเอนจินอื่นหรือโพสต์โชว์', () => { close(); spriteSheet(); }),
      opt('ภาพเฟรมนี้ (.svg)', 'ภาพเวกเตอร์ของท่า ณ หัวอ่าน', () => download(`${c.id}-${Math.round(S.t * 1000)}ms.svg`, frameSvg(evalClip(c, S.t).pose, evalClip(c, S.t).hand), 'image/svg+xml')),
    )));
  function opt(t: string, sub: string, run: () => void) {
    return h('button', { class: 'card', style: 'text-align:left;cursor:pointer', onclick: () => { run(); } }, h('b', {}, t), h('div', { style: 'font-size:12px;color:var(--muted)' }, sub));
  }
}
const frameSvg = (pose: Pose, hand: string, size = 256) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="172 120 256 256" width="${size}" height="${size}">${DEFS}${figureSvg({ eq: S.eq, pose, px: HOME.x, dir: S.view.flip ? -1 : 1, hand, noHit: true })}</svg>`;

async function spriteSheet(fps = 12, size = 192) {
  const c = clip(), end = clipEnd(c), n = Math.max(1, Math.min(64, Math.round(end * fps)));
  const cols = Math.min(n, 8), rows = Math.ceil(n / cols), cv = h('canvas', { width: cols * size, height: rows * size }) as HTMLCanvasElement, g = cv.getContext('2d')!;
  toast(`กำลังวาด ${n} เฟรม…`);
  for (let i = 0; i < n; i++) {
    const s = evalClip(c, (end * i) / n), img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(frameSvg(s.pose, s.hand, size));
    await img.decode().catch(() => undefined);
    g.drawImage(img, (i % cols) * size, Math.floor(i / cols) * size, size, size);
  }
  cv.toBlob(b => { if (b) { download(`${c.id}-sheet-${n}f-${fps}fps.png`, b, 'image/png'); toast(`Sprite sheet ${cols}×${rows} (${size}px) · ${fps} fps`, 'ok'); } });
}
