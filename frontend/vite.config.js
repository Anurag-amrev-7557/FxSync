import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:4000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/audio-url': backendUrl,
      '/generate-session-id': backendUrl,
      '/session-info': backendUrl,
    }
  }
})