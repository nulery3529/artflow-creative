import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    react(),
    viteSingleFile(),
  ],
  optimizeDeps: { entries: ['index.html'] },
  build: {
    outDir: 'dist-single',
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined } },
  },
});
