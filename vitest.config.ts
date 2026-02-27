import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worktrees/**', // Exclude git worktrees to prevent duplicate test runs
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/__tests__/**', '**/dist/**', '**/*.config.*'],
    },
  },
});
