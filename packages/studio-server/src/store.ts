// The clip pack on disk. Pose Studio (through the sync server) and the MCP server both edit it,
// and the game imports it, so "save to game" is just writing this file.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateClip, sortKeys, type Clip, type ClipPack, type Bindings } from '@sketchbound/shared';

export function findPackPath(): string {
  if (process.env.SKETCHBOUND_CLIPS) return path.resolve(process.env.SKETCHBOUND_CLIPS);
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    const p = path.join(d, 'packages/shared/src/data/clips.json');
    if (fs.existsSync(p)) return p;
    if (path.dirname(d) === d) break;
  }
  return path.join(os.homedir(), '.sketchbound', 'clips.json');
}

export class Store {
  constructor(readonly file = findPackPath()) {}
  read(): ClipPack {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as ClipPack;
      return { v: 1, clips: p.clips ?? {}, bindings: p.bindings ?? {} };
    } catch { return { v: 1, clips: {}, bindings: {} }; }
  }
  write(p: ClipPack) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const clips = Object.fromEntries(Object.keys(p.clips).sort().map(k => [k, p.clips[k]]));
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, clips, bindings: p.bindings }, null, 1) + '\n');
    fs.renameSync(tmp, this.file); // atomic: the game never sees half a file
  }
  rev(): string { try { const s = fs.statSync(this.file); return s.mtimeMs.toFixed(0) + '-' + s.size; } catch { return '0'; } }

  list() { return Object.values(this.read().clips); }
  get(id: string) { return this.read().clips[id]; }
  put(c: Clip): Clip {
    c = sortKeys(structuredClone(c));
    const err = validateClip(c); if (err.length) throw new Error('invalid clip: ' + err.join('; '));
    c.updated = new Date().toISOString();
    const p = this.read(); p.clips[c.id] = c; this.write(p); return c;
  }
  remove(id: string): boolean {
    const p = this.read(); if (!p.clips[id]) return false;
    delete p.clips[id];
    for (const b of Object.values(p.bindings)) for (const k of Object.keys(b) as (keyof Bindings)[]) {
      if (b[k] === id) delete b[k];
      if (k === 'skills' && b.skills) b.skills = b.skills.filter(s => s !== id);
    }
    this.write(p); return true;
  }
  bind(weapon: string, b: Bindings) { const p = this.read(); p.bindings[weapon] = { ...p.bindings[weapon], ...b }; this.write(p); return p.bindings[weapon]; }
  replaceBindings(all: Record<string, Bindings>) { const p = this.read(); p.bindings = all; this.write(p); }
}
