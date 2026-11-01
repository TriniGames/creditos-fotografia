# Desarrollo local en Windows

Requisitos: Node.js y Docker Desktop iniciado con contenedores Linux.
La base, Auth y la API REST se ejecutan localmente; no hace falta vincular un proyecto remoto.

## Primera ejecución

```powershell
npm install
npm run db:start
npm run local:env
npm run db:seed
npm run test:db
npm run dev
```

`db:start` descarga imágenes la primera vez y aplica las migraciones al crear la base.
`local:env` crea `.dev.vars` con las claves locales, sin sobrescribir un archivo existente.
Si ya tenés `.dev.vars`, guardá tu configuración anterior y revisá las claves con `npm run db:status`.
No publiques las claves ni uses credenciales de producción en este entorno.

Sitio: http://localhost:8788. Supabase Studio: http://127.0.0.1:54323.

Usuarios iniciales: `admin_local` y `cliente_local`. Contraseña: `SoloLocal-12345!`.
Son cuentas de ejemplo exclusivamente locales. El cliente empieza sin saldo; desde el administrador
podés crear su plan, registrar un pago y aprobarlo para activar los créditos.
El catálogo contiene un plan de 4875 créditos y dos servicios.

## Uso diario

```powershell
npm run db:start
npm run db:migrate
npm run dev
```

La interfaz se compila al iniciar `dev`. Por ahora reiniciá ese comando si cambiás React.
`dev:ui` permite trabajar en Vite, pero no ejecuta las funciones de la API.
Para detener el sitio usá Ctrl+C. `npm run db:stop` detiene Supabase conservando los datos.

## Pruebas y reinicio

`npm run test:db` ejecuta las pruebas SQL y falla si encuentra un error. Usa una transacción
con rollback, sin depender de tener psql instalado. No reemplaza pruebas de concurrencia ni de login.

Con `npm run dev` activo, `npm run test:local` verifica los logins de ejemplo, el acceso a las API
de cada panel y el rechazo de peticiones anónimas, contraseñas incorrectas y clientes en la API administrativa.
Esta comprobación usa HTTP; la cookie en un navegador se debe verificar también manualmente.

`npm run test:circuito` prueba alta y edición de un cliente, catálogo, plan, pago, activación,
pedido, ampliación, baja, reactivación y eliminación. Verifica reintentos concurrentes y permisos RLS;
usa datos temporales propios y los elimina al terminar. Requiere Supabase y la app local activos.

## Recorrido manual

1. Ingresá como `admin_local` y cargá o editá planes y servicios desde **Catálogo**.
2. Creá un cliente; sus credenciales le permiten iniciar sesión inmediatamente, con saldo cero.
3. En **Clientes → Editar**, podés cambiar usuario, nombre y marca. El correo de acceso no se edita en este circuito.
4. Creá su plan mensual, seleccioná el plan pendiente y registrá el pago por el importe completo.
5. En pagos pendientes, aprobá y activá. Se acreditan los créditos y comienza el plazo de 48 horas.
6. Ingresá con el cliente, elegí servicios y confirmá el pedido. Aparece en ambos paneles y se descuenta el saldo.
7. Como administrador podés ampliar créditos, dar de baja con motivo y reactivar con devolución opcional y plazo de 24 horas.
8. **Eliminar** conserva el historial y bloquea el acceso, incluidas las sesiones existentes. No permite reactivación.

Para reconstruir **la base local borrando sus datos**:

```powershell
npm run db:reset
npm run db:seed
npm run test:db
```

`db:seed` agrega cuentas y catálogo si faltan; no reinicia contraseñas ni saldos existentes.
El registro público está deshabilitado. Las cuentas se crean desde el servidor mediante Auth Admin.
