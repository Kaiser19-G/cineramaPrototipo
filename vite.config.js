import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // La API (server/) corre solo en local; Vite la expone al navegador por /api,
    // así también funciona con --host en la red local.
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
})
