# Cinerama

Prototipo académico de una cadena de cines: sitio público (React 19 + Vite) y panel de administración, con una API
local (Express 5 + SQLite con `better-sqlite3`) en `server/`.

## Ejecutar

```bash
npm install
npm run seed      # crea/actualiza la base (server/data/cinerama.db) y la contraseña de demostración del personal
npm run dev       # Vite (5173) + API (3001); Vite expone la API en /api
npm run test:api  # pruebas de la API (base temporal, no toca server/data)
```

Si ya tenías una base de datos anterior a la fase 2, el servidor la migra solo al arrancar (conserva tus datos).
Si el personal no puede iniciar sesión, ejecuta `npm run seed:auth`.

## Cuentas (fase 2)

- **Clientes:** se registran en `/web/registro` con nombre, DNI, correo, celular y contraseña. El celular se verifica
  con un código de 6 dígitos **simulado** (no se envía ningún SMS: el código aparece en pantalla y en la consola del
  servidor). El DNI se guarda solo como huella irreversible (HMAC con una clave en `server/data/auth-secret.key`) y sus
  últimos 3 dígitos. Política de datos (borrador sin revisión legal): `/web/privacidad`.
- **Personal:** inicia sesión en `/web/login` y entra al panel de administración.

### Credenciales de demostración (SOLO DEMOSTRACIÓN)

Los 8 usuarios del personal comparten una sola contraseña de ejemplo: **`Cinerama#2026`**
(definida en `server/seedAuth.js`; no usar en ningún entorno real).

| Correo | Rol | Sede |
|---|---|---|
| admin@cinerama.com | Administrador central | todas |
| sarah.mitchell@cinerama.com | Gerente | 1 |
| emily.rodriguez@cinerama.com | Gerente | 3 |
| michael.chen@cinerama.com | Cajero | 1 |
| lisa.brown@cinerama.com | Cajero | 2 |
| david.thompson@cinerama.com | Cajero (cuenta desactivada: no puede entrar) | 4 |
| james.wilson@cinerama.com | Soporte | 1 |
| anna.martinez@cinerama.com | Operador | 2 |

Solo el administrador central entra a `/users`, `/cinema` y `/settings`. Las rutas `/api/admin/*` exigen sesión de personal.

### Variables de entorno

`PORT` (API), `API_PORT` (destino del proxy de Vite), `CINERAMA_DB` (archivo de la base), `SIMULATE_SMS=0` (oculta el
código simulado), `COOKIE_SECURE=1` (cookie `Secure`, solo con HTTPS), `CINERAMA_PEPPER` (clave del HMAC del DNI).
