import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: set VITE_BASE=/alert-tracker/ in CI.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  // Keep large static geoassets out of the JS bundle; served from /public/geo
  assetsInclude: ['**/*.geojson'],
})

