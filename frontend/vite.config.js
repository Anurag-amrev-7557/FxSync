import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer';

// Load environment variables based on the current mode
export default defineConfig(({ mode }) => {
  // Load .env files and merge with process.env
  const env = loadEnv(mode, '', '');
  // Fallback to localhost if not set
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:4000';

  return {
    plugins: [react(), visualizer({ open: true })],
    server: {
      proxy: {
        '/audio-url': backendUrl,
        '/generate-session-id': backendUrl,
        '/session-info': backendUrl,
      }
    }
  }
});
