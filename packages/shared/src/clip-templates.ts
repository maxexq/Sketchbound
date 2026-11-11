// Starting points for Pose Studio and the MCP server: every built-in move, the procedural loops
// sampled into keys, a walk cycle, and the still poses.
import * as rig from './rig';
import { type Clip, type ClipKind, type Pose, trackToClip, sampleToClip, restPose, poseToKeyFields } from './clip';

type Anim = (n: string, t: number) => { pose: Pose; hand: string };
const animate = rig.animate as unknown as Anim;
const TRACKS = rig.TRACKS as Record<string, Parameters<typeof trackToClip>[3]>;
const ATT = rig.ATTACKS as Record<string, { th: string }>, REACTS = rig.REACTS as Record<string, { th: string }>;
const POSES = rig.POSES as Record<string, { th: string; g: string; hand: string; def: { dx?: number; dy?: number; a?: Record<string, number> } }>;

export interface Template { id: string; name: string; group: 'move' | 'attack' | 'react' | 'emote'; clip: () => Clip }
export interface PoseTemplate { id: string; name: string; group: string; hand: string; key: ReturnType<typeof poseToKeyFields> }

/** a walk: the run cycle with smaller swings, an upright back and bent arms swinging less */
function walk(t: number) {
  const q = t * 2 * Math.PI / 1.0, s = Math.sin(q), c = Math.cos(q), sm = (v: number) => { v = Math.max(0, v); return v * v * (3 - 2 * v); };
  const p = restPose();
  p.y += 1.5 - 3 * Math.abs(c);
  Object.assign(p.a, {
    spine: -86 + Math.sin(q * 2), head: 4, wing: -62 + 6 * Math.sin(q * 2),
    legR_u: 90 - 26 * s, legR_l: 6 + 40 * sm(Math.cos(q + 0.4)), legL_u: 90 + 26 * s, legL_l: 6 + 40 * sm(-Math.cos(q + 0.4)),
    armR_u: 160 + 22 * s, armR_l: -30 - 10 * s, armL_u: 200 - 22 * s, armL_l: -30 + 10 * s,
  });
  return { pose: p, hand: 'relax' };
}

const MOVES: Template[] = [
  { id: 'idle', name: 'ยืนหายใจ', group: 'move', clip: () => sampleToClip('idle', 'ยืนหายใจ', 'idle', 2 * Math.PI / 1.9, 6, t => animate('idle', t)) },
  { id: 'walk', name: 'เดิน', group: 'move', clip: () => sampleToClip('walk', 'เดิน', 'walk', 1.0, 8, walk, { rootMotion: 70 }) },
  { id: 'run', name: 'วิ่ง', group: 'move', clip: () => sampleToClip('run', 'วิ่ง', 'run', 2 * Math.PI / 10, 8, t => animate('run', t), { rootMotion: 150 }) },
];
const EMOTES: Template[] = [
  { id: 'wave', name: 'โบกมือ', group: 'emote', clip: () => sampleToClip('wave', 'โบกมือ', 'emote', 2 * Math.PI / 9, 4, t => animate('wave', t)) },
  { id: 'hype', name: 'กระโดดดีใจ', group: 'emote', clip: () => sampleToClip('hype', 'กระโดดดีใจ', 'emote', 1 / 2.2, 6, t => animate('hype', t)) },
  { id: 'victory', name: 'ชูอาวุธฉลอง', group: 'emote', clip: () => trackToClip('victory', 'ชูอาวุธฉลอง', 'emote', TRACKS.victory) },
];
const kindOf = (id: string): ClipKind => (['slash', 'thrust', 'punch', 'shoot', 'fire', 'cast'].includes(id) ? 'attack' : 'skill');

export function templates(): Template[] {
  const atk = Object.keys(ATT).filter(id => TRACKS[id] && !(id in REACTS)).map<Template>(id => ({ id, name: ATT[id].th, group: 'attack', clip: () => trackToClip(id, ATT[id].th, kindOf(id), TRACKS[id]) }));
  const react = Object.keys(REACTS).filter(id => TRACKS[id]).map<Template>(id => ({ id, name: REACTS[id].th, group: 'react', clip: () => trackToClip(id, REACTS[id].th, 'react', TRACKS[id]) }));
  return [...MOVES, ...atk, ...react, ...EMOTES];
}
export const templateById = (id: string) => templates().find(t => t.id === id);

export function poseTemplates(): PoseTemplate[] {
  return Object.entries(POSES).map(([id, p]) => {
    const base = restPose(); base.x += p.def.dx ?? 0; base.y += p.def.dy ?? 0;
    for (const [b, v] of Object.entries(p.def.a ?? {})) if (b in base.a) (base.a as Record<string, number>)[b] = v;
    return { id, name: p.th, group: p.g, hand: p.hand, key: poseToKeyFields(base) };
  });
}
