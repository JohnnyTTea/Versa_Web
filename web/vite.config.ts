import { defineConfig, loadEnv, type Plugin } from 'vite'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

// Announcements are read live by the API from public, never from a build copy.
function omitBuiltAnnouncements(): Plugin {
  let outputFile: string
  return {
    name: 'omit-built-announcements',
    apply: 'build',
    configResolved(config) {
      outputFile = resolve(config.root, config.build.outDir, 'announcements.txt')
    },
    async closeBundle() {
      await rm(outputFile, { force: true })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:3000'
  const basePath = env.VITE_BASE_PATH || './'

  return {
    plugins: [react(), omitBuiltAnnouncements()],
    base: basePath,
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
