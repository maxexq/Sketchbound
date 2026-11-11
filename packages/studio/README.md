# Pose Studio

Rig animator for Sketchbound. Pose the pencil stickman, key animation clips on a timeline, and save them straight into the game. It is a static site, built and deployed apart from the game, and it draws with the game's own rig code (`@sketchbound/shared`) and pencil art (`@sketchbound/client/art`), so a clip looks the same here and in game.

```
npm run studio          # http://localhost:5174
npm run studio:sync     # sync server on http://127.0.0.1:8790, writes packages/shared/src/data/clips.json
npm run build:studio    # packages/studio/dist (static) + packages/studio-server/dist (sync.js, mcp.js)
```

Stack: Vite + plain TypeScript + SVG, no UI framework. The build is about 110 KB of JS (38 KB gzipped). The sync and MCP servers use Node built-ins only and bundle to one file each.

## What it does

- **Weapon hold, one shot**: pick a weapon, drag one pose, save. It is an upper-body clip (`kind: hold`, `mask: upper`) that the game lays over stand, walk and run.
- **Stage**: drag a bone handle to rotate it (Shift snaps to 15°). Drag the hips to move the body (Shift+drag spins the whole body). Turn on IK, or hold Ctrl, to drag a hand or foot and let the elbow or knee bend. Right-drag pans, the wheel zooms, and a double-click resets the view. There are toggles for bones, onion skin (keys either side of the playhead), root motion, flip, IK and the motion path of the selected bone.
- **Timeline**: a zoomable ruler in frames, with a master key row and an events row (hits, shots, floor thuds). Rows for each group and each bone show value sparklines. You can box-select keys, drag them with frame snapping (Shift drags freely), Alt-drag to duplicate, and drag the clip-length handle. Double-click adds a key and right-click opens a menu for easing, hits and delete. Easing shows as the key's glyph. **Graph editor (G)**: the selected bone's curve, where you drag points up or down to change values.
- **Panels**: clip settings (kind, weapon, length, game speed, root motion, follow-through, loop, aim, combo end, full-body or upper mask, game binding). The key panel has time, easing with its curve, hand shape, hit (high/low/launch, damage, push), projectile and floor thud. There is a slider per bone, grouped by body part.
- **Library and templates**: every built-in move, idle, walk, run, hit reaction and emote can start a new clip. Still poses can be applied to the key at the playhead. My clips live in the browser (localStorage) and show whether each one matches the game.
- **ดูผลในเกม**: stand, walk, run and stand → attack, using what the game has bound for the weapon, with the open clip swapped in where it fits.
- **Import/Export**: one clip, the whole library, the game's `clips.json`, a PNG sprite sheet or an SVG frame. Import also reads the old prototype's saved moves.
- **Undo/redo**, auto-key, 24/30/60 fps snapping, and keyboard shortcuts (press `?`).

## Save to game

`บันทึกลงเกม` sends the clip to the sync server, which writes `packages/shared/src/data/clips.json`. `@sketchbound/shared` registers every clip in that file into the rig at import time, so a clip whose id matches a built-in move (for example `slash`) replaces that move, and any other id becomes a new move that `rig.animate(id, t)` and `attackEvents(id, rate)` can play. Vite reloads the game client when the file changes.

The sync server pushes changes to every open studio over Server-Sent Events. Edits made by an AI agent through MCP, by `git pull` or by hand show up live.

Without the sync server, Save downloads `clips.json` for you to drop into `packages/shared/src/data/`.

## Deploy

The studio is a static folder (`packages/studio/dist`, built with `base: './'`), so any static host works: Cloudflare Pages, Netlify, S3, or GitHub Pages through the manual workflow in `.github/workflows/deploy-studio.yml`. The deployed page talks to the sync server running next to the game code. It defaults to `http://127.0.0.1:8790`, and the address can be changed with the status button in the top bar or with `?sync=https://host&token=…`. On a shared machine, set `STUDIO_TOKEN` and `STUDIO_ORIGINS` on the sync server.

| env (sync server) | default | |
|---|---|---|
| `PORT` / `HOST` | `8790` / `127.0.0.1` | where it listens |
| `SKETCHBOUND_CLIPS` | `packages/shared/src/data/clips.json`, found from the current folder | the pack file |
| `STUDIO_TOKEN` | none | require `Authorization: Bearer <token>` |
| `STUDIO_ORIGINS` | `*` | CORS allow-list, comma separated |
