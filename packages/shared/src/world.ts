// Map layout: road, pond, trees, rocks and mob spawn points, generated from the map JSON + its seed.
// Server and client both call this, so they agree on where every obstacle is without sending it.
import type { MapDef } from './data';

export interface Vec { x: number; z: number }
export interface Obstacle extends Vec { r: number }
export interface Layout {
  def: MapDef;
  start: Vec;
  obstacles: Obstacle[];
  trees: (Vec & { seed: number })[];
  rocks: (Vec & { k: number })[];
  sign: Vec;
  spawns: (Vec & { kind: string })[];
  portals: { x: number; z: number; to: Vec }[];
}

/** mulberry32: small seeded random, same sequence everywhere */
export function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roadZ(def: MapDef, x: number): number {
  const P = def.road;
  for (let i = 1; i < P.length; i++) if (x <= P[i][0]) {
    const a = P[i - 1], b = P[i];
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  }
  return P[P.length - 1][1];
}

export function inPond(def: MapDef, x: number, z: number, margin: number): boolean {
  const p = def.pond, dx = (x - p.x) / (p.rx + margin), dz = (z - p.z) / (p.rz + margin);
  return dx * dx + dz * dz < 1;
}

export function buildLayout(def: MapDef): Layout {
  const R = rng(def.seed), obstacles: Obstacle[] = [];
  const start = { x: def.start.x, z: roadZ(def, def.start.x) };
  const ok = (x: number, z: number, r: number) =>
    x > 50 && x < def.width - 50 && z > 70 && z < def.depth - 40 && !inPond(def, x, z, r + 14) &&
    Math.abs(z - roadZ(def, x)) > 44 + r && Math.hypot(x - start.x, z - start.z) > 100 &&
    obstacles.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r + 30);
  const spot = (r: number): Vec => {
    for (let i = 0; i < 200; i++) { const x = R() * def.width, z = R() * def.depth; if (ok(x, z, r)) return { x, z }; }
    return { x: 300, z: 300 };
  };
  const sign = { x: start.x - 70, z: start.z - 60 };
  obstacles.push({ ...sign, r: 8 });
  const trees: Layout['trees'] = [];
  for (let i = 0; i < def.trees; i++) { const p = spot(16); obstacles.push({ ...p, r: 14 }); trees.push({ ...p, seed: Math.floor(R() * 1e9) }); }
  const rocks: Layout['rocks'] = [];
  for (let i = 0; i < def.rocks; i++) { const p = spot(12), k = 0.7 + R() * 0.7; obstacles.push({ ...p, r: 11 * k }); rocks.push({ ...p, k }); }
  const spawns: Layout['spawns'] = [];
  for (let i = 0; i < def.mobs.count; i++) {
    let p: Vec; do { p = spot(14); } while (Math.hypot(p.x - start.x, p.z - start.z) < def.mobs.minDistFromStart);
    spawns.push({ ...p, kind: def.mobs.cycle[i % def.mobs.cycle.length] });
  }
  const portals = def.portals.map(q => ({ x: q.x, z: roadZ(def, q.x), to: { x: q.toX, z: roadZ(def, q.toX) } }));
  return { def, start, obstacles, trees, rocks, sign, spawns, portals };
}

export function isFree(L: Layout, x: number, z: number): boolean {
  const d = L.def;
  return x > 20 && x < d.width - 20 && z > 34 && z < d.depth - 20 && !inPond(d, x, z, 6) &&
    L.obstacles.every(o => Math.hypot(o.x - x, o.z - z) > o.r + 7);
}

/** step toward (tx,tz), sliding around trees and rocks. Returns true when arrived or stuck. */
export function moveToward(L: Layout, o: Vec, tx: number, tz: number, speed: number, dt: number): boolean {
  const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz); if (d < 3) return true;
  const st = Math.min(d, speed * dt), nx = o.x + dx / d * st, nz = o.z + dz / d * st;
  if (isFree(L, nx, nz)) { o.x = nx; o.z = nz; }
  else if (isFree(L, nx + (dz > 0 ? -1 : 1) * st * 0.9, o.z)) o.x = nx + (dz > 0 ? -1 : 1) * st * 0.9;
  else if (isFree(L, o.x, nz + (dx > 0 ? 1 : -1) * st * 0.9)) o.z = nz + (dx > 0 ? 1 : -1) * st * 0.9;
  else if (isFree(L, nx, o.z)) o.x = nx; else if (isFree(L, o.x, nz)) o.z = nz; else return true;
  return false;
}
