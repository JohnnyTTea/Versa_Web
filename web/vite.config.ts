import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Versa/',
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.16.31:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
