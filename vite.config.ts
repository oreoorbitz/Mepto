import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      include: ['src/**/*'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    }),
  ],
  esbuild: {
    target: 'es2020',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/meptos.ts'),
      name: 'Mepto',
      formats: ['es', 'umd'],
      fileName: (format) => {
        if (format === 'es') return 'meptos.js';
        if (format === 'umd') return 'meptos.umd.cjs';
        return `meptos.${format}.js`;
      },
    },
    rollupOptions: {
      // Make sure to externalize deps that shouldn't be bundled
      external: [],
      output: {
        // Provide global variables to use in the UMD build
        globals: {},
        // Enable tree-shaking
        exports: 'named',
      },
    },
    // Generate source maps for debugging
    sourcemap: true,
    // Minify for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        reserved: ['Mepto', '$'],
      },
    },
    // Enable chunk splitting for better caching
    chunkSizeWarningLimit: 1000,
  },
  // Development server configuration
  server: {
    port: 3000,
    open: true,
  },
  // Path aliases for cleaner imports
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // Test configuration
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        'tools/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
      ],
    },
  },
});
