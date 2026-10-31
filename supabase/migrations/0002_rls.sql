-- 0002: Row Level Security.
-- El navegador usa solo la anon key. Sin políticas de escritura, un cliente
-- no puede modificar saldos ni estados aunque tenga sesión válida.

create or replace function es_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = p_uid and rol = 'admin');
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'terms_versions', 'terms_acceptances', 'plans', 'services',
    'monthly_plans', 'payments', 'credit_lots', 'credit_movements',
    'service_orders', 'order_items', 'schedule_events', 'admin_audit',
    'admin_notifications', 'operaciones_idempotentes'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy profiles_lectura on profiles for select
  using (id = auth.uid() or es_admin(auth.uid()));

create policy terms_versiones_lectura on terms_versions for select
  using (true);

create policy terms_aceptadas_lectura on terms_acceptances for select
  using (profile_id = auth.uid() or es_admin(auth.uid()));

create policy planes_lectura on plans for select
  using (activo or es_admin(auth.uid()));

create policy servicios_lectura on services for select
  using (activo or es_admin(auth.uid()));

create policy planes_mensuales_lectura on monthly_plans for select
  using (profile_id = auth.uid() or es_admin(auth.uid()));

create policy pagos_lectura on payments for select
  using (profile_id = auth.uid() or es_admin(auth.uid()));

create policy lotes_lectura on credit_lots for select
  using (profile_id = auth.uid() or es_admin(auth.uid()));

create policy movimientos_lectura on credit_movements for select
  using (profile_id = auth.uid() or es_admin(auth.uid()));

create policy pedidos_lectura on service_orders for select
  using (profile_id = auth.uid() or es_admin(auth.uid()));

create policy pedido_items_lectura on order_items for select
  using (exists (
    select 1 from service_orders o
    where o.id = order_items.order_id
      and (o.profile_id = auth.uid() or es_admin(auth.uid()))
  ));

create policy agenda_lectura on schedule_events for select
  using (exists (
    select 1 from service_orders o
    where o.id = schedule_events.order_id
      and (o.profile_id = auth.uid() or es_admin(auth.uid()))
  ));

create policy auditoria_solo_admin on admin_audit for select
  using (es_admin(auth.uid()));

create policy notificaciones_solo_admin on admin_notifications for select
  using (es_admin(auth.uid()));

-- operaciones_idempotentes no tiene políticas: solo accede el servidor.
