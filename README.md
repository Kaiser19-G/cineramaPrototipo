# Cinerama

Prototipo académico de una cadena de cines: sitio público (React 19 + Vite) y panel de administración, con una API
local (Express 5 + SQLite con `better-sqlite3`) en `server/`.

## Ejecutar

```bash
npm install
npm run seed      # crea/actualiza la base (`~/.cinerama-data/cinerama.db`, ver "Dónde viven los datos") y la contraseña de demostración del personal
npm run dev       # Vite (5173) + API (3001); Vite expone la API en /api
npm run test:api  # pruebas de la API (base temporal, no toca tus datos)
```

Si ya tenías una base de datos anterior a la fase 2, el servidor la migra solo al arrancar (conserva tus datos).
Si el personal no puede iniciar sesión, ejecuta `npm run seed:auth`.

## Dónde viven los datos

La base SQLite (`cinerama.db`, `-wal`, `-shm`) y la clave `auth-secret.key` están **fuera del proyecto**, en
`~/.cinerama-data/` (directorio `0700`, archivos `0600`), porque el servidor de desarrollo de Vite entrega cualquier
archivo bajo la raíz del proyecto (y con `npm run dev -- --host` quedaría al alcance de la red local). Cambia el lugar
con `CINERAMA_DATA_DIR=/otra/ruta`. El servidor se niega a arrancar si el directorio efectivo (con enlaces simbólicos
resueltos) queda dentro del proyecto. `vite.config.js` además bloquea `server/data`, `*.db`, `*.db-wal`, `*.db-shm` y `*.key`.

- **Migración automática:** si existe `server/data/cinerama.db` (ubicación anterior) y el directorio nuevo no tiene base,
  al arrancar la API o ejecutar `npm run seed` se traslada la base y la clave, se verifica la copia (`integrity_check` y
  conteos de filas) y solo entonces se borran los archivos antiguos. Si algo falla, no se borra nada y el arranque se detiene.
- **Reiniciar la base:** `npm run seed -- --reset` (borra y vuelve a crear con los datos de ejemplo), o detén la API y
  borra `~/.cinerama-data/cinerama.db*`. Para empezar de cero también con la clave, borra todo `~/.cinerama-data/`
  (los DNI ya registrados dejarían de ser reconocibles sin la clave anterior).

## Cuentas (fase 2)

- **Clientes:** se registran en `/web/registro` con nombre, DNI, correo, celular y contraseña. El celular se verifica
  con un código de 6 dígitos **simulado** (no se envía ningún SMS: el código aparece en pantalla y en la consola del
  servidor). El DNI se guarda solo como huella irreversible (HMAC con una clave en `~/.cinerama-data/auth-secret.key`) y sus
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

## Reclamos de DNI usado por otra persona (fase 2b)

Si al registrarse alguien ve "Ya existe una cuenta con este documento", el enlace **"¿Este DNI es tuyo? Presenta un reclamo"**
lleva a `/web/reclamo-dni` (público, sin sesión): nombre, DNI, correo, celular, foto del DNI por delante y por detrás, una
**carta firmada** (a mano o impresa con firma; la página trae el texto modelo copiable) y una selfie opcional. Solo imágenes
JPG, PNG o WebP de hasta 5 MB (el navegador las recodifica a JPEG, lo que quita la ubicación EXIF; el **servidor no** quita
metadatos). Al enviar se entrega un **código** (`XXXX-XXXX-XXXX`) para consultar el estado en `/web/reclamo-dni/estado`; no hay
correo ni SMS para avisar.

- **Revisión:** el administrador central ve **Reclamos de DNI** en el menú (`/claims`): lista, detalle con las fotos y
  aprobar o rechazar con un motivo. Al aprobar, la cuenta que usaba el DNI queda **suspendida** (sesiones cerradas) y el DNI se
  libera, **reservado 7 días** para el correo del reclamo. Aprobar o rechazar **borra** las fotos, la carta y los datos personales.
- **Dónde están los archivos:** `~/.cinerama-data/claims/` (junto a la base; directorio `0700`, archivos `0600`, nombres aleatorios),
  fuera del proyecto y nunca servidos de forma estática; solo el admin central con sesión los recibe por la API.
- **Caducidad:** un borrador sin enviar se borra a la hora; un reclamo sin resolver, a los 30 días. Límites: 3 reclamos nuevos
  por IP cada 24 h, 3 abiertos por DNI, 200 abiertos en total. Si el borrado de un archivo falla, queda marcado y se reintenta cada hora.
- **Pantalla bloqueada con la contraseña de demostración:** mientras el administrador central conserve `Cinerama#2026`, la
  pantalla Reclamos (y su API) responde bloqueada. Cambia la contraseña con:

  ```bash
  npm run set-password -- admin@cinerama.com
  ```

  El comando pide la contraseña nueva (dos veces) **sin mostrarla**; no se pasa por argumento ni queda en el historial. Cierra las
  sesiones abiertas de ese usuario. No hay variable de entorno para saltarse el bloqueo.

### Variables de entorno

`PORT` (API), `API_PORT` (destino del proxy de Vite), `CINERAMA_DATA_DIR` (directorio de datos), `CINERAMA_DB` (ruta explícita de la base; la clave se guarda a su lado), `SIMULATE_SMS=0` (oculta el
código simulado), `COOKIE_SECURE=1` (cookie `Secure`, solo con HTTPS), `CINERAMA_PEPPER` (clave del HMAC del DNI).
