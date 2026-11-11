import { defineConfig } from 'vite';
// base './' so the build works from any static host or sub-path (Cloudflare Pages, GitHub Pages, S3...)
export default defineConfig({ base: './', server: { port: 5174 }, build: { target: 'es2022', assetsInlineLimit: 0 } });
