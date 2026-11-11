# Sticky World

MMO RPG ตัวละครเส้นดินสอ ในโลกของภาพวาด · A pencil-stickman MMO RPG set in a world of drawings.

This is **Phase 0** of the plan: the single-file prototype split into a real project so the game logic can run on a server.

```
packages/
  shared/   game logic both sides run: rig (14 bones, poses, attack tracks), map layout, authoritative zone sim, protocol
    src/data/   game data as JSON: skills.json, mobs.json, presets.json, maps/pencil-field.json
  server/   Node WebSocket server: one zone, 20 ticks/s, full snapshots
  client/   Vite page that draws the zone in the prototype's pencil SVG style
tools/prototype.html   the original single-file prototype, kept as reference
```

## Run it

```bash
npm install
npm run dev:server     # ws://localhost:8787
npm run dev:client     # http://localhost:5173  (open two tabs to play together)
npm test               # sim tests
npm run typecheck
```

The client connects to `ws://<page host>:8787`; pass `?server=wss://…` to point it elsewhere.

## How it works

- The **server decides everything**: movement, targeting, hit timing, damage, crits, EXP, levels, mob AI, respawns. Clients send only intent: `move`, `target`, `skill`.
- Attack hit moments come from the same keyframe tracks the animation uses (`attackEvents` in `shared/src/sim.ts`), so what you see and when damage lands stay in sync.
- Animation is **not** sent over the network. The server sends `{anim name, start time, rate}`; each client plays the bones itself, with the prototype's springs for follow-through.
- The client renders ~100 ms behind the server and interpolates between snapshots.
- The map layout (trees, rocks, spawns) is generated from the map JSON's seed, so server and client agree without sending it.

## Not yet (next phases)

NPC bots, emotes, Pose Studio moves, login and saving characters, PixiJS renderer, binary/delta snapshots. Files under `shared/src/rig.ts` and `client/src/art.ts` are ported verbatim from the prototype and are not type-checked yet (`// @ts-nocheck`).
