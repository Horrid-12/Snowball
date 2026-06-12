import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(() => {
    const isTauri = !!process.env.TAURI_ENV_PLATFORM;

    return {
        plugins: [
            react(),
            !isTauri && VitePWA({
                registerType: 'autoUpdate',
                includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
                manifest: {
                    name: 'Snowball Productivity',
                    short_name: 'Snowball',
                    description: 'Snappy offline-first productivity hub',
                    theme_color: '#3b82f6',
                    icons: [
                        {
                            src: 'pwa-192x192.png',
                            sizes: '192x192',
                            type: 'image/png'
                        },
                        {
                            src: 'pwa-512x512.png',
                            sizes: '512x512',
                            type: 'image/png'
                        }
                    ]
                },
                workbox: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
                }
            })
        ].filter(Boolean),
        build: {
            rollupOptions: {
                output: {
                    manualChunks: {
                        'vendor-react': ['react', 'react-dom'],
                        'vendor-framer': ['framer-motion'],
                        'vendor-lucide': ['lucide-react'],
                    }
                }
            }
        },
        optimizeDeps: {
            entries: ['index.html']
        },
        server: {
            watch: {
                ignored: ['**/android/**/build/**', '**/src-tauri/target/**', '**/dist/**']
            }
        },
        base: './',
    };
})
