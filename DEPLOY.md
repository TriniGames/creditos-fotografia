# Cómo desplegar la plataforma

Esta guía sigue el camino más simple: casi todo se hace desde el navegador.
Son cuatro partes: **Supabase** (base de datos y login), **GitHub** (código),
**Cloudflare Pages** (sitio y funciones) y una **prueba final**.

Antes de empezar necesitás cuentas en Supabase, GitHub y Cloudflare.

---

## Parte 1: Supabase

### 1.1 Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) y tocá **New project**.
2. Nombre: `creditos`. Elegí una contraseña de base de datos y guardala en un gestor de contraseñas.
3. **Region: South America (São Paulo)**.
4. Esperá unos minutos a que el proyecto esté listo.

> El plan gratuito sirve para pruebas. Se pausa tras una semana sin actividad y no tiene respaldos. Antes de cargar datos reales, pasá al plan Pro.

### 1.2 Desactivar el registro público

Esto es importante: solo vos debés poder crear usuarios.

1. Menú izquierdo: **Authentication → Sign In / Providers** (o **Providers**).
2. Abrí **Email**.
3. Desactivá **Allow new users to sign up** y guardá.

### 1.3 Crear la base de datos

1. Menú izquierdo: **SQL Editor → New query**.
2. Abrí cada archivo de la carpeta `supabase/migrations/` **en este orden**, copiá todo su contenido, pegalo en el editor y tocá **Run**:
   1. `0001_schema.sql`
   2. `0002_rls.sql`
   3. `0003_creditos.sql`
   4. `0004_clientes.sql`
   5. `0005_circuito.sql`
   6. `0006_abm.sql`
3. Si todo salió bien, cada ejecución termina sin errores.

Opcional, para verificar las reglas: pegá `supabase/tests/creditos_test.sql` en el editor y tocá **Run**. Al final debe aparecer el mensaje *"Todas las pruebas de créditos pasaron"*. El archivo deshace sus cambios, no deja datos de prueba.

### 1.4 Crear tu usuario administrador

1. Menú izquierdo: **Authentication → Users → Add user → Create new user**.
2. Ingresá tu correo y una contraseña fuerte. Marcá **Auto Confirm User**.
3. Copiá el **UUID** del usuario que aparece en la lista.
4. En **SQL Editor**, ejecutá esto reemplazando los datos:

```sql
insert into profiles (id, username, nombre, marca, email, rol)
values (
  'PEGA-ACA-EL-UUID',
  'brian',
  'Brian Trinca',
  'Admin',
  'tu-correo@ejemplo.com',
  'admin'
);
```

Este paso es el único que se hace a mano en la base. Después, todos los clientes se crean desde el panel.

### 1.5 Copiar las claves

1. Menú izquierdo: **Project Settings → API Keys** (en algunas pantallas, **Settings → API**).
2. Guardá estos tres valores; los vas a necesitar en la parte 4:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (es secreta: nunca la pegues en el frontend ni en GitHub)

---

## Parte 2: GitHub

1. Entrá a [github.com](https://github.com) y tocá **New repository**.
2. Nombre: `creditos`. Marcá **Private**. Creá el repositorio.
3. En la página del repositorio, tocá **uploading an existing file** (o **Add file → Upload files**).
4. Arrastrá **todo el contenido** de la carpeta `creditos/`: `src/`, `functions/`, `lib/`, `supabase/`, `admin/`, `cuenta/`, `index.html`, `vite.config.js`, `package.json`, `.gitignore`, `README.md`, `DEPLOY.md` y `.env.example`. No subas `node_modules/` ni `dist/`.
5. No subas ningún archivo `.env`, `.dev.vars` ni con claves reales.
6. Tocá **Commit changes**.

> Si conocés Git, podés hacer `git init`, `git add .`, `git commit` y `git push` desde tu computadora. El resultado es el mismo.

---

## Parte 3: Cloudflare Pages

### 3.1 Conectar el repositorio

1. Entrá a [dash.cloudflare.com](https://dash.cloudflare.com).
2. Menú izquierdo: **Workers & Pages → Create → Pages → Connect to Git**.
3. Autorizá a Cloudflare a leer tu GitHub y elegí el repositorio `creditos`.

### 3.2 Configurar la compilación

Completá estos campos para compilar el frontend y publicar las funciones:

| Campo | Valor |
|---|---|
| Project name | `creditos` (o el que prefieras) |
| Production branch | `main` |
| Framework preset | **None** (Vite se configura con el comando de build) |
| Build command | `npm run build` |
| Build output directory | **`dist`** |

Antes de tocar **Save and Deploy**, pasá al paso 3.3 para cargar las variables. Cloudflare instala las dependencias y ejecuta `npm run build` en su servidor; no hace falta compilar nada en tu computadora.

### 3.3 Cargar las variables de entorno

En el mismo formulario, o después desde **Settings → Environment variables**, agregá:

| Variable | Valor | Tipo |
|---|---|---|
| `SUPABASE_URL` | Project URL de Supabase | Texto |
| `SUPABASE_ANON_KEY` | anon public | Texto |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role | **Encrypt / Secret** |
| `MP_ACCESS_TOKEN` | *(vacío por ahora)* | **Secret** |
| `MP_WEBHOOK_SECRET` | *(vacío por ahora)* | **Secret** |
| `PUBLIC_SITE_URL` | La URL que te dé Cloudflare, por ejemplo `https://creditos.pages.dev` | Texto |

Mercado Pago queda vacío a propósito: el webhook responde 503 hasta que lo conectemos.

Tocá **Save**. Si ya desplegaste, andá a **Deployments** y reintentá el último, o hacé un cambio cualquiera en GitHub para que se redespliegue.

### 3.4 Qué queda desplegado

- `dist/` (generado por `npm run build`) contiene el sitio: `/` (ingreso), `/cuenta/` (cliente) y `/admin/` (administrador), ya compilados en React.
- `functions/` se publica como API en `/api/...`. Cloudflare lo detecta solo porque la carpeta está en la raíz del repositorio, al lado de `dist/`.

---

## Parte 4: Probar

1. Abrí la URL de tu proyecto (por ejemplo `https://creditos.pages.dev`).
2. Ingresá con el usuario `brian` y la contraseña que creaste en Supabase.
3. Deberías caer en `/admin/` y ver el panel.
4. Creá un cliente de prueba desde **Nuevo cliente**.
5. Cerrá sesión, ingresá con ese cliente y verificá que aparezca `/cuenta/` con saldo 0.
6. Volvé al panel y probá el flujo completo: crear plan del mes, registrar pago, aprobar y activar. El cliente debe ver su saldo actualizado.

Si algo falla, revisá la sección de problemas frecuentes.

---

## Parte 5 (opcional): tu propio dominio

Para usar algo como `ventas.briantrinca.com.ar`:

1. En Cloudflare Pages, abrí tu proyecto y andá a **Custom domains → Set up a custom domain**.
2. Escribí el subdominio y seguí las instrucciones.
3. Si el DNS de `briantrinca.com.ar` está en Donweb, Cloudflare te pide crear un registro CNAME allí. Si preferís que Cloudflare administre el DNS, podés mover la zona a Cloudflare (es gratis), pero eso requiere cambiar los servidores de nombres en Donweb.
4. Actualizá `PUBLIC_SITE_URL` con la nueva URL.

---

## Probar en tu computadora (opcional)

Requisitos: Node.js 18 o superior.

```bash
npm install
cp .env.example .dev.vars
# Editá .dev.vars con tus valores de Supabase.
# En ese archivo no uses comentarios al final de la línea.
npm run dev          # compila con Vite y levanta las funciones en http://localhost:8788
# Para trabajar solo en la interfaz (sin API): npm run dev:ui
```

Abrí `http://localhost:8788`. Cada vez que cambies el frontend, `npm run dev` vuelve a compilar. Las funciones de `functions/` corren localmente con el mismo código que en Cloudflare.

---

## Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| El login dice "Usuario o contraseña incorrectos" con datos correctos | Que el perfil exista en la tabla `profiles` con el mismo UUID del usuario de Auth. Que el usuario esté en minúsculas. |
| Al entrar al panel vuelve a la pantalla de ingreso | La cookie no se guardó. Revisá que el sitio esté en HTTPS (Cloudflare lo da por defecto) y que `PUBLIC_SITE_URL` sea la URL real. |
| `/api/...` devuelve 404 | La carpeta `functions/` debe estar en la **raíz** del repositorio, no dentro de `src/` ni `dist/`. |
| `/api/...` devuelve 500 `ERROR_INTERNO` | Mirá los logs en Cloudflare: **Workers & Pages → tu proyecto → Logs** (o *Real-time logs*). Casi siempre es una variable de entorno mal escrita o la service role key incorrecta. |
| Las acciones dan "Ocurrió un error" | Revisá que las migraciones 0001 a 0006 se hayan ejecutado completas. Una migración que falló a la mitad deja funciones faltantes. |
| El cliente no puede iniciar sesión tras eliminarlo | Es el comportamiento esperado: el perfil queda en estado `eliminada` y el login se bloquea. |

---

## Cambios futuros

Cada `git push` a `main` despliega automáticamente una nueva versión. Las migraciones de base de datos **no** se aplican solas: si agregamos una nueva, la ejecutás en el SQL Editor de Supabase igual que en 1.3.

## Antes de usar con clientes reales

- Pasar Supabase al plan Pro y activar respaldos.
- Configurar la copia diaria propia (se agrega en un paso posterior).
- Revisar los términos y condiciones con un abogado.
- Conectar Mercado Pago con credenciales de producción solo después de probar con las de prueba.
