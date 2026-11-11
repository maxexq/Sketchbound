// MCP server (stdio) so an AI agent can make and edit Sketchbound poses and animation clips.
// Writes the same clips.json the game imports and Pose Studio shows; a running sync server pushes
// every change to open studios live. Hand-rolled JSON-RPC: Node built-ins only, ~50 MB RSS.
//
//   claude mcp add sketchbound -- node packages/studio-server/dist/mcp.js
//   (or during development)  claude mcp add sketchbound -- npx tsx packages/studio-server/src/mcp.ts
import readline from 'node:readline';
import { Store } from './store';
import {
  BONES, BONE_IDS, EASES, EASE_TH, HANDS, CLIP_KINDS, KIND_TH, HOME, UPPER, CLIP_ID,
  evalClip, keyPose, poseToKeyFields, mirrorKey, sortKeys, templates, templateById, poseTemplates, validateClip, composePose,
  type Clip, type ClipKey, type BoneId, type Bindings, presetEquip, PRESETS, EQUIP_BASE, rig,
} from '@sketchbound/shared';
import { figureSvg, DEFS } from '@sketchbound/client/art';

const store = new Store();
type Json = Record<string, unknown>;
interface Tool { name: string; description: string; inputSchema: Json; run: (a: Json) => unknown }

const NUM = { type: 'number' }, STR = { type: 'string' }, BOOL = { type: 'boolean' };
const ANGLES = { type: 'object', description: 'bone → degrees. Local to the parent bone, like a puppet. See list_bones for rest angles.', additionalProperties: NUM, propertyNames: { enum: BONE_IDS } };
const HIT = { type: 'object', properties: { t: { enum: ['high', 'low', 'launch'] }, dmg: NUM, push: NUM, kick: BOOL }, required: ['t', 'dmg', 'push'] };
const KEY_PROPS = {
  t: { ...NUM, description: 'seconds from clip start' },
  e: { enum: EASES, description: 'easing into this key: ' + EASES.map(e => `${e}=${EASE_TH[e]}`).join(', ') },
  dx: { ...NUM, description: 'hips offset in px, +x = forward (facing direction)' },
  dy: { ...NUM, description: 'hips offset in px, +y = down. ~45 = sitting on the floor, -30 = mid jump' },
  a: ANGLES,
  offsets: { ...ANGLES, description: 'like a, but degrees added to the rest angle (0 = rest). Easier than absolute angles.' },
  h: { enum: HANDS, description: 'free-hand shape from this key on' },
  hit: { ...HIT, description: 'melee impact when this key is reached' },
  shoot: { type: 'object', properties: { kind: { enum: ['arrow', 'bullet', 'orb', 'nova'] }, hit: HIT }, required: ['kind', 'hit'] },
  thud: BOOL,
};
const CLIP_FIELDS = {
  name: { ...STR, description: 'display name (Thai is fine)' }, kind: { enum: CLIP_KINDS }, loop: BOOL,
  len: { ...NUM, description: 'clip length in seconds' }, rate: { ...NUM, description: 'playback speed in game' },
  rootMotion: { ...NUM, description: 'px the character travels per play (attack) or per cycle (walk/run)' },
  mask: { enum: ['full', 'upper'], description: 'upper = only head/arms/hands, laid over stand/walk/run legs (weapon holds)' },
  weapon: { ...STR, description: 'weapon id: none,katana,great,axe,scythe,spear,staff,bow,gun or any' },
  drag: { ...NUM, description: 'follow-through 0..0.5: limbs further down the chain arrive later' },
  aim: BOOL, comboEnd: BOOL,
};

const need = (id: unknown): Clip => { const c = store.get(String(id)); if (!c) throw new Error(`no clip "${id}". Use list_clips.`); return c; };
const findKey = (c: Clip, t: number) => c.keys.findIndex(k => Math.abs(k.t - t) < 0.0015);
const restOf = Object.fromEntries(BONES.map(b => [b.id, b.rest])) as Record<BoneId, number>;
function keyFrom(a: Json, base?: ClipKey): ClipKey {
  const k: ClipKey = base ? structuredClone(base) : { t: 0, e: 'io', ...poseToKeyFields(keyPose({ dx: 0, dy: 0, a: {} })) };
  if (a.t !== undefined) k.t = Number(a.t);
  if (a.e !== undefined) k.e = a.e as ClipKey['e'];
  if (a.dx !== undefined) k.dx = Number(a.dx);
  if (a.dy !== undefined) k.dy = Number(a.dy);
  if (a.a) Object.assign(k.a, a.a);
  if (a.offsets) for (const [b, v] of Object.entries(a.offsets as Json)) k.a[b as BoneId] = restOf[b as BoneId] + Number(v);
  for (const f of ['h', 'hit', 'shoot', 'thud'] as const) if (a[f] !== undefined) (a[f] === null ? delete k[f] : ((k as unknown as Json)[f] = a[f]));
  return k;
}
const summary = (c: Clip) => ({ id: c.id, name: c.name, kind: c.kind, loop: c.loop, len: c.len, keys: c.keys.length, weapon: c.weapon ?? 'any', mask: c.mask ?? 'full', hits: c.keys.filter(k => k.hit || k.shoot).map(k => k.t), updated: c.updated });

function renderSvg(c: Clip | null, t: number, weapon?: string, preset?: string, over?: Clip): string {
  const eq = { ...(preset ? presetEquip(preset) : EQUIP_BASE), ...(weapon ? { weapon } : {}) };
  let s = c ? evalClip(c, t) : { pose: keyPose({ dx: 0, dy: 0, a: {} }), hand: 'relax' as const };
  if (over) { const o = evalClip(over, t); s = { ...s, pose: composePose(s.pose, o.pose, over.mask ?? 'upper') }; }
  const fig = figureSvg({ eq, pose: s.pose, px: HOME.x, dir: 1, hand: s.hand, noHit: true });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="120 110 360 270" width="360" height="270"><rect x="120" y="110" width="360" height="270" fill="#ededee"/>${DEFS}<path d="M140,342 L460,342" stroke="#1b1b1d" stroke-width="1.4" stroke-dasharray="14 5 3 6" opacity=".3"/>${fig}</svg>`;
}

const TOOLS: Tool[] = [
  { name: 'guide', description: 'Read first: how the Sketchbound rig, clips and coordinates work, with tips for good animation.', inputSchema: { type: 'object', properties: {} },
    run: () => `Sketchbound rig: a 2D pencil stickman, ${BONES.length} bones, facing +x (right). Screen y points down.
Angles are degrees LOCAL to the parent bone (FK puppet). A pose = hips offset (dx,dy) + an angle per bone. Missing bones use rest.
Bones (id, parent, rest°): ${BONES.map(b => `${b.id}(${b.parent ?? '-'},${b.rest})`).join(' ')}
Useful world directions: 0°=forward, 90°=down, -90°=up, 180°=backward. spine rest -90 = upright; spine -55 = leaning forward.
Arms: armR_u is the FRONT arm (weapon hand handR), armL is the back arm. armR_u ~80 = arm reaching forward at chest height (relative to an upright spine), ~10 = raised up, ~160 = hanging down.
Legs hang from root: legR_u 70 / legL_u 110 at rest (front/back leg). legX_l bends the knee (positive = shin swings back).
Clip = keys on one timeline; each key is a whole-body pose with an easing used to ARRIVE at it. kinds: ${CLIP_KINDS.map(k => k + '=' + KIND_TH[k]).join(', ')}.
Attacks: windup (0.2-0.3s, e=io) → strike (0.06-0.1s, e=out, put hit on this key) → settle/hold (0.15-0.25s) → recover to rest (0.3-0.4s, e=io). Loops (idle/walk/run) set loop=true; the last key blends back into the first.
Weapon hold one-shot: kind=hold, mask=upper, one key; the game lays it over stand/walk/run legs. Bind it with set_binding slot=hold.
Use offsets (degrees from rest) when unsure; check results with sample_pose or render_svg. Changes are saved to the game's clips.json immediately; open Pose Studio to watch them live.` },
  { name: 'list_bones', description: 'Bones with Thai names, parents, lengths and rest angles.', inputSchema: { type: 'object', properties: {} },
    run: () => BONES.map(b => ({ id: b.id, th: b.th, parent: b.parent, len: b.len, rest: b.rest, upper: UPPER.includes(b.id) })) },
  { name: 'list_clips', description: 'Clips saved in the game (clips.json), optionally filtered.', inputSchema: { type: 'object', properties: { kind: { enum: CLIP_KINDS }, weapon: STR } },
    run: a => store.list().filter(c => (!a.kind || c.kind === a.kind) && (!a.weapon || (c.weapon ?? 'any') === a.weapon || c.weapon === 'any')).map(summary) },
  { name: 'get_clip', description: 'Full clip JSON with every key.', inputSchema: { type: 'object', properties: { id: STR }, required: ['id'] }, run: a => need(a.id) },
  { name: 'list_templates', description: 'Built-in clips (idle/walk/run, every game attack, hit reactions, emotes) and still poses to start from.', inputSchema: { type: 'object', properties: {} },
    run: () => ({ clips: templates().map(t => ({ id: t.id, name: t.name, group: t.group })), poses: poseTemplates().map(p => ({ id: p.id, name: p.name, group: p.group })) }) },
  { name: 'create_clip', description: 'Create a clip, empty (one rest key) or copied from a template or another clip. Saving with the id of a built-in move (e.g. "slash") replaces that move in the game.',
    inputSchema: { type: 'object', properties: { id: { ...STR, description: 'letters, digits, _ or -; ' + CLIP_ID }, from: { ...STR, description: 'template id or existing clip id to copy' }, ...CLIP_FIELDS, keys: { type: 'array', items: { type: 'object', properties: KEY_PROPS } } }, required: ['id'] },
    run: a => {
      const id = String(a.id); if (store.get(id) && !a.overwrite) throw new Error(`clip "${id}" exists; use update_clip, or delete_clip first`);
      let c: Clip;
      if (a.from) { const src = store.get(String(a.from)) ?? templateById(String(a.from))?.clip(); if (!src) throw new Error('no template or clip ' + a.from); c = { ...structuredClone(src), id }; }
      else c = { v: 1, id, name: String(a.name ?? id), kind: (a.kind as Clip['kind']) ?? 'attack', loop: false, len: 1, keys: [keyFrom({ t: 0, e: 'lin' })], mask: 'full', weapon: 'any' };
      for (const f of Object.keys(CLIP_FIELDS)) if (a[f] !== undefined) (c as unknown as Json)[f] = a[f];
      if (Array.isArray(a.keys)) c.keys = (a.keys as Json[]).map(k => keyFrom(k));
      c.len = Math.max(c.len, ...c.keys.map(k => k.t));
      return summary(store.put(c));
    } },
  { name: 'update_clip', description: 'Change clip settings (name, kind, len, loop, rate, rootMotion, mask, weapon, drag, aim, comboEnd). Shrinking len drops keys after it.',
    inputSchema: { type: 'object', properties: { id: STR, ...CLIP_FIELDS }, required: ['id'] },
    run: a => { const c = need(a.id); for (const f of Object.keys(CLIP_FIELDS)) if (a[f] !== undefined) (c as unknown as Json)[f] = a[f]; c.keys = c.keys.filter(k => k.t <= c.len + 1e-6); return summary(store.put(c)); } },
  { name: 'delete_clip', description: 'Delete a clip from the game (and any binding that uses it).', inputSchema: { type: 'object', properties: { id: STR }, required: ['id'] },
    run: a => ({ deleted: store.remove(String(a.id)) }) },
  { name: 'set_key', description: 'Add or change the key at time t. Fields you leave out keep their value (a new key starts from the pose the clip has at t). Use a for absolute angles or offsets for degrees from rest. Pass hit:null to remove a hit.',
    inputSchema: { type: 'object', properties: { id: STR, ...KEY_PROPS, from_pose: { ...STR, description: 'start from a still pose template (see list_templates.poses)' } }, required: ['id', 't'] },
    run: a => {
      const c = need(a.id), t = Number(a.t), i = findKey(c, t);
      let base: ClipKey | undefined = i >= 0 ? c.keys[i] : { t, e: 'io', ...poseToKeyFields(evalClip(c, t).pose) };
      if (a.from_pose) { const p = poseTemplates().find(p => p.id === a.from_pose); if (!p) throw new Error('no pose ' + a.from_pose); base = { ...base!, ...structuredClone(p.key), h: p.hand as ClipKey['h'] }; }
      const k = keyFrom(a, base); k.t = t;
      if (i >= 0) c.keys[i] = k; else c.keys.push(k);
      c.len = Math.max(c.len, t); sortKeys(c); store.put(c);
      return { key: k, keys: c.keys.map(k => k.t) };
    } },
  { name: 'delete_key', description: 'Remove the key at time t.', inputSchema: { type: 'object', properties: { id: STR, t: NUM }, required: ['id', 't'] },
    run: a => { const c = need(a.id), i = findKey(c, Number(a.t)); if (i < 0) throw new Error('no key at ' + a.t); if (c.keys.length === 1) throw new Error('a clip needs one key'); c.keys.splice(i, 1); store.put(c); return { keys: c.keys.map(k => k.t) }; } },
  { name: 'move_key', description: 'Move the key at time from to time to.', inputSchema: { type: 'object', properties: { id: STR, from: NUM, to: NUM }, required: ['id', 'from', 'to'] },
    run: a => { const c = need(a.id), i = findKey(c, Number(a.from)); if (i < 0) throw new Error('no key at ' + a.from); c.keys[i].t = Math.max(0, Number(a.to)); c.len = Math.max(c.len, c.keys[i].t); store.put(c); return { keys: c.keys.map(k => k.t) }; } },
  { name: 'retime_clip', description: 'Scale every key time (speed=2 plays twice as fast) or stretch to a new length.', inputSchema: { type: 'object', properties: { id: STR, speed: NUM, len: NUM } , required: ['id'] },
    run: a => { const c = need(a.id), f = a.len ? Number(a.len) / c.len : 1 / Number(a.speed ?? 1); for (const k of c.keys) k.t = Math.round(k.t * f * 1000) / 1000; c.len = Math.round(c.len * f * 1000) / 1000; return summary(store.put(c)); } },
  { name: 'mirror_clip', description: 'Swap left and right limbs on every key (or only the key at t).', inputSchema: { type: 'object', properties: { id: STR, t: NUM }, required: ['id'] },
    run: a => { const c = need(a.id); c.keys = c.keys.map(k => (a.t === undefined || Math.abs(k.t - Number(a.t)) < 0.0015 ? mirrorKey(k) : k)); return summary(store.put(c)); } },
  { name: 'sample_pose', description: 'The evaluated pose (angles, hips offset, hand) at time t, plus where the hands and feet are in px. Use it to check a motion reads right.',
    inputSchema: { type: 'object', properties: { id: STR, t: NUM }, required: ['id', 't'] },
    run: a => {
      const c = need(a.id), s = evalClip(c, Number(a.t)), W = (rig.solve as (p: unknown) => Record<string, { x: number; y: number; r: number }>)(s.pose);
      const tip = (id: BoneId) => { const b = BONES.find(b => b.id === id)!, w = W[id], r = (w.r * Math.PI) / 180; return { x: Math.round(w.x + Math.cos(r) * b.len - HOME.x), y: Math.round(w.y + Math.sin(r) * b.len - HOME.y) }; };
      return { t: Number(a.t), hand: s.hand, root: Math.round(s.root), ...poseToKeyFields(s.pose), points: { handR: tip('handR'), handL: tip('handL'), footR: tip('legR_l'), footL: tip('legL_l'), head: tip('head') }, note: 'points are px from the stand spot, +y down' };
    } },
  { name: 'render_svg', description: 'Draw the character at time t as an SVG string (pencil style). Optionally with a weapon or a character preset, and a hold clip laid over.',
    inputSchema: { type: 'object', properties: { id: STR, t: NUM, weapon: STR, preset: { enum: Object.keys(PRESETS) }, hold: { ...STR, description: 'upper-body clip to lay over' } } },
    run: a => ({ content: [{ type: 'text', text: renderSvg(a.id ? need(a.id) : null, Number(a.t ?? 0), a.weapon as string, a.preset as string, a.hold ? need(a.hold) : undefined) }] }) },
  { name: 'validate_clip', description: 'Check a clip (by id, or a clip object) against the format.', inputSchema: { type: 'object', properties: { id: STR, clip: { type: 'object' } } },
    run: a => { const e = validateClip(a.clip ?? need(a.id)); return e.length ? { ok: false, errors: e } : { ok: true }; } },
  { name: 'put_clip', description: 'Write a whole clip object (create or replace). Use get_clip for the shape.', inputSchema: { type: 'object', properties: { clip: { type: 'object' } }, required: ['clip'] },
    run: a => summary(store.put(a.clip as Clip)) },
  { name: 'get_bindings', description: 'Which clip the game uses per weapon for hold, idle, walk, run, attack and skills.', inputSchema: { type: 'object', properties: {} }, run: () => store.read().bindings },
  { name: 'set_binding', description: 'Make the game use a clip for a weapon slot. slot: hold|idle|walk|run|attack|skills (skills appends; pass clip:null to clear a slot).',
    inputSchema: { type: 'object', properties: { weapon: STR, slot: { enum: ['hold', 'idle', 'walk', 'run', 'attack', 'skills'] }, clip: { type: ['string', 'null'] } }, required: ['weapon', 'slot'] },
    run: a => {
      const w = String(a.weapon), slot = a.slot as keyof Bindings, cur = store.read().bindings[w] ?? {};
      if (a.clip) need(a.clip);
      const b: Bindings = { ...cur };
      if (slot === 'skills') b.skills = a.clip ? [...new Set([...(cur.skills ?? []), String(a.clip)])] : [];
      else if (a.clip) (b as Json)[slot] = String(a.clip); else delete b[slot];
      store.replaceBindings({ ...store.read().bindings, [w]: b }); return b;
    } },
];

// ---- JSON-RPC over stdio ----
const out = (m: Json) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
const text = (v: unknown) => (v && typeof v === 'object' && 'content' in (v as Json) ? v : { content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] });

async function handle(m: { id?: number | string; method: string; params?: Json }) {
  switch (m.method) {
    case 'initialize': return { protocolVersion: (m.params?.protocolVersion as string) ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sketchbound-pose-studio', version: '0.1.0' },
      instructions: 'Make and edit Sketchbound stickman poses and animation clips. Call guide first. Edits save to the game immediately.' };
    case 'ping': return {};
    case 'tools/list': return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case 'tools/call': {
      const t = TOOLS.find(t => t.name === m.params?.name); if (!t) throw Object.assign(new Error('unknown tool ' + m.params?.name), { code: -32602 });
      try { return text(await t.run((m.params?.arguments as Json) ?? {})); }
      catch (e) { return { isError: true, content: [{ type: 'text', text: (e as Error).message }] }; }
    }
    default: throw Object.assign(new Error('method not found: ' + m.method), { code: -32601 });
  }
}

readline.createInterface({ input: process.stdin }).on('line', async line => {
  if (!line.trim()) return;
  let m; try { m = JSON.parse(line); } catch { return out({ id: null, error: { code: -32700, message: 'parse error' } }); }
  if (m.id === undefined) return; // notification
  try { out({ id: m.id, result: await handle(m) }); }
  catch (e) { out({ id: m.id, error: { code: (e as { code?: number }).code ?? -32603, message: (e as Error).message } }); }
});
process.stderr.write(`sketchbound MCP ready → ${store.file}\n`);
