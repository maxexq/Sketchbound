# Pose Studio server

Two small Node programs, built-ins only, that edit the game's clip pack `packages/shared/src/data/clips.json`:

- `src/sync.ts`: the HTTP + Server-Sent Events server that Pose Studio uses to save to the game.
- `src/mcp.ts`: an MCP server (stdio) so an AI agent can make and edit poses and animation clips.

`npm run build` bundles each into one file in `dist/`, about 50 MB of RAM each when running (mostly Node itself).

## MCP

Claude Code picks the server up from the repo's `.mcp.json`. Elsewhere:

```bash
claude mcp add sketchbound -- node packages/studio-server/dist/mcp.js    # after npm run build:studio
claude mcp add sketchbound -- npx tsx packages/studio-server/src/mcp.ts   # no build step
```

Tools: `guide` (read first), `list_bones`, `list_templates`, `list_clips`, `get_clip`, `create_clip` (empty, or from a template or clip), `update_clip`, `put_clip`, `delete_clip`, `set_key` (absolute angles `a` or `offsets` from rest, easing, hand, hit, shoot, thud, `from_pose`), `delete_key`, `move_key`, `retime_clip`, `mirror_clip`, `sample_pose` (angles plus hand/foot positions, to check a motion), `render_svg`, `validate_clip`, `get_bindings`, `set_binding`.

Every change is written to `clips.json` right away. When `npm run studio:sync` is running, open studios update live.

## Sync API

`GET /api/health` · `GET /api/pack` · `GET /api/events` (SSE, event `pack`) · `GET|PUT|DELETE /api/clips/:id` · `PUT /api/bindings` (all) · `PUT /api/bindings/:weapon`
