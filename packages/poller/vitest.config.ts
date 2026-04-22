import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'poller',
    // vitest 4 widened the default include — without an explicit exclude it
    // picks up compiled duplicates under dist/.
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
})
