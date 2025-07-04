import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/audio-url': 'http://localhost:4000',
      '/generate-session-id': 'http://localhost:4000',
      '/session-info': 'http://localhost:4000',
    }
  }
})
