import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages: depo adı alt yol olur (/productivity-vault/). Tauri ve yerel geliştirmede '/'.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 1200,
    // mini.html: masaüstünde her zaman üstte duran küçük odak penceresi
    rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), mini: fileURLToPath(new URL('./mini.html', import.meta.url)) } },
  },
  server: { port: 1420, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      // Masaüstü (Tauri) sürümünde service worker gereksiz; güncellemeyi Tauri updater yapar.
      disable: !!process.env.TAURI_ENV_PLATFORM,
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Verim Asistanı',
        short_name: 'Verim',
        description: 'Alışkanlık, görev, proje ve odak takibi — offline çalışır, bulutla eşitlenir.',
        theme_color: '#4c5fe0',
        background_color: '#191919',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
