-- 0001: esquema base.
-- Regla general: el cliente nunca escribe directamente. Todas las escrituras
-- de negocio pasan por funciones SQL (0003) ejecutadas desde el servidor.

create extension if not exists pgcrypto;

create table terms_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  texto text not null,
  publicada_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  username text not null unique check (username ~ '^[a-z0-9_.-]{3,30}$'),
  nombre text not null,
  marca text not null,
  email text not null,
  rol text not null default 'cliente' check (rol in ('cliente', 'admin')),
  estado text not null default 'sin_creditos' check (
    estado in ('sin_creditos', 'activa', 'dada_de_baja', 'eliminada')
  ),
  -- Plazo para elegir servicios: empieza al activar (48 h) o reactivar (24 h).
  plazo_inicio timestamptz,
  plazo_horas int check (plazo_horas in (24, 48)),
  created_at timestamptz not null default now()
);

create table terms_acceptances (
  profile_id uuid not null references profiles(id),
  terms_version_id uuid not null references terms_versions(id),
  aceptado_at timestamptz not null default now(),
  primary key (profile_id, terms_version_id)
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio_ars numeric(12,2) not null check (precio_ars > 0),
  creditos int not null check (creditos > 0),
  activo boolean not null default true
);

create table services (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  costo_creditos int not null check (costo_creditos > 0),
  activo boolean not null default true
);

-- Un plan por cliente y por mes calendario de compra.
create table monthly_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  plan_id uuid references plans(id),
  periodo text not null,                 -- 'YYYY-MM'
  precio_ars numeric(12,2) not null,     -- copia al momento de la compra
  creditos int not null check (creditos > 0),
  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago', 'activo', 'cerrado')),
  ciclo_inicio timestamptz,
  ciclo_fin timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, periodo)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  monthly_plan_id uuid references monthly_plans(id),
  monto numeric(12,2) not null check (monto > 0),
  metodo text not null check (metodo in ('mercado_pago', 'transferencia')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  mp_payment_id text unique,
  comprobante_url text,
  revisado_por uuid references profiles(id),
  revisado_at timestamptz,
  created_at timestamptz not null default now()
);

-- Cada acreditación crea un lote. El saldo es la suma de lotes vigentes.
create table credit_lots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  origen text not null check (origen in ('plan', 'ampliacion', 'reactivacion', 'ajuste')),
  cantidad_inicial int not null check (cantidad_inicial > 0),
  cantidad_restante int not null check (cantidad_restante >= 0),
  ciclo_fin timestamptz not null,
  gracia_hasta timestamptz not null,     -- ciclo_fin + 72 h
  estado text not null default 'vigente' check (estado in ('vigente', 'agotado', 'vencido', 'perdido')),
  created_at timestamptz not null default now(),
  check (cantidad_restante <= cantidad_inicial)
);
create index credit_lots_saldo_idx on credit_lots (profile_id, estado, gracia_hasta);

-- Libro de solo escritura. cantidad con signo: + entra, - sale.
create table credit_movements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  lot_id uuid references credit_lots(id),
  tipo text not null check (tipo in (
    'acreditacion', 'ampliacion', 'consumo', 'vencimiento', 'perdida', 'devolucion', 'ajuste'
  )),
  cantidad int not null check (cantidad <> 0),
  motivo text not null check (length(btrim(motivo)) >= 3),
  autor uuid references profiles(id),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index credit_movements_profile_idx on credit_movements (profile_id, created_at);

create table service_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  estado text not null default 'seleccionado'
    check (estado in ('seleccionado', 'agendado', 'en_produccion', 'entregado', 'cancelado')),
  total_creditos int not null check (total_creditos > 0),
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references service_orders(id) on delete cascade,
  service_id uuid not null references services(id),
  nombre text not null,                  -- copia al momento de la compra
  costo_creditos int not null check (costo_creditos > 0)
);

create table schedule_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references service_orders(id),
  tipo text not null check (tipo in ('rodaje', 'postproduccion', 'entrega')),
  fecha timestamptz not null,
  notas text,
  created_at timestamptz not null default now()
);

create table admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references profiles(id),
  accion text not null,
  entidad text not null,
  entidad_id text,
  detalle jsonb not null default '{}',
  motivo text,
  created_at timestamptz not null default now()
);

-- Avisos para el panel. La clave única evita avisos duplicados.
create table admin_notifications (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  tipo text not null,
  profile_id uuid references profiles(id),
  mensaje text not null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

-- Guarda el resultado de operaciones ya ejecutadas (idempotencia).
create table operaciones_idempotentes (
  clave text primary key,
  resultado jsonb not null,
  created_at timestamptz not null default now()
);
