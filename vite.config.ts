import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so `dist/` can be served from any folder (e.g. on a Raspberry Pi).
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
