import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'adapter-moca',
    // @cosmjs/encoding ships CJS; it require()s @scure/base which is ESM-only
    // at v2. inline these deps AND enable vite's SSR optimizer so vitest
    // pre-bundles them as ESM — converts the sync require into a dynamic
    // import inside the test worker.
    server: {
      deps: {
        inline: [/@cosmjs\/.*/, /@scure\/.*/],
      },
    },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            '@cosmjs/encoding',
            '@cosmjs/proto-signing',
            '@cosmjs/stargate',
            '@cosmjs/tendermint-rpc',
            '@scure/base',
          ],
        },
      },
    },
  },
})
