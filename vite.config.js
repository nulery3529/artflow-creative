import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Force a single copy of React/ReactDOM so hooks don't end up bound to
    // a stale dispatcher ("null is not an object (evaluating 'dispatcher.useState')")
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    react(),
  ],
  // Ignore archived generated HTML bundles when Vite discovers dev entries.
  optimizeDeps: { entries: ['index.html'] },
  // Let Rollup decide chunk boundaries. Hand-splitting React, router,
  // and shared vendors created a circular production chunk dependency that
  // could stop Safari before React mounted, leaving a completely white page.
  build: {}, 
});
