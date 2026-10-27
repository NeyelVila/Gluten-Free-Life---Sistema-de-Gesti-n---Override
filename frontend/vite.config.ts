import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Gluten Free Life — Sistema de Gestión',
        short_name: 'Gluten Free Life',
        description: 'Ventas, stock, vencimientos, compras y caja para la dietética.',
        theme_color: '#2E7D32',
        background_color: '#FAF7EF',
        display: 'standalone',
        lang: 'es-AR',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:4000', changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
