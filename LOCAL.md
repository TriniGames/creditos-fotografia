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

## Avisos de pedidos

Al confirmar un pedido se guarda una notificación en la misma transacción que descuenta los créditos.
El admin tiene una bandeja **Pedidos nuevos**, contador persistente y acceso al detalle.
Con la pestaña visible se buscan pedidos nuevos cada 15 segundos y también al volver a la ventana;
los avisos pendientes se conservan si el panel está cerrado. No es una notificación por correo ni WhatsApp.
**Marcar como revisado** deja constancia del administrador y la fecha, limpia el pendiente y permite
que el cliente vea la revisión. Esta acción no cambia el estado de producción del pedido.

La cuenta del cliente tiene **Resumen**, **Elegir servicios**, **Mis pedidos** y **Movimientos**.
Antes de enviar muestra un resumen para confirmar el descuento. La cuenta se actualiza cada 30 segundos
cuando la pestaña está visible y al volver a ella; no actualiza la selección mientras se está confirmando.
En **Mis pedidos** se distingue recepción de revisión por el equipo.

Para reconstruir **la base local borrando sus datos**:

```powershell
npm run db:reset
npm run db:seed
npm run test:db
```

`db:seed` agrega cuentas y catálogo si faltan; no reinicia contraseñas ni saldos existentes.
El registro público está deshabilitado. Las cuentas se crean desde el servidor mediante Auth Admin.

Pedidos: se distingue **recibido, pendiente de revisión** de **revisado por el administrador**, con fechas. El cliente puede dejar un comentario inicial opcional al confirmar y el admin una respuesta opcional al confirmar la revisión (máximo 2000 caracteres cada uno). No se editan después de enviar ni admiten respuestas sucesivas. La coordinación posterior se realiza por los canales habituales, fuera del panel. Requiere la migración 0008 (en local: `npm run db:migrate`, sin reiniciar datos).

Catálogo: la descripción del servicio se edita en un campo amplio en Administración → Catálogo → Editar servicio. El cliente la despliega con **Ver detalle del servicio**, independientemente de la selección. Admite saltos de línea, sin HTML. La barra superior usa `BarraPanel`, un componente común que permanece separado del contenido de cada vista.

## Capacidad simultánea

Aplicar la migración 0009 con `npm run db:migrate`. En Administración → Capacidad se configura el máximo de créditos pendientes por cliente y del equipo, además de excepciones individuales. Vacío = sin tope, cero = pausa. Los pedidos existentes se conservan aunque se baje el límite. Los pedidos recibidos, agendados y en producción ocupan capacidad; entregados y cancelados no. Revisar no libera capacidad y entregar no devuelve saldo. La acción de entrega completa requiere revisión previa, confirmación explícita y queda auditada. No modifica las fechas de agenda.

El cliente ve su carga y la capacidad disponible antes de pedir. La base revalida los topes con un bloqueo global para pedidos de diferentes clientes y cambios de configuración. Si no hay lugar, rechaza toda la operación sin consumir saldo ni generar avisos. La capacidad del equipo se representa en créditos, como aproximación de carga, sin equivalencia automática con horas.

Prueba transaccional específica: `npm run test:capacidad`. Revierte clientes, pedidos, límites y auditoría de prueba; no deja configurados topes reales. El calendario está solamente planificado en [PLAN_CALENDARIO.md](PLAN_CALENDARIO.md).

## Equipo y servicios contratados

Aplicar `npm run db:migrate` hasta 0011. El rol técnico `admin` existente se presenta como **Superadmin** y mantiene su acceso; no se requiere cambiar su cuenta. Desde **Equipo** crea empleados, modifica su nombre y activa/desactiva su acceso. Los empleados ingresan en la misma pantalla de login y van a `/equipo/`. El superadmin administra asignaciones desde **Trabajos**, puede elegir **Mis trabajos** o usar **Asignarme este servicio**. Desde un pedido, **Gestionar servicio y responsable** abre el trabajo correspondiente.

Cada servicio contratado (`order_items`) tiene responsable, detalle acordado, estado, fecha real de entrega y versión. El detalle se obtiene en reuniones o mensajes externos y es visible para el cliente en su pedido; no es una nota interna ni reemplaza los dos comentarios únicos del pedido o la descripción del catálogo. El empleado asignado y el superadmin pueden editarlo e iniciar producción. Para confirmar entrega, el pedido debe estar revisado y el detalle cargado; la pantalla pide confirmación. Los trabajos entregados quedan de consulta. Las modificaciones y reasignaciones se auditan; un borrador desactualizado no pisa una edición nueva.

El empleado solo consulta y modifica servicios asignados a su cuenta; no accede a pagos, saldos, catálogo administrativo ni asignaciones. Desactivarlo bloquea login, sesiones existentes y lectura directa de trabajos por RLS; sus trabajos se conservan para reasignarlos.

La entrega por servicio libera solo sus créditos de capacidad, sin devolver saldo. El pedido pasa a entregado cuando todos sus servicios lo están. Se conserva la operación anterior de entrega completa para compatibilidad, pero el flujo de trabajo nuevo permite entregas parciales. La agenda con fechas comprometidas continúa sin implementar.

Validación: `npm run test:equipo` verifica altas concurrentes, permisos reales, RLS, reasignación, control de versiones, entregas parciales concurrentes, trabajo del superadmin y bloqueo de empleados inactivos. Crea cuentas temporales y las elimina junto a sus datos.
