# Plan de implementación

## 1. Entorno local reproducible (implementado y verificado por API)

- Configurar Supabase local con Docker, registro público deshabilitado y datos de ejemplo.
- Generar `.dev.vars` con claves exclusivamente locales, sin sobrescribir configuraciones existentes.
- Ejecutar las cuatro migraciones y las pruebas SQL; verificar login de administrador y cliente.
- Documentar instalación, arranque, parada y reinicio de datos.

Verificado: build, cuatro migraciones, pruebas SQL existentes, login de ambos roles,
lectura de sus paneles por HTTP y rechazo de acceso administrativo para clientes.
Se corrigió la relación ambigua de pagos con perfiles que bloqueaba el resumen administrativo.
Verificado también el ingreso y la navegación de ambos paneles en navegador.

## 2. Integridad y errores del circuito actual

- Actualizar Vite y su plugin de React: npm audit detectó avisos en Vite 5 y esbuild (uno alto y uno moderado).
- [x] Corregir el formulario de alta que usa currentTarget después de await.
- [x] Bloquear envíos mientras están pendientes y conservar claves en reintentos de transporte.
- [x] Serializar operaciones por clave y cliente, rechazar reutilización con otros datos y recuperar altas interrumpidas entre Auth y profiles.
- [x] Validar importe completo del plan; no se admiten pagos parciales en este circuito.
- [x] Resolver selección de plan vigente y cierre de ciclos antiguos al activar el siguiente.
- [x] Probar permisos RLS con tokens reales e idempotencia con solicitudes HTTP concurrentes.
- [x] Alta, modificación de usuario/nombre/marca, baja, reactivación y eliminación lógica de clientes con auditoría.

## 3. Completar el circuito del cliente

- [x] Administrar catálogo de planes y servicios: alta, edición y desactivación conservando contratos anteriores.
- [x] Mostrar servicios disponibles, seleccionar y confirmar pedidos mediante API autenticada.
- [x] Probar saldo insuficiente, plazo vencido, FIFO, reintentos y acceso entre clientes.
- [x] Mostrar pedidos al cliente y al administrador, además del historial de movimientos.
- [x] Notificación persistente por pedido, contador de pendientes y revisión administrativa visible para el cliente.
- [x] Unificar el panel del cliente con navegación, tarjetas de resumen, confirmación y tablas compartidas.
- [ ] Registrar aceptación de términos.

Validación reproducible: `npm run build`, `npm run test:db`, `npm run test:local` y `npm run test:circuito`.
La prueba de circuito crea datos temporales y los elimina al terminar, sin alterar las cuentas de ejemplo.

## 4. Operación y producción

- Agenda y estados de producción/entrega.
- Resolver traslado de créditos y reglas de renovación/reactivación.
- Renovación de sesión, cambio de contraseña y recuperación de acceso.
- Integrar Mercado Pago en entorno de prueba manteniendo aprobación manual.
- Automatizar vencimientos, respaldos y prueba de restauración.
- Agregar CI con build y pruebas de base de datos.

Cada etapa se considera terminada al verificar su comportamiento. El build por sí solo no valida reglas SQL ni login.

Pedidos: se distingue **recibido, pendiente de revisión** de **revisado por el administrador**, con fechas. El cliente puede dejar un comentario inicial opcional al confirmar y el admin una respuesta opcional al confirmar la revisión (máximo 2000 caracteres cada uno). No se editan después de enviar ni admiten respuestas sucesivas. La coordinación posterior se realiza por los canales habituales, fuera del panel. Requiere la migración 0008 (en local: `npm run db:migrate`, sin reiniciar datos).

Catálogo: la descripción del servicio se edita en un campo amplio en Administración → Catálogo → Editar servicio. El cliente la despliega con **Ver detalle del servicio**, independientemente de la selección. Admite saltos de línea, sin HTML. La barra superior usa `BarraPanel`, un componente común que permanece separado del contenido de cada vista.

## Capacidad simultánea (implementada)

- [x] Topes generales por cliente y del equipo, configurables desde administración, con excepciones por cliente.
- [x] Validación transaccional común entre clientes, idempotencia y visibilidad antes de confirmar pedidos.
- [x] Entrega completa auditada para liberar capacidad sin cambiar saldo.
- [x] Prueba de topes, bloqueo global, rechazos sin efectos, excepciones, entrega y permisos: `npm run test:capacidad`.
- [ ] Calendario por servicio: **solo planificación**, ver [PLAN_CALENDARIO.md](PLAN_CALENDARIO.md).

## Equipo y responsables (implementado)

- [x] Panel de empleados separado y acceso según rol validado por el servidor.
- [x] Alta recuperable y desactivación de empleados desde superadministración.
- [x] Asignación y reasignación por servicio contratado, incluido el propio superadmin.
- [x] Detalle acordado editable por el responsable y superadmin, visible para el cliente y auditado.
- [x] Entregas por servicio con liberación parcial de capacidad y cierre del pedido al completar todos.
- [x] Control de versiones, aislamiento de empleados y prueba `npm run test:equipo`.
- [ ] Calendario de fechas comprometidas: sigue solamente planificado.
