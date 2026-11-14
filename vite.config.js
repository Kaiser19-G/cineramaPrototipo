import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Datos privados del servidor: nunca deben entregarse ni vigilarse, aunque alguien los deje bajo el proyecto.
// (Viven fuera del proyecto, ver server/dataDir.js; esto es una defensa adicional.)
const PRIVATE_GLOBS = ['**/server/data/**', '**/*.db', '**/*.db-wal', '**/*.db-shm', '**/*.db.migrating*', '**/*.key', '**/.cinerama-data/**']
const PRIVATE_RE = /(^|[\\/])server[\\/]data([\\/]|$)|\.(db|db-wal|db-shm|key)(\.migrating[^\\/]*)?$|\.cinerama-data/i

// Vite compara rutas sin decodificar en algunos casos: se rechaza por URL decodificada (varias pasadas).
const blockPrivate = {
  name: 'cinerama-block-private-files',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      let p = (req.url || '').split(/[?#]/)[0]
      for (let i = 0; i < 3; i++) { try { p = decodeURIComponent(p) } catch { break } }
      if (PRIVATE_RE.test(p.replace(/\\/g, '/'))) { res.statusCode = 404; res.end('Not found'); return }
      next()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [blockPrivate, react()],
  server: {
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', ...PRIVATE_GLOBS] },
    watch: { ignored: PRIVATE_GLOBS },
    // La API (server/) corre solo en local; Vite la expone al navegador por /api,
    // así también funciona con --host en la red local.
    // xfwd: la API ve la IP real del cliente (X-Forwarded-For) para limitar intentos por IP.
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 3001}`, xfwd: true } },
  },
})
