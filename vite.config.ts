import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the bundle works inside the Capacitor WebView.
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
});
