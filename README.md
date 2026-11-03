# Plataforma de créditos y servicios

Sistema personal para gestionar clientes, planes, créditos y agenda de producción.
Frontend y funciones en **Cloudflare Pages**, base de datos y login en **Supabase**.

Documentación técnica: [DOCUMENTACION_TECNICA.md](DOCUMENTACION_TECNICA.md).

Entorno local: [LOCAL.md](LOCAL.md). Plan de implementación: [PLAN.md](PLAN.md).

## Estado actual

El circuito disponible incluye:

- Alta y edición de clientes (usuario, nombre y marca), baja con motivo, reactivación y eliminación lógica.
- Catálogo de planes y servicios con edición y desactivación.
- Contratación de plan, registro de pago completo y aprobación manual para acreditar créditos.
- Selección y confirmación de servicios por el cliente, descuento FIFO y consulta de pedidos e historial.
- Avisos de pedidos nuevos, revisión administrativa y panel de cliente con navegación y confirmación.
- Migraciones `0001` a `0009`, reglas SQL, pruebas de concurrencia y permisos con usuarios reales.

Pendientes: integración efectiva de Mercado Pago, aceptación de términos, agenda, recuperación/cambio de credenciales, traslado de créditos y respaldos automáticos. Ver [PLAN.md](PLAN.md).

## Principios

- Ninguna escritura de negocio se hace desde el navegador. Todo pasa por funciones SQL que ejecuta el servidor con la clave `service_role`.
- Cada operación bloquea la fila del cliente (`FOR UPDATE`) y tiene una clave de idempotencia: repetir una acción no duplica movimientos.
- El libro de movimientos (`credit_movements`) no se edita ni se borra. Si algo se rompe, el historial permite reconstruir el saldo.
- Las decisiones sobre clientes (activar, dar de baja, reactivar, eliminar) son manuales. Lo automático se limita a calcular vencimientos y generar avisos.

## Probar en local

Requisitos: Node.js y Docker Desktop iniciado. La CLI y el cliente PostgreSQL se instalan con npm.

```powershell
npm install
npm run db:start
npm run local:env
npm run db:seed
npm run test:db
npm run dev
```

Si todo está bien, cada prueba imprime `OK ...` y al final `Todas las pruebas de créditos pasaron`. Cualquier falla detiene el script con el mensaje correspondiente.

## Variables de entorno

Para desarrollo local, `npm run local:env` crea `.dev.vars` con las claves de Supabase local. En Cloudflare Pages cargá las variables del proyecto de producción en **Settings → Environment variables**.

- `SUPABASE_SERVICE_ROLE_KEY` y `MP_ACCESS_TOKEN` son secretos: solo en el servidor (Cloudflare), nunca en el frontend ni en el repositorio.
- `SUPABASE_ANON_KEY` puede ir en el frontend porque RLS limita lo que expone.

## Despliegue en Cloudflare Pages

1. Subí el repositorio a GitHub o GitLab.
2. En Cloudflare, creá un proyecto de Pages conectado al repositorio.
3. Cargá las variables de entorno del entorno de producción.
4. Las funciones del backend viven en la carpeta `functions/` y se despliegan junto con el sitio.

## Respaldos

Lo recomendado antes de usar datos reales:

- Plan Pro de Supabase, que incluye respaldos diarios. El plan gratuito no garantiza respaldos.
- Copia diaria propia con `pg_dump` guardada en Cloudflare R2 (se agrega en un paso posterior).
- Prueba de restauración mensual en un proyecto de prueba.

## Automatización opcional de vencimientos

Los vencimientos de saldo pueden correr todos los días con `pg_cron` (plan Pro de Supabase o local):

```sql
select cron.schedule('vencer-creditos', '5 3 * * *', $$select vencer_creditos()$$);
select cron.schedule('generar-avisos', '*/30 * * * *', $$select generar_avisos()$$);
```

Ambos son idempotentes: correrlos varias veces no duplica movimientos ni avisos.

## Pendientes conocidos

- Traslado de hasta 1.000 créditos al período siguiente (no trasladables de nuevo). Se modela en la próxima migración.
- Revisión legal de términos y condiciones antes de publicarlos.
- Al eliminar una cuenta, el bloqueo de acceso también debe aplicarse en Supabase Auth (el Worker lo hará al implementar el login).

Pedidos: se distingue **recibido, pendiente de revisión** de **revisado por el administrador**, con fechas. El cliente puede dejar un comentario inicial opcional al confirmar y el admin una respuesta opcional al confirmar la revisión (máximo 2000 caracteres cada uno). No se editan después de enviar ni admiten respuestas sucesivas. La coordinación posterior se realiza por los canales habituales, fuera del panel. Requiere la migración 0008 (en local: `npm run db:migrate`, sin reiniciar datos).

Catálogo: la descripción del servicio se edita en un campo amplio en Administración → Catálogo → Editar servicio. El cliente la despliega con **Ver detalle del servicio**, independientemente de la selección. Admite saltos de línea, sin HTML. La barra superior usa `BarraPanel`, un componente común que permanece separado del contenido de cada vista.

Topes de trabajo pendiente: Administración → Capacidad. Permite un máximo general por cliente, excepciones individuales y máximo simultáneo del equipo; sin valores prefijados. Verificación: `npm run test:capacidad`. Calendario por servicio: [plan sin implementar](PLAN_CALENDARIO.md).
