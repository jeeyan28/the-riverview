import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server is pinned to port 5501 to match the port the old
// HTML/CSS/JS frontend ran on (Live Server default). This is what
// Backend/.env's APP_BASE_URL will be updated to allow in Phase 9 —
// keep this port unless you change that value too.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5501,
    strictPort: true,
  },
})
