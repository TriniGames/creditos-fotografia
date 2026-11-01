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
