import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{js,jsx}'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.js'],
  },
});
