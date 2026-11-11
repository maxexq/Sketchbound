import { describe, it, expect } from 'vitest';
import { Zone, attackEvents, buildLayout, MAPS, MOBS, rng, rig } from '../src';

const run = (z: Zone, seconds: number) => { const ev = []; for (let i = 0; i < seconds * 20; i++) ev.push(...z.step(0.05)); return ev; };

describe('layout', () => {
  it('is the same every time for the same map', () => {
    const a = buildLayout(MAPS['pencil-field']), b = buildLayout(MAPS['pencil-field']);
    expect(a.obstacles).toEqual(b.obstacles);
    expect(a.spawns).toHaveLength(17);
  });
});

describe('rig', () => {
  it('every track evaluates to finite bone angles', () => {
    for (const name of Object.keys(rig.TRACKS)) {
      const len = rig.animLen(name);
      for (let t = 0; t < len; t += len / 7) {
        const W = rig.solve(rig.animate(name, t).pose);
        for (const b of Object.values(W) as { x: number; y: number; r: number }[]) expect(Number.isFinite(b.x + b.y + b.r)).toBe(true);
      }
    }
  });
  it('slash lands one hit, volley fires three arrows', () => {
    expect(attackEvents('slash', 1).filter(e => e.hit)).toHaveLength(1);
    expect(attackEvents('volley', 1).filter(e => e.shoot)).toHaveLength(3);
  });
});

describe('zone', () => {
  it('two players see and hit the same mob, server decides the damage', () => {
    const z = new Zone('pencil-field', rng(1));
    const p1 = z.join('หนึ่ง', 'samurai'), p2 = z.join('สอง', 'knight');
    const m = z.mobs.find(q => q.kind === 'eraser')!;
    z.input(p1.id, { t: 'target', id: m.id });
    z.input(p2.id, { t: 'target', id: m.id });
    const ev = run(z, 20);
    const hitters = new Set(ev.filter(e => e.k === 'dmg').map(e => (e as { by: number }).by));
    expect(hitters).toEqual(new Set([p1.id, p2.id]));
    expect(ev.some(e => e.k === 'exp')).toBe(true);
    const v = z.views();
    expect(v.players).toHaveLength(2);
    expect(v.mobs.find(q => q.id === m.id)).toBeDefined();
  });

  it('a ranged player kills with arrows', () => {
    const z = new Zone('pencil-field', rng(2));
    const p = z.join('ธนู', 'archer');
    const m = z.mobs.find(q => q.kind === 'scrib')!;
    z.input(p.id, { t: 'target', id: m.id });
    const ev = run(z, 25);
    expect(ev.filter(e => e.k === 'dmg').length).toBeGreaterThan(0);
    expect(p.exp + (p.lv - 1) * 40).toBeGreaterThanOrEqual(MOBS.scrib.exp);
  });

  it('skills cost SP and refuse when SP is short', () => {
    const z = new Zone('pencil-field', rng(3));
    const p = z.join('เวท', 'mage');
    p.sp = 2;
    z.input(p.id, { t: 'skill', k: 2 });
    expect(z.step(0.05)).toContainEqual({ k: 'info', id: p.id, txt: 'SP ไม่พอ' });
  });

  it('clicking the ground walks there', () => {
    const z = new Zone('pencil-field', rng(4));
    const p = z.join('เดิน');
    const goal = { x: p.x + 120, z: p.z };
    z.input(p.id, { t: 'move', ...goal });
    run(z, 2);
    expect(Math.hypot(p.x - goal.x, p.z - goal.z)).toBeLessThan(10);
    expect(p.anim.n).toBe('idle');
  });
});
