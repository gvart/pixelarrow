// Vite plugin: pack the class sheets before the build reads them (I3c), so
// `vite build` ships only packed sheets (src/generated/sheets/) and the dev
// server has the packed placeholders (src/generated/dev-sheets/, ?sheets=dev).
// The dev server repacks when a source sheet changes. Up-to-date classes are skipped.
import { packAll, TREES } from './cli.mjs';

export function sheetPackPlugin() {
  let dev = false;
  const run = (log) => packAll({ dev, log: (s) => !s.endsWith('up to date') && log(s) });
  return {
    name: 'sheet-pack',
    configResolved(c) {
      dev = c.command === 'serve';
    },
    buildStart() {
      run((s) => console.log(s));
    },
    configureServer(server) {
      const srcs = [TREES.shipped.from, TREES.dev.from];
      server.watcher.add(srcs);
      const repack = (file) => {
        if (!srcs.some((d) => file.startsWith(d))) return;
        try {
          run((s) => server.config.logger.info(s));
        } catch (err) {
          server.config.logger.error(String(err));
        }
      };
      server.watcher.on('change', repack);
      server.watcher.on('add', repack);
    },
  };
}
