import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Team Media Hub',
        short_name: 'TMH',
        description: 'Private photo sharing for teams and families',
        theme_color: '#00aeff',
        background_color: '#0f0f1e',
        display: 'standalone',
        scope: '/',
        start_url: '/',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,txt,png,jpg,jpeg,gif,svg,woff,woff2,ttf,eot}'],
        globIgnores: [
          '**/node_modules/**/*',
          '**/.git/**/*',
        ],
        // Cache app shell only
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/app\.teammediahub\.co\/.+/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60, // 1 day
              },
            },
          },
          // DO NOT cache media URLs - they have signed queries
          // DO NOT cache API calls - always fetch fresh
        ],
        // Explicitly exclude media and API domains
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
})

