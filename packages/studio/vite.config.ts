import { defineConfig } from 'vite';
// base './' so the build works from any static host or sub-path (Cloudflare Pages, GitHub Pages, S3...)
// clips.json is not watched: the studio gets the game's clips over the sync server, and a reload on every save would drop what you're doing
export default defineConfig({ base: './', server: { port: 5174, watch: { ignored: ['**/shared/src/data/clips.json'] } }, build: { target: 'es2022', assetsInlineLimit: 0 } });
