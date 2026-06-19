import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':    ['react', 'react-dom'],
          'query-vendor':    ['@tanstack/react-query'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'hf-vendor':       ['@huggingface/inference'],
        },
      },
    },
  },
})
