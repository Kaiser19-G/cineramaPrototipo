# Cinerama

Prototipo académico de una cadena de cines: sitio público (React 19 + Vite) y panel de administración, con una API
local (Express 5 + SQLite con `better-sqlite3`) en `server/`.

## Ejecutar

```bash
npm install
npm run seed      # carga los datos de ejemplo en una base vacía (`~/.cinerama-data/cinerama.db`, ver "Dónde viven los datos") y la contraseña de demostración del personal; no pisa una base con datos
npm run dev       # Vite (5173) + API (3001); Vite expone la API en /api
npm run test:api  # pruebas de la API (base temporal, no toca tus datos)
```

Si ya tenías una base de datos anterior, el servidor la migra solo al arrancar (conserva tus datos). La migración 3 (fase 3) solo
agrega columnas y tablas, convierte las clasificaciones antiguas (G/PG → APT, PG-13/PG-14 → +14, R/NC-17 → +18) y agrega salas de ejemplo
a las sedes que declaran salas y no tienen ninguna.

`npm run seed` **ya no pisa datos**: solo carga las tablas que están vacías. Para recrearlo todo: `npm run seed -- --reset`. Para renovar
solo las fechas de las funciones de ejemplo: `npm run seed -- --refresh-screenings` (las funciones se programan desde el panel).
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

## Usuarios y contraseña temporal (fase 3c)
- **Usuarios y accesos** (`/users`, solo administrador central): pestañas Personal, Clientes, Roles y permisos (generada de `PERMS`) y
  Registros de actividad (de `audit_log`). De los clientes solo se ven el DNI (últimos 3 dígitos), el correo y el celular parcialmente
  ocultos; nunca contraseñas, huellas ni DNI completos. Las cuentas de clientes no se editan desde el panel. No hay borrado de cuentas.
- **Bloqueo por contraseña de demostración:** igual que Reclamos, la API y la pantalla de usuarios responden bloqueadas
  (`demo_password`) mientras algún administrador central activo conserve `Cinerama#2026`; cámbiala con `npm run set-password`.
- **Crear personal / restablecer contraseña:** el servidor genera una contraseña temporal aleatoria (`XXXXX-XXXXX-XXXXX`) y la
  devuelve **una sola vez** en la respuesta (no se guarda en claro, no va a consola ni a `audit_log`; copia el botón "Copiar").
  La cuenta queda con `must_change_password`: al iniciar sesión solo ve la pantalla "Cambia tu contraseña para continuar" y el servidor
  responde `403 password_change_required` a cualquier ruta de `/api/admin/*` hasta que la cambie con `POST /api/auth/change-password`
  (contraseña actual + nueva de 8 a 128 caracteres; cierra las demás sesiones de la cuenta; 5 intentos fallidos por cuenta cada 15 min).
  Cualquier persona del personal puede cambiarla cuando quiera desde su menú de usuario ("Cambiar contraseña").
- **Guardas:** nadie cambia su propio rol ni su estado; no se deja al sistema sin administrador central activo; las cuentas suspendidas
  por un reclamo no se reactivan desde aquí; al desactivar, cambiar de rol o restablecer la contraseña se cierran las sesiones de esa cuenta.
  Emitir contraseñas temporales está limitado (10 cada 15 min por administrador).

## Compras de entradas (fase 4a)
- **Compra real, pago simulado:** `/web/compra/:id` (con la función elegida; sin sesión lleva a iniciar sesión y vuelve al mismo mapa).
  Solo compran las cuentas de cliente. El pago es **simulado**: el número, titular, vencimiento y CVV no salen del navegador (el cuerpo de
  `POST /api/orders` solo lleva función, butacas, clave de idempotencia y `payment {method, simulatedOutcome}`); el selector "Resultado de
  la simulación" permite probar un pago rechazado (se guarda una orden `rejected` sin butacas activas).
- **API:** `GET /api/screenings/:id/seats` (público: mapa, butacas ocupadas y, con sesión, el cupo de la cuenta) y `POST /api/orders`
  (límite de 15 intentos cada 15 min por cuenta). Errores: `validation`, `unauthenticated`, `customer_only`, `not_found`, `not_on_sale`,
  `sold_out`, `seats_taken`, `limit_exceeded`, `idempotency_conflict`, `payment_declined`, `too_many_attempts`.
- **Butacas:** la distribución se genera de `screenings.total_seats` (`src/shared/seatLayout.js`); la verdad de lo vendido es `order_seats`
  (`active = 1`); `screenings.booked_seats` es una caché que solo escribe `server/orders/service.js`. "Agotada" se deriva, nunca se guarda.
- **Topes** (`src/shared/purchase.js`, `src/shared/presale.js`): 8 entradas por cuenta y función (acumulado) y, en preventa, 4 por cuenta y
  película (acumulado entre funciones). La venta web cierra a la hora de inicio (`WEB_SALE_CUTOFF_MINUTES`, hora de Lima).
- **Código de orden:** `CIN-XXXXX-XXXXX` (≈49 bits). Mis entradas, el panel real (Pagos, Reportes, Dashboard) y Taquilla llegan en 4b, 4c y 4d:
  hasta entonces esas pantallas del panel siguen con datos de ejemplo.
- **Cancelar una función con ventas** reembolsa (simulado) sus órdenes y libera las butacas en la misma transacción.
- **Migración 4** (se aplica sola al arrancar): agrega columnas e índices y **borra las órdenes de ejemplo heredadas** (todas las filas de
  `orders` y sus `order_seats` existentes en ese momento), deja `booked_seats` en el conteo real y repone a `scheduled` las funciones
  guardadas como `sold_out`. El seed ya no crea órdenes ni contadores.

## Confitería: catálogo (fase 5a)
Solo el catálogo y su gestión; la compra con confitería, la cola de recojo y el comparador de tamaños llegan en 5b a 5e.
- **Panel:** página **Confitería** (`/confiteria`, entrada en el menú lateral solo con permiso). El **administrador central** crea y edita
  productos, tamaños, precios y combos y los activa o desactiva (`manage_products`; no hay borrado, solo `active`). El **administrador central
  y el gerente** marcan cada tamaño como **disponible o agotado** en su sede (`manage_stock`; el gerente solo en la suya, otra sede responde
  404). Cajero, operador y soporte no ven la página (403). Un cambio de precio sube la versión del producto (409 `stale` si otra persona
  editó antes); `audit_log` guarda `product.create`, `product.update` y `product.stock` solo con ids y nombres de campos.
- **Modelo (migración 5, tablas nuevas, no toca datos existentes):** `products`, `product_variants` (etiqueta, precio en soles con 2 decimales,
  volumen en ml, alto, diámetros, "ideal para N personas"), `combo_items` (un combo tiene un tamaño y apunta a tamaños sueltos, sin anidar) y
  `branch_variants` (agotado por sede; **sin fila = disponible**). Precio igual en todas las sedes; sin conteo de inventario. Un combo queda
  agotado en una sede si lo está (o se desactivó) alguno de sus componentes.
- **API pública de solo lectura:** `GET /api/menu?branchId=N` y `GET /api/screenings/:id/menu` (menú de la sede de la función; 404 si no existe
  o no se ofrece). Sin sesión, `Cache-Control: no-store`. Solo productos y tamaños activos; los agotados salen con `available: false`.
  Incluye `limits` (`MAX_ITEM_QTY` 10, `MAX_FOOD_UNITS_PER_ORDER` 20, `MAX_FOOD_LINES` 12, en `src/shared/purchase.js`).
- **Ilustraciones:** dibujos SVG propios dentro del código (`src/components/ProductArt.jsx`), elegidos con una clave cerrada (`art_key`);
  sin fotos ni recursos externos, con tokens de color del tema.
- **Semilla** (`server/menuSeed.js`, solo si `products` está vacía): 11 productos (canchita salada y dulce en 3 tamaños, gaseosa, chicha,
  agua, nachos, hot dog, confites y 3 combos) y 3 agotados de ejemplo por sede. `npm run seed` la carga también en una base ya migrada.

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
