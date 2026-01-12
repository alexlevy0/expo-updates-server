import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    globals: true, // enables describe, it, expect globally
    environment: 'node', // default
  },
});
