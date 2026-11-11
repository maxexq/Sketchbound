// Typed access to the JSON game data. Add a zone, mob or preset by editing JSON, not code.
import skillsJson from './data/skills.json';
import mobsJson from './data/mobs.json';
import presetsJson from './data/presets.json';
import pencilField from './data/maps/pencil-field.json';

export type Equip = Record<string, string>;

export interface MobDef { th: string; hp: number; exp: number; atk: [number, number]; speed: number; height: number }
export interface MapDef {
  id: string; th: string; width: number; depth: number; seed: number;
  start: { x: number };
  road: [number, number][];
  pond: { x: number; z: number; rx: number; rz: number };
  trees: number; rocks: number;
  mobs: { count: number; cycle: string[]; minDistFromStart: number; respawnSeconds: number };
  portals: { x: number; toX: number }[];
}
export interface SkillsDef {
  attacks: Record<string, string>;
  byWeaponType: Record<string, string[]>;
  spCost: Record<string, number>;
  rangedReach: Record<string, number>;
  aoe: string[];
  playbackRate: { slash: number; normal: number; skill: number };
}

export const SKILLS = skillsJson as SkillsDef;
export const MOBS = mobsJson as unknown as Record<string, MobDef>;
export const MAPS: Record<string, MapDef> = { 'pencil-field': pencilField as MapDef };
export const EQUIP_BASE: Equip = presetsJson.base;
export const PRESETS: Record<string, { th: string; eq: Equip }> = presetsJson.presets;

export const presetEquip = (name: string): Equip => ({ ...EQUIP_BASE, ...(PRESETS[name]?.eq ?? {}) });
