import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // La API (server/) corre solo en local; Vite la expone al navegador por /api,
    // así también funciona con --host en la red local.
    // xfwd: la API ve la IP real del cliente (X-Forwarded-For) para limitar intentos por IP.
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 3001}`, xfwd: true } },
  },
})
