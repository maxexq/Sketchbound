// "ผลในเกม": the character as the game will play it, stand / walk / run / stand → attack,
// using what the game has bound for the weapon, with the open clip swapped in where it fits.
import { figureSvg } from '@sketchbound/client/art';
import { rig, templateById, evalClip, composePose, clipEnd, HOME, type Clip } from '@sketchbound/shared';
import { S, clip, bindingsFor } from './state';
import { h, modal } from './ui';
import { WEAPONS } from './sync';

const wtype = rig.wtype as (eq: Record<string, string>) => string;
const ATKSET = rig.ATKSET as Record<string, string[]>;
const get = (id?: string): Clip | undefined => (id ? S.lib[id] ?? S.game.clips[id] : undefined);

export function openPreview() {
  const c = clip(), w = S.eq.weapon, b = bindingsFor(w);
  const pick = (slot: 'idle' | 'walk' | 'run' | 'attack'): Clip => {
    if (c.kind === slot || (slot === 'attack' && c.kind === 'skill')) return c;
    return get(b[slot]) ?? (slot === 'attack' ? templateById(ATKSET[wtype(S.eq)]?.[0] ?? 'slash')!.clip() : templateById(slot)!.clip());
  };
  const hold = c.kind === 'hold' ? c : get(b.hold);
  const idle = pick('idle'), walk = pick('walk'), run = pick('run'), atk = pick('attack');
  const cards = [
    { th: 'ยืน', sub: idle.name, play: (t: number) => ({ c: idle, t, scroll: 0 }) },
    { th: 'เดิน', sub: walk.name, play: (t: number) => ({ c: walk, t, scroll: evalClip(walk, t).root }) },
    { th: 'วิ่ง', sub: run.name, play: (t: number) => ({ c: run, t, scroll: evalClip(run, t).root }) },
    { th: 'ยืน → ตี', sub: atk.name, play: (t: number) => { const L = clipEnd(atk) / (atk.rate ?? 1), cyc = 1.1 + L + 0.4, u = t % cyc; return u < 1.1 ? { c: idle, t: u, scroll: 0 } : u < 1.1 + L ? { c: atk, t: (u - 1.1) * (atk.rate ?? 1), scroll: 0 } : { c: idle, t: u, scroll: 0 }; } },
  ];
  const svgs: SVGSVGElement[] = [];
  let raf = 0; const t0 = performance.now();
  const frame = () => {
    const t = (performance.now() - t0) / 1000;
    cards.forEach((cd, i) => {
      const p = cd.play(t), s = evalClip(p.c, p.t);
      // holds only replace the arms on body moves; attacks keep their own arms
      const pose = hold && p.c.kind !== 'attack' && p.c.kind !== 'skill' && p.c !== hold ? composePose(s.pose, evalClip(hold, 0).pose, hold.mask ?? 'upper') : s.pose;
      let ticks = ''; const off = -(p.scroll % 30); for (let x = 150 + off; x < 460; x += 30) ticks += `M${x.toFixed(1)},346 l-6,8 `;
      svgs[i].innerHTML = `<ellipse cx="${HOME.x}" cy="343" rx="46" ry="7" fill="#1b1b1d" opacity=".12"/><path d="M150,342 L450,342" stroke="#1b1b1d" stroke-width="1.4" opacity=".35"/><path d="${ticks}" stroke="#1b1b1d" opacity=".2"/>` +
        figureSvg({ eq: S.eq, pose, px: HOME.x, dir: 1, hand: s.hand, noHit: true });
    });
    raf = requestAnimationFrame(frame);
  };
  modal(() => h('div', { style: 'width:min(980px,94vw)' },
    h('h2', {}, 'ผลในเกม', h('small', {}, `${WEAPONS[w] ?? w} · ${hold ? 'ใช้ท่าถือ "' + hold.name + '"' : 'ยังไม่มีท่าถือ ใช้ท่ามาตรฐาน'}`)),
    h('div', { class: 'cards4' }, ...cards.map(cd => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '190 140 220 230'); svgs.push(s);
      return h('div', { class: 'pv' }, s, h('b', {}, cd.th), h('small', {}, cd.sub));
    })),
    h('p', { class: 'note', style: 'margin-top:12px' }, 'คลิปที่เปิดอยู่จะถูกใส่แทนช่องที่ตรงชนิด ช่องอื่นใช้ท่าที่เกมผูกไว้กับอาวุธนี้ หรือท่ามาตรฐาน · กด "บันทึกลงเกม" แล้วเกมใช้ท่าใหม่ทันที')),
  () => cancelAnimationFrame(raf));
  raf = requestAnimationFrame(frame);
}
