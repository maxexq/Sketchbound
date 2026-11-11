import { describe, it, expect } from 'vitest';
import { rig, templates, poseTemplates, evalClip, clipToTrack, validateClip, registerClips, mirrorKey, composePose, restPose, type Clip } from '../src';

describe('clips', () => {
  it('every template is a valid clip that evaluates to finite poses', () => {
    for (const tpl of templates()) {
      const c = tpl.clip();
      expect(validateClip(c), tpl.id).toEqual([]);
      for (let t = 0; t <= c.len * 1.5; t += c.len / 9) {
        const W = rig.solve(evalClip(c, t).pose);
        for (const b of Object.values(W) as { x: number; y: number; r: number }[]) expect(Number.isFinite(b.x + b.y + b.r)).toBe(true);
      }
    }
    expect(poseTemplates().length).toBeGreaterThan(10);
  });

  it('a clip converted from a built-in track plays the same in the game', () => {
    const c = templates().find(t => t.id === 'slash')!.clip();
    const track = clipToTrack(c) as { t1: number }[];
    expect(track[track.length - 1].t1).toBeCloseTo(rig.animLen('slash'), 2);
    for (const t of [0.2, 0.4, 0.5, 0.9]) {
      const a = (rig.evalTrack as (tr: unknown, t: number) => { pose: { x: number; a: Record<string, number> } })(rig.TRACKS.slash, t).pose, b = evalClip(c, t).pose;
      expect(b.x).toBeCloseTo(a.x, 0);
      expect(b.a.armR_u).toBeCloseTo(a.a.armR_u, 0);
    }
  });

  it('registerClips makes a saved clip playable by id with its hits', () => {
    const c: Clip = { v: 1, id: 'test_jab', name: 'ทดสอบ', kind: 'attack', loop: false, len: 0.5, keys: [
      { t: 0, e: 'lin', dx: 0, dy: 0, a: {} },
      { t: 0.2, e: 'out', dx: 10, dy: 0, a: { armR_u: 90 }, hit: { t: 'high', push: 10, dmg: 7 } },
      { t: 0.4, e: 'io', dx: 0, dy: 0, a: {} },
    ] };
    registerClips({ v: 1, clips: { test_jab: c }, bindings: {} });
    expect(rig.animLen('test_jab')).toBeCloseTo(0.5, 2);
    expect((rig.ATTACKS as Record<string, { th: string }>).test_jab.th).toBe('ทดสอบ');
    const hits = ((rig.TRACKS as Record<string, unknown>).test_jab as { t1: number; hit: unknown }[]).filter(k => k.hit);
    expect(hits).toHaveLength(1); expect(hits[0].t1).toBeCloseTo(0.2, 2);
  });

  it('loops wrap from the last key to the first', () => {
    const c = templates().find(t => t.id === 'walk')!.clip();
    const a = evalClip(c, 0).pose, b = evalClip(c, c.len - 1e-4).pose;
    expect(Math.abs(a.a.legR_u - b.a.legR_u)).toBeLessThan(2);
    expect(evalClip(c, c.len * 2).root).toBeCloseTo(140, 0);
  });

  it('mirror swaps sides, upper mask keeps the legs', () => {
    expect(mirrorKey({ a: { armL_u: 1, armR_u: 2 } }).a).toEqual({ armL_u: 2, armR_u: 1 });
    const base = restPose(), over = restPose(); over.a.legR_u = 0; over.a.armR_u = 0;
    const p = composePose(base, over, 'upper');
    expect(p.a.armR_u).toBe(0); expect(p.a.legR_u).toBe(base.a.legR_u);
  });
});
