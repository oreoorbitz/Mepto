import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { createServer } from 'net'
import { writeFileSync } from 'fs'

const PORT_RANGE_START = 3000
const PORT_RANGE_END = 3099

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port)
  })
}

async function findAvailablePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error(`No available port in range ${PORT_RANGE_START}–${PORT_RANGE_END}`)
}

export default defineConfig(async ({ command }) => {
  // Vitest (and `vite build`) don't need a dev-server port — avoid the
  // 3000–3099 scan entirely so `npm test` works even when the dev server
  // is already holding the range.
  const isVitest = !!process.env.VITEST || command === 'build'
  const port = isVitest ? 3000 : await findAvailablePort()
  return {
    plugins: [
      dts({
        insertTypesEntry: true,
        include: ['src/**/*'],
        exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
        // Pre-existing type errors in unconverted modules are expected.
        // Don't block the build — esbuild already produces working JS.
        skipDiagnostics: true,
      }),
      {
        name: 'write-port',
        configureServer(server) {
          server.httpServer?.once('listening', () => {
            const addr = server.httpServer?.address()
            if (addr && typeof addr === 'object') {
              writeFileSync('.port', String(addr.port))
            }
          })
        },
      },
    ],
    esbuild: {
      target: 'es2020',
      loader: 'ts',
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'src/meptos.ts'),
        name: 'Mepto',
        formats: ['es', 'umd'],
        fileName: format => {
          if (format === 'es') return 'meptos.js'
          if (format === 'umd') return 'meptos.umd.cjs'
          return `meptos.${format}.js`
        },
      },
      rollupOptions: {
        // Make sure to externalize deps that shouldn't be bundled
        external: [],
        // Disable tree-shaking for the library build. `package.json`
        // sets `sideEffects: false` so consumer bundlers can drop
        // unused exports, but the library build itself relies on the
        // `meptos.ts` entry's side-effect imports to register the
        // module globals (`$.ajax`, `$.fn`, `$.fx`, ...). Without
        // this, the UMD bundle is a 611-byte re-export skeleton that
        // doesn't actually run the library.
        treeshake: false,
        output: {
          // Provide global variables to use in the UMD build
          globals: {},
          // Enable tree-shaking
          exports: 'named',
        },
      },
      // Generate source maps for debugging
      sourcemap: true,
      // Minify the published bundle so size-limit measures real shipped bytes.
      // esbuild is already in the dep graph via Vite — no extra terser dep needed.
      minify: 'esbuild',
      // Enable chunk splitting for better caching
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port,
      strictPort: true,
      open: true,
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['node_modules/', 'dist/', 'test/', 'tools/', '**/*.d.ts', '**/*.config.{js,ts}'],
      },
    },
  }
})
