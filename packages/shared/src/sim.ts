// Authoritative zone simulation. The server runs this; the client only draws what it sends.
// Ported from the prototype's map mode (actorStep, mobStep, mapHit, mapDamage, shotStep, gainExp),
// with NPC bots left out for now and every player treated the same.
import { MOBS, SKILLS, MAPS, presetEquip, PRESETS, type Equip } from './data';
import { buildLayout, moveToward, isFree, type Layout, type Vec } from './world';
import * as rig from './rig';
import type { AnimState, ClientMsg, GameEvent, MobView, PlayerView, ShotView } from './protocol';

// the legacy rig module is untyped; give the parts the sim uses a shape
const TRACKS = rig.TRACKS as Record<string, { t1: number; hit: Hit | null; shoot: { kind: string; hit: Hit } | null }[]>;
const REACH = rig.REACH as Record<string, number>, SHOT = rig.SHOT as Record<string, { v: number }>;
const wtype = rig.wtype as (eq: Equip) => string, animLen = rig.animLen as (n: string) => number;

const WORLD_SCALE = 0.42;   // figure size on the map (prototype MP.S)
const RUN_SPEED = 165;

interface Hit { t: string; push: number; dmg: number }
interface KeyEvent { at: number; hit?: Hit; shoot?: { kind: string; hit: Hit } }
interface Swing { name: string; events: KeyEvent[]; end: number }

export interface Player extends Vec {
  id: number; name: string; eq: Equip; dir: 1 | -1;
  hp: number; maxHp: number; sp: number; maxSp: number; lv: number; exp: number; atk: number;
  dest: Vec | null; target: number | null; queued: { anim: string; sp: number } | null;
  swing: Swing | null; nextAtk: number; dead: boolean; reviveAt: number; hurtT: number; anim: AnimState;
}
export interface Mob extends Vec {
  id: number; kind: string; hx: number; hz: number; hp: number; dir: 1 | -1;
  dest: Vec | null; until: number; aggro: number | null; nextAtk: number;
  hurtT: number; lungeT: number; dead: boolean; deadT: number; moving: boolean;
}
interface Shot extends Vec { id: number; kind: string; h: number; target: number | null; dir: 1 | -1; ang: number; owner: number; hit: Hit; t: number; el: string }

/** hit and shoot moments of an attack, in seconds after it starts at playback rate `rate` */
export function attackEvents(name: string, rate: number): KeyEvent[] {
  return TRACKS[name].filter(k => k.hit || k.shoot).map(k => ({ at: k.t1 / rate, hit: k.hit ?? undefined, shoot: k.shoot ?? undefined }));
}

export const hotbar = (eq: Equip): string[] => SKILLS.byWeaponType[wtype(eq)].slice(0, 4);

export class Zone {
  readonly layout: Layout;
  time = 0;
  players = new Map<number, Player>();
  mobs: Mob[] = [];
  shots: Shot[] = [];
  events: GameEvent[] = [];
  private nextId = 1;

  constructor(mapId = 'pencil-field', private rnd: () => number = Math.random) {
    this.layout = buildLayout(MAPS[mapId]);
    for (const s of this.layout.spawns) this.mobs.push({
      id: this.nextId++, kind: s.kind, x: s.x, z: s.z, hx: s.x, hz: s.z, hp: MOBS[s.kind].hp,
      dir: this.rnd() < 0.5 ? 1 : -1, dest: null, until: 0, aggro: null, nextAtk: 0,
      hurtT: -9, lungeT: -9, dead: false, deadT: 0, moving: false,
    });
  }

  join(name: string, preset?: string): Player {
    const names = Object.keys(PRESETS), pick = preset && PRESETS[preset] ? preset : names[Math.floor(this.rnd() * names.length)];
    const s = this.layout.start, id = this.nextId++;
    const p: Player = {
      id, name: name.slice(0, 16) || 'ผู้เล่น', eq: presetEquip(pick), x: s.x + (this.rnd() - 0.5) * 40, z: s.z + (this.rnd() - 0.5) * 30, dir: 1,
      hp: 100, maxHp: 100, sp: 40, maxSp: 40, lv: 1, exp: 0, atk: 9,
      dest: null, target: null, queued: null, swing: null, nextAtk: 0, dead: false, reviveAt: 0, hurtT: -9,
      anim: { n: 'idle', t0: this.time, r: 1, loop: true },
    };
    this.players.set(id, p);
    return p;
  }

  leave(id: number) {
    this.players.delete(id);
    for (const m of this.mobs) if (m.aggro === id) m.aggro = null;
  }

  input(id: number, msg: ClientMsg) {
    const a = this.players.get(id); if (!a || a.dead) return;
    if (msg.t === 'move') {
      const d = this.layout.def;
      a.target = null; a.queued = null;
      a.dest = { x: clamp(msg.x, 24, d.width - 24), z: clamp(msg.z, 38, d.depth - 24) };
    } else if (msg.t === 'target') {
      const m = this.mobs.find(q => q.id === msg.id && !q.dead);
      if (m) { a.target = m.id; a.dest = null; a.queued = null; }
    } else if (msg.t === 'skill') {
      const name = hotbar(a.eq)[msg.k - 1]; if (!name) return;
      const sk = { anim: name, sp: msg.k > 1 ? SKILLS.spCost[name] ?? 0 : 0 };
      if (a.sp < sk.sp) { this.events.push({ k: 'info', id: a.id, txt: 'SP ไม่พอ' }); return; }
      if (a.target == null || this.mob(a.target)?.dead) {
        let best: Mob | null = null, bd = 170;
        for (const m of this.mobs) { if (m.dead) continue; const d = Math.hypot(m.x - a.x, m.z - a.z); if (d < bd) { bd = d; best = m; } }
        a.target = best?.id ?? null;
      }
      a.queued = sk; a.dest = null;
      if (a.target == null && !a.swing) { a.sp -= sk.sp; a.queued = null; this.startSwing(a, sk.anim); }
    }
  }

  /** advance the world by dt seconds; returns the events that happened */
  step(dt: number): GameEvent[] {
    this.time += dt;
    for (const a of this.players.values()) this.playerStep(a, dt);
    for (const m of this.mobs) this.mobStep(m, dt);
    for (const q of this.shots) this.shotStep(q, dt);
    this.shots = this.shots.filter(q => q.t > -1 && this.time - q.t < 1.1);
    for (const a of this.players.values()) if (!a.dead) for (const q of this.layout.portals)
      if (Math.hypot(a.x - q.x, a.z - q.z) < 22) { a.x = q.to.x; a.z = q.to.z; a.dest = null; a.target = null; break; }
    const ev = this.events; this.events = [];
    return ev;
  }

  mob(id: number) { return this.mobs.find(m => m.id === id); }

  // ---- players ----
  reachOf(a: Player) { return SKILLS.rangedReach[wtype(a.eq)] || 24 + REACH[a.eq.weapon] * WORLD_SCALE * 0.9; }

  private play(a: Player, n: string, loop: boolean, r = 1) { a.anim = { n, t0: this.time, r, loop }; }

  private startSwing(a: Player, name: string) {
    const t = a.target != null ? this.mob(a.target) : undefined;
    if (t) a.dir = t.x >= a.x ? 1 : -1;
    const pr = SKILLS.playbackRate, rate = name === 'slash' ? pr.slash : name === hotbar(a.eq)[0] ? pr.normal : pr.skill;
    const t0 = this.time;
    a.swing = { name, end: t0 + animLen(name) / rate, events: attackEvents(name, rate).map(e => ({ ...e, at: t0 + e.at })) };
    this.play(a, name, false, rate);
  }

  private playerStep(a: Player, dt: number) {
    if (a.dead) {
      if (this.time > a.reviveAt) {
        a.dead = false; a.hp = a.maxHp; a.sp = a.maxSp; a.x = this.layout.start.x; a.z = this.layout.start.z; this.play(a, 'idle', true);
      }
      return;
    }
    a.sp = Math.min(a.maxSp, a.sp + 2.2 * dt);
    if (this.time - a.hurtT > 4) a.hp = Math.min(a.maxHp, a.hp + 2.5 * dt);
    if (a.swing) {
      const s = a.swing;
      while (s.events.length && s.events[0].at <= this.time) {
        const e = s.events.shift()!;
        if (e.hit) this.meleeHit(a, s.name, e.hit);
        if (e.shoot) this.shoot(a, e.shoot);
      }
      if (this.time >= s.end) { a.swing = null; a.nextAtk = this.time + 0.1; this.play(a, 'idle', true); }
      return;
    }
    let goal: Vec | null = null;
    const m = a.target != null ? this.mob(a.target) : undefined;
    if (a.target != null && (!m || m.dead)) a.target = null;
    if (m && !m.dead) {
      const r = this.reachOf(a), side = a.x <= m.x ? -1 : 1, dx = Math.abs(m.x - a.x), dz = Math.abs(m.z - a.z);
      const far = SKILLS.rangedReach[wtype(a.eq)], d = Math.hypot(dx, dz);
      if (far ? (d <= r && dx > 14) : (dx <= r && dx > 12 && dz < 16)) {
        a.dir = m.x >= a.x ? 1 : -1;
        if (a.anim.n === 'run') this.play(a, 'idle', true);
        if (this.time > a.nextAtk) {
          const q = a.queued;
          if (q && a.sp >= q.sp) { a.sp -= q.sp; a.queued = null; this.startSwing(a, q.anim); }
          else { a.queued = null; this.startSwing(a, hotbar(a.eq)[0]); }
        }
        return;
      }
      goal = !far ? { x: m.x + side * r * 0.72, z: m.z + 2 }
        : dx <= 14 ? { x: m.x + side * 46, z: a.z }
        : { x: m.x + (a.x - m.x) / d * r * 0.82, z: m.z + (a.z - m.z) / d * r * 0.82 };
    } else if (a.dest) goal = a.dest;
    if (goal) {
      const ox = a.x, done = moveToward(this.layout, a, goal.x, goal.z, RUN_SPEED, dt);
      if (Math.abs(a.x - ox) > 0.2) a.dir = a.x > ox ? 1 : -1;
      if (a.anim.n !== 'run') this.play(a, 'run', true);
      if (done) {
        if (a.target == null) a.dest = null; else if (Math.hypot(goal.x - a.x, goal.z - a.z) > 8) a.target = null;
        this.play(a, 'idle', true);
      }
    } else if (a.anim.n === 'run') this.play(a, 'idle', true);
  }

  private meleeHit(a: Player, swing: string, hit: Hit) {
    const range = this.reachOf(a) + 18, aoe = SKILLS.aoe.includes(swing);
    let cands = this.mobs.filter(m => {
      if (m.dead) return false; const dx = m.x - a.x, dz = m.z - a.z;
      return aoe ? Math.hypot(dx, dz) < range + 34 : (a.dir * dx > -10 && a.dir * dx < range && Math.abs(dz) < 26);
    });
    if (swing === hotbar(a.eq)[0] && cands.length > 1) cands = [cands.find(m => m.id === a.target) ?? cands[0]];
    for (const m of cands) this.damage(a, m, hit, a.dir);
  }

  private shoot(a: Player, sh: { kind: string; hit: Hit }) {
    const m = a.target != null ? this.mob(a.target) : undefined;
    this.shots.push({ id: this.nextId++, x: a.x + a.dir * 12, z: a.z, h: sh.kind === 'nova' ? 8 : 20, target: m && !m.dead ? m.id : null,
      dir: a.dir, ang: 0, kind: sh.kind, owner: a.id, hit: sh.hit, t: this.time, el: a.eq.element });
  }

  private shotStep(q: Shot, dt: number) {
    const v = SHOT[q.kind].v * 0.72, m = q.target != null ? this.mob(q.target) : undefined;
    let tx = q.x + q.dir * 100, tz = q.z, hit: Mob | undefined;
    if (m && !m.dead) { tx = m.x; tz = m.z; }
    const dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, v * dt);
    q.x += dx / d * st; q.z += dz / d * st; q.ang = Math.atan2(dz * 0.6, dx) * 180 / Math.PI;
    if (m && !m.dead) { if (d < 12) hit = m; }
    else hit = this.mobs.find(o => !o.dead && Math.abs(o.x - q.x) < 14 && Math.abs(o.z - q.z) < 18);
    if (!hit) return;
    const owner = this.players.get(q.owner);
    if (owner) {
      if (q.kind === 'nova') { for (const o of this.mobs) if (Math.hypot(o.x - hit.x, o.z - hit.z) < 64) this.damage(owner, o, q.hit, q.dir); }
      else this.damage(owner, hit, q.hit, q.dir);
    }
    q.t = -9; // spent
  }

  damage(a: Player, m: Mob, hit: Hit, dir: number) {
    if (m.dead) return;
    const crit = this.rnd() < 0.14, n = Math.round((a.atk + a.lv * 2) * hit.dmg / 10 * (0.85 + this.rnd() * 0.3) * (crit ? 1.8 : 1));
    m.hp -= n; m.hurtT = this.time; m.aggro = a.id;
    this.events.push({ k: 'dmg', x: m.x, z: m.z, h: MOBS[m.kind].height, n, crit, by: a.id, el: a.eq.element });
    const kx = m.x + dir * hit.push * 0.3; if (isFree(this.layout, kx, m.z)) m.x = kx;
    if (m.hp <= 0) {
      m.dead = true; m.deadT = this.time; m.aggro = null;
      for (const p of this.players.values()) if (p.target === m.id) p.target = null;
      this.gainExp(a, MOBS[m.kind].exp);
    }
  }

  private gainExp(a: Player, e: number) {
    a.exp += e; this.events.push({ k: 'exp', id: a.id, n: e });
    while (a.exp >= a.lv * 40) {
      a.exp -= a.lv * 40; a.lv++; a.maxHp += 12; a.maxSp += 4; a.atk += 2; a.hp = a.maxHp; a.sp = a.maxSp;
      this.events.push({ k: 'lvl', id: a.id });
    }
  }

  private hurt(a: Player, n: number) {
    if (a.dead) return;
    a.hp -= n; a.hurtT = this.time; this.events.push({ k: 'hurt', id: a.id, n });
    if (a.hp <= 0) {
      a.hp = 0; a.dead = true; a.reviveAt = this.time + 3.6; a.target = null; a.dest = null; a.queued = null; a.swing = null;
      this.play(a, 'ko', false);
      for (const m of this.mobs) if (m.aggro === a.id) m.aggro = null;
      this.events.push({ k: 'ko', id: a.id });
      return;
    }
    if (!a.swing && !a.dest && a.target == null && (a.anim.n === 'idle' || a.anim.n === 'run')) this.play(a, 'hitHigh', false, 1.5);
  }

  // ---- mobs ----
  private mobStep(m: Mob, dt: number) {
    const K = MOBS[m.kind];
    if (m.dead) {
      if (this.time - m.deadT > this.layout.def.mobs.respawnSeconds) { m.dead = false; m.hp = K.hp; m.x = m.hx; m.z = m.hz; m.aggro = null; }
      return;
    }
    m.moving = false;
    const a = m.aggro != null ? this.players.get(m.aggro) : undefined;
    if (m.aggro != null && (!a || a.dead || Math.hypot(a.x - m.x, a.z - m.z) > 340)) m.aggro = null;
    if (a && m.aggro != null) {
      const d = Math.hypot(a.x - m.x, a.z - m.z); m.dir = a.x >= m.x ? 1 : -1;
      if (d > 30) { moveToward(this.layout, m, a.x - m.dir * 24, a.z, K.speed, dt); m.moving = true; }
      else if (this.time > m.nextAtk) {
        m.nextAtk = this.time + 1.25; m.lungeT = this.time;
        this.hurt(a, K.atk[0] + Math.floor(this.rnd() * (K.atk[1] - K.atk[0] + 1)));
      }
    } else {
      if (!m.dest || this.time > m.until) {
        m.dest = this.rnd() < 0.6 ? { x: m.hx + (this.rnd() - 0.5) * 150, z: m.hz + (this.rnd() - 0.5) * 110 } : null;
        m.until = this.time + 2 + this.rnd() * 4;
      }
      if (m.dest) {
        const ox = m.x;
        if (moveToward(this.layout, m, m.dest.x, m.dest.z, K.speed * 0.45, dt)) m.dest = null;
        else { m.moving = true; if (Math.abs(m.x - ox) > 0.05) m.dir = m.x > ox ? 1 : -1; }
      }
    }
  }

  // ---- what goes over the wire ----
  views(): { players: PlayerView[]; mobs: MobView[]; shots: ShotView[] } {
    const r1 = (v: number) => Math.round(v * 10) / 10, r3 = (v: number) => Math.round(v * 1000) / 1000;
    return {
      players: [...this.players.values()].map(a => ({
        id: a.id, name: a.name, eq: a.eq, x: r1(a.x), z: r1(a.z), dir: a.dir, hp: Math.ceil(a.hp), maxHp: a.maxHp,
        sp: Math.floor(a.sp), maxSp: a.maxSp, lv: a.lv, exp: a.exp, dead: a.dead, target: a.target,
        anim: { ...a.anim, t0: r3(a.anim.t0) },
      })),
      mobs: this.mobs.map(m => ({ id: m.id, kind: m.kind, x: r1(m.x), z: r1(m.z), dir: m.dir, hp: m.hp, dead: m.dead, moving: m.moving,
        hurtT: r3(m.hurtT), lungeT: r3(m.lungeT), deadT: r3(m.deadT) })),
      shots: this.shots.map(q => ({ id: q.id, kind: q.kind, x: r1(q.x), z: r1(q.z), h: q.h, ang: Math.round(q.ang), t: r3(q.t), el: q.el })),
    };
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
