// The landing site for pixelarrow.app (ADR-0011): static Astro output, no UI framework, no client
// runtime. Served by the landing Worker (worker/index.ts, wrangler.jsonc; ADR-0007).
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://pixelarrow.app',
  output: 'static',
  // One page: all of its CSS is critical, so it ships inline (ADR-0011: ≤ 14 kB gzip inlined).
  build: { inlineStylesheets: 'always' },
  // Never the 4321 default: another loop shares this machine (V6-002). Slot 3 of the v6 run.
  server: { port: 6130 },
});
