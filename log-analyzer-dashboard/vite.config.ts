import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — needed by every chunk, isolate so it's never duplicated
          'react-vendor': ['react', 'react-dom'],
          // recharts is heavy (~400KB min) and only needed when analytics render
          'recharts-vendor': ['recharts'],
          // lucide-react icons — tree-shakes but still substantial
          'lucide-vendor': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 300,
  },
})