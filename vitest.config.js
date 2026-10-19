import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.js'],
    // Agent worktrees hold other branches' copies of tests/.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
