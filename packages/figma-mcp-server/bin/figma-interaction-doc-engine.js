#!/usr/bin/env node
// Wrapper that loads the compiled stdio server. Build with `npm run build` first.
import('../dist/server/index.js').catch((err) => {
  process.stderr.write(`[figma-interaction-doc-engine] failed to start: ${err.stack ?? err}\n`);
  process.exit(1);
});
