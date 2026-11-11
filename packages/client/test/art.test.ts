import { describe, it, expect } from 'vitest';
import { rig, EQUIP_BASE, presetEquip } from '@sketchbound/shared';
import { figureSvg } from '../src/art';

const fig = (eq: Record<string, string>, def: object = {}) =>
  figureSvg({ eq, pose: (rig.mkPose as (d: object) => unknown)(def), px: rig.HOME.x, dir: 1, hand: 'relax', noHit: true }) as string;
const strokes = (svg: string) => [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="#1b1b1d" stroke-width="5"/g)].map(m => m[1]);
const start = (d: string) => d.match(/^M([-\d.]+),([-\d.]+)/)!.slice(1).map(Number);

describe('marker body', () => {
  it('is the default look: even strokes, a solid head, no eyes and no wobble filter on the body', () => {
    expect(EQUIP_BASE.body).toBe('marker');
    const svg = fig(EQUIP_BASE);
    expect(strokes(svg)).toHaveLength(5);                 // two arms, two legs, the spine
    expect(svg).toContain('<circle cx="25" cy="0" r="15.5"');
    expect(svg).not.toContain('<ellipse');                // the first look's eyes and joint blobs
    expect(svg).not.toContain('url(#pc)');
    expect(svg.split('url(#wA)')[1].split('</g></g></g>')[0]).not.toContain('stroke-width="5"'); // only floor marks are filtered
  });

  it('starts both legs and the spine at the hip pivot, and both arms at one shoulder point, in any pose', () => {
    for (const name of ['idle', 'squat', 'lotus', 'lunge', 'cheer']) {
      const def = (rig.POSES as Record<string, { def: object }>)[name].def;
      const pose = (rig.mkPose as (d: object) => { x: number; y: number })(def);
      const [armL, legL, legR, spine, armR] = strokes(fig(EQUIP_BASE, def)).map(start);
      for (const p of [legL, legR, spine]) { expect(p[0], name).toBeCloseTo(pose.x, 0); expect(p[1], name).toBeCloseTo(pose.y, 0); }
      expect(armL, name).toEqual(armR);
    }
  });

  it('keeps gear on its bone, and the first pencil look is still there on request', () => {
    const knight = fig(presetEquip('knight'));
    expect(strokes(knight)).toHaveLength(5);
    expect(knight.length).toBeGreaterThan(fig(EQUIP_BASE).length);
    const pencil = fig({ ...EQUIP_BASE, body: 'pencil' });
    expect(strokes(pencil)).toHaveLength(0);
    expect(pencil).toContain('url(#pc)');
    expect(pencil).toContain('<ellipse');
  });
});
