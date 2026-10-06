import { defineConfig } from 'vite';

// Relative base: the build works at a domain root, under a sub-path such as
// https://gvart.github.io/pixelarrow/ and inside Telegram's webview alike.
// All art is generated in code, so there are no runtime asset URLs to fix up.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // preview.html (procedural sprite sheets) is shipped too, for art review.
      input: { main: 'index.html', preview: 'preview.html' },
    },
  },
  server: { host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as any);
