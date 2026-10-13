// Dev server config for scripts/landing/record-clips.mjs: the game's own vite.config.ts, plus
// fs.allow for a node_modules that is a symlink out of the checkout (worktrees share the main
// checkout's node_modules; without this the @fontsource fonts answer 403 and the clips would
// show fallback fonts).
// Usage: npx vite --config scripts/landing/vite.record.config.mjs --port <p> --strictPort
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig, searchForWorkspaceRoot } from 'vite';
import base from '../../vite.config.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export default mergeConfig(base, {
  root,
  server: { host: 'localhost', fs: { allow: [searchForWorkspaceRoot(root), realpathSync(join(root, 'node_modules'))] } },
});
