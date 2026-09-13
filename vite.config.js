import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Ensure the Base44 Vite plugin has the app id during Vercel builds.
// The frontend also has this id as a fallback, but the plugin reads the
// environment while the Vite config is being evaluated.
process.env.VITE_BASE44_APP_ID ||= '6a91be5ced6058323eb21f7d'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // Force a single copy of React/ReactDOM so hooks don't end up bound to
    // a stale dispatcher ("null is not an object (evaluating 'dispatcher.useState')")
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ],
  // Let Rollup decide chunk boundaries. Hand-splitting React, router, Base44,
  // and shared vendors created a circular production chunk dependency that
  // could stop Safari before React mounted, leaving a completely white page.
  build: {}, 
});