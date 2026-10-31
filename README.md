# Plataforma de créditos y servicios

Sistema personal para gestionar clientes, planes, créditos y agenda de producción.
Frontend y funciones en **Cloudflare Pages**, base de datos y login en **Supabase**.

Documentación técnica: [DOCUMENTACION_TECNICA.md](DOCUMENTACION_TECNICA.md).

## Estado actual

Este paso incluye solo la **base de datos y las reglas de créditos**:

- `supabase/migrations/0001_schema.sql`: tablas.
- `supabase/migrations/0002_rls.sql`: políticas de Row Level Security.
- `supabase/migrations/0003_creditos.sql`: funciones de negocio (activación, ampliación, consumo, baja, reactivación, eliminación, vencimientos y avisos).
- `supabase/tests/creditos_test.sql`: pruebas de esas reglas.

Pendiente en los próximos pasos: webhook de Mercado Pago, endpoints del Worker, pantallas de cliente y de administrador, términos y condiciones, agenda, respaldos automáticos.

## Principios

- Ninguna escritura de negocio se hace desde el navegador. Todo pasa por funciones SQL que ejecuta el servidor con la clave `service_role`.
- Cada operación bloquea la fila del cliente (`FOR UPDATE`) y tiene una clave de idempotencia: repetir una acción no duplica movimientos.
- El libro de movimientos (`credit_movements`) no se edita ni se borra. Si algo se rompe, el historial permite reconstruir el saldo.
- Las decisiones sobre clientes (activar, dar de baja, reactivar, eliminar) son manuales. Lo automático se limita a calcular vencimientos y generar avisos.

## Probar en local

Requisitos: Docker, Supabase CLI y `psql`.

```bash
supabase init            # si todavía no existe supabase/config.toml
supabase start
supabase db reset        # aplica las migraciones 0001, 0002 y 0003
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
     -f supabase/tests/creditos_test.sql
```

Si todo está bien, cada prueba imprime `OK ...` y al final `Todas las pruebas de créditos pasaron`. Cualquier falla detiene el script con el mensaje correspondiente.

## Variables de entorno

Copiá `.env.example` a `.env.local` para desarrollo. En Cloudflare Pages cargá las mismas variables en **Settings → Environment variables**.

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
