import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The end to end suite binds real ports and drives one shared bot, so it
    // cannot share a process with anything else.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The mineflayer adapter is covered by the end to end suite, which runs a
      // real bot rather than importing the module directly.
      reporter: ['text', 'lcov']
    }
  }
})
