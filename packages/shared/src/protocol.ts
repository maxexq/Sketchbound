// Messages between client and server (JSON over WebSocket for now).
import type { Equip } from './data';

export type ClientMsg =
  | { t: 'hello'; name: string; preset?: string }
  | { t: 'move'; x: number; z: number }      // click on the ground
  | { t: 'target'; id: number }              // click on a mob
  | { t: 'skill'; k: number };               // hotbar key 1-4

/** what a body is playing: the client runs the animation itself from this */
export interface AnimState { n: string; t0: number; r: number; loop: boolean }

export interface PlayerView {
  id: number; name: string; eq: Equip; x: number; z: number; dir: 1 | -1;
  hp: number; maxHp: number; sp: number; maxSp: number; lv: number; exp: number;
  dead: boolean; target: number | null; anim: AnimState;
}
export interface MobView { id: number; kind: string; x: number; z: number; dir: 1 | -1; hp: number; dead: boolean; moving: boolean; hurtT: number; lungeT: number; deadT: number }
export interface ShotView { id: number; kind: string; x: number; z: number; h: number; ang: number; t: number; el: string }

export type GameEvent =
  | { k: 'dmg'; x: number; z: number; h: number; n: number; crit: boolean; by: number; el: string }
  | { k: 'hurt'; id: number; n: number }
  | { k: 'exp'; id: number; n: number }
  | { k: 'lvl'; id: number }
  | { k: 'ko'; id: number }
  | { k: 'info'; id: number; txt: string };

export type ServerMsg =
  | { t: 'welcome'; you: number; map: string; time: number }
  | { t: 'snap'; time: number; players: PlayerView[]; mobs: MobView[]; shots: ShotView[]; events: GameEvent[] };

export const TICK_HZ = 20;
