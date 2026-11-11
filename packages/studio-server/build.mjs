// one self-contained file per entry, no node_modules needed at runtime
import { build } from 'esbuild';
for (const e of ['sync', 'mcp']) {
  await build({ entryPoints: [`src/${e}.ts`], outfile: `dist/${e}.js`, bundle: true, platform: 'node', format: 'esm', target: 'node20', minify: true, legalComments: 'none', banner: { js: '#!/usr/bin/env node' } });
}
console.log('built dist/sync.js dist/mcp.js');
