import { defineConfig } from 'vite';

export default defineConfig({
  base: '/TowerOfHanoi/',
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});
