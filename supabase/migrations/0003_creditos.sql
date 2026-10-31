-- 0003: reglas de créditos.
-- Principios:
--  * Cada operación bloquea la fila del cliente (FOR UPDATE): dos operaciones
--    sobre el mismo cliente se ejecutan una detrás de otra, nunca en paralelo.
--  * Cada operación tiene una clave de idempotencia. Repetirla devuelve el
--    resultado original y no duplica movimientos.
--  * Nada cambia de estado por decisión automática, salvo los vencimientos de
--    saldo (cálculo) y los avisos (solo generan notificaciones).

-- ===== Helpers =====

create or replace function _requiere_admin(p_actor uuid) returns void
language plpgsql set search_path = public as $$
begin
  if p_actor is null or not es_admin(p_actor) then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
end $$;

create or replace function _requiere_motivo(p_motivo text) returns void
language plpgsql as $$
begin
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'MOTIVO_REQUERIDO';
  end if;
end $$;

create or replace function _op_previa(p_clave text) returns jsonb
language sql stable set search_path = public as $$
  select resultado from operaciones_idempotentes where clave = p_clave;
$$;

create or replace function _guardar_op(p_clave text, p_resultado jsonb) returns jsonb
language plpgsql set search_path = public as $$
begin
  insert into operaciones_idempotentes (clave, resultado) values (p_clave, p_resultado);
  return p_resultado;
end $$;

create or replace function _auditar(
  p_actor uuid, p_accion text, p_entidad text, p_entidad_id text,
  p_motivo text, p_detalle jsonb default '{}'
) returns void
language plpgsql set search_path = public as $$
begin
  insert into admin_audit (actor, accion, entidad, entidad_id, motivo, detalle)
  values (p_actor, p_accion, p_entidad, p_entidad_id, p_motivo, p_detalle);
end $$;

-- Saldo utilizable: lotes vigentes dentro de su ventana de gracia.
create or replace function saldo_cliente(p_profile uuid) returns int
language sql stable set search_path = public as $$
  select coalesce(sum(cantidad_restante), 0)::int
  from credit_lots
  where profile_id = p_profile
    and estado = 'vigente'
    and gracia_hasta > now();
$$;

-- Pierde todo el saldo vigente, lote por lote, con movimiento y motivo.
create or replace function _perder_saldo(p_actor uuid, p_profile uuid, p_motivo text) returns int
language plpgsql set search_path = public as $$
declare
  r record;
  v_total int := 0;
begin
  for r in
    select id, cantidad_restante from credit_lots
    where profile_id = p_profile and estado = 'vigente' and cantidad_restante > 0
    for update
  loop
    insert into credit_movements (profile_id, lot_id, tipo, cantidad, motivo, autor, idempotency_key)
    values (p_profile, r.id, 'perdida', -r.cantidad_restante, p_motivo, p_actor, 'perdida:' || r.id::text);

    update credit_lots set cantidad_restante = 0, estado = 'perdido' where id = r.id;
    v_total := v_total + r.cantidad_restante;
  end loop;
  return v_total;
end $$;

-- ===== Plan mensual y pagos =====

-- Crea el plan mensual del cliente en estado pendiente de pago.
create or replace function crear_plan_mensual(p_actor uuid, p_profile uuid, p_plan uuid, p_idem text)
returns uuid
language plpgsql set search_path = public as $$
declare
  v_clave text := 'crear_plan:' || p_idem;
  v_prev jsonb;
  v_plan plans;
  v_prof profiles;
  v_id uuid;
begin
  perform _requiere_admin(p_actor);
  v_prev := _op_previa(v_clave);
  if v_prev is not null then
    return (v_prev->>'monthly_plan_id')::uuid;
  end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found then raise exception 'CLIENTE_INEXISTENTE'; end if;
  if v_prof.estado in ('dada_de_baja', 'eliminada') then
    raise exception 'ESTADO_INVALIDO: %', v_prof.estado;
  end if;

  select * into v_plan from plans where id = p_plan and activo;
  if not found then raise exception 'PLAN_INVALIDO'; end if;

  begin
    insert into monthly_plans (profile_id, plan_id, periodo, precio_ars, creditos)
    values (
      p_profile, p_plan,
      to_char(now() at time zone 'America/Argentina/Mendoza', 'YYYY-MM'),
      v_plan.precio_ars, v_plan.creditos
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'PLAN_DEL_MES_YA_EXISTE';
  end;

  perform _auditar(p_actor, 'crear_plan_mensual', 'monthly_plans', v_id::text,
                   'Alta de plan mensual', jsonb_build_object('plan', v_plan.nombre));
  perform _guardar_op(v_clave, jsonb_build_object('monthly_plan_id', v_id));
  return v_id;
end $$;

-- Registra un pago pendiente (transferencia o Mercado Pago cargado por el admin).
create or replace function registrar_pago(
  p_actor uuid, p_profile uuid, p_monthly_plan uuid, p_monto numeric,
  p_metodo text, p_mp_payment_id text, p_comprobante text, p_idem text
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_clave text := 'registrar_pago:' || p_idem;
  v_prev jsonb;
  v_id uuid;
begin
  perform _requiere_admin(p_actor);
  v_prev := _op_previa(v_clave);
  if v_prev is not null then
    return (v_prev->>'payment_id')::uuid;
  end if;

  if not exists (
    select 1 from monthly_plans
    where id = p_monthly_plan and profile_id = p_profile and estado = 'pendiente_pago'
  ) then
    raise exception 'PLAN_NO_PENDIENTE';
  end if;

  insert into payments (profile_id, monthly_plan_id, monto, metodo, mp_payment_id, comprobante_url)
  values (p_profile, p_monthly_plan, p_monto, p_metodo, p_mp_payment_id, p_comprobante)
  returning id into v_id;

  insert into admin_notifications (clave, tipo, profile_id, mensaje)
  values ('pago:' || v_id::text, 'pago_registrado', p_profile,
          'Pago registrado, pendiente de aprobación');

  perform _guardar_op(v_clave, jsonb_build_object('payment_id', v_id));
  return v_id;
end $$;

-- Aprueba el pago y activa la cuenta: acredita créditos y arranca el plazo de 48 h.
create or replace function aprobar_pago_y_activar(p_actor uuid, p_payment uuid, p_idem text)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_clave text := 'activar:' || p_idem;
  v_prev jsonb;
  v_pay payments;
  v_mp monthly_plans;
  v_prof profiles;
  v_fin timestamptz := now() + interval '30 days';
  v_lot uuid;
  v_res jsonb;
begin
  perform _requiere_admin(p_actor);
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  select * into v_pay from payments where id = p_payment for update;
  if not found or v_pay.estado <> 'pendiente' then
    raise exception 'PAGO_NO_PENDIENTE';
  end if;

  select * into v_mp from monthly_plans where id = v_pay.monthly_plan_id for update;
  if v_mp.estado <> 'pendiente_pago' then raise exception 'PLAN_NO_PENDIENTE'; end if;

  select * into v_prof from profiles where id = v_pay.profile_id for update;
  if v_prof.estado not in ('sin_creditos', 'activa') then
    raise exception 'ESTADO_INVALIDO: %', v_prof.estado;
  end if;

  if exists (
    select 1 from monthly_plans
    where profile_id = v_prof.id and estado = 'activo' and ciclo_fin > now()
  ) then
    raise exception 'CICLO_EN_CURSO';
  end if;

  update payments set estado = 'aprobado', revisado_por = p_actor, revisado_at = now()
  where id = v_pay.id;

  update monthly_plans set estado = 'activo', ciclo_inicio = now(), ciclo_fin = v_fin
  where id = v_mp.id;

  insert into credit_lots (profile_id, origen, cantidad_inicial, cantidad_restante, ciclo_fin, gracia_hasta)
  values (v_prof.id, 'plan', v_mp.creditos, v_mp.creditos, v_fin, v_fin + interval '72 hours')
  returning id into v_lot;

  insert into credit_movements (profile_id, lot_id, tipo, cantidad, motivo, autor, idempotency_key)
  values (v_prof.id, v_lot, 'acreditacion', v_mp.creditos,
          'Acreditación plan ' || v_mp.periodo, p_actor, 'acred:' || v_pay.id::text);

  update profiles set estado = 'activa', plazo_inicio = now(), plazo_horas = 48
  where id = v_prof.id;

  perform _auditar(p_actor, 'activar_cuenta', 'profiles', v_prof.id::text,
                   'Activación con plan ' || v_mp.periodo,
                   jsonb_build_object('creditos', v_mp.creditos, 'pago', v_pay.id));

  v_res := jsonb_build_object('lot_id', v_lot, 'ciclo_fin', v_fin);
  return _guardar_op(v_clave, v_res);
end $$;

-- ===== Ampliación manual =====

-- Suma créditos al ciclo activo (cuando el cliente abona un complemento).
create or replace function agregar_creditos(
  p_actor uuid, p_profile uuid, p_creditos int, p_motivo text, p_idem text
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_clave text := 'ampliacion:' || p_idem;
  v_prev jsonb;
  v_prof profiles;
  v_mp monthly_plans;
  v_lot uuid;
begin
  perform _requiere_admin(p_actor);
  perform _requiere_motivo(p_motivo);
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return (v_prev->>'lot_id')::uuid; end if;

  if p_creditos is null or p_creditos <= 0 then raise exception 'CANTIDAD_INVALIDA'; end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.estado <> 'activa' then raise exception 'ESTADO_INVALIDO'; end if;

  select * into v_mp from monthly_plans
  where profile_id = p_profile and estado = 'activo' and ciclo_fin > now();
  if not found then raise exception 'SIN_CICLO_ACTIVO'; end if;

  insert into credit_lots (profile_id, origen, cantidad_inicial, cantidad_restante, ciclo_fin, gracia_hasta)
  values (p_profile, 'ampliacion', p_creditos, p_creditos, v_mp.ciclo_fin, v_mp.ciclo_fin + interval '72 hours')
  returning id into v_lot;

  insert into credit_movements (profile_id, lot_id, tipo, cantidad, motivo, autor, idempotency_key)
  values (p_profile, v_lot, 'ampliacion', p_creditos, p_motivo, p_actor, 'amp:' || v_lot::text);

  perform _auditar(p_actor, 'ampliar_creditos', 'profiles', p_profile::text, p_motivo,
                   jsonb_build_object('creditos', p_creditos));
  perform _guardar_op(v_clave, jsonb_build_object('lot_id', v_lot));
  return v_lot;
end $$;

-- ===== Consumo del cliente =====

-- Confirma el carrito: valida plazo y saldo, descuenta primero los lotes que vencen antes.
create or replace function confirmar_pedido(p_profile uuid, p_servicios uuid[], p_idem text)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_clave text := 'pedido:' || p_idem;
  v_prev jsonb;
  v_prof profiles;
  v_total int;
  v_cant int;
  v_order uuid;
  v_pendiente int;
  v_tomar int;
  r record;
begin
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  if p_servicios is null or cardinality(p_servicios) = 0 then
    raise exception 'PEDIDO_VACIO';
  end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.estado <> 'activa' then raise exception 'ESTADO_INVALIDO'; end if;

  if now() > v_prof.plazo_inicio + make_interval(hours => v_prof.plazo_horas) then
    raise exception 'PLAZO_VENCIDO';
  end if;

  select count(*), coalesce(sum(costo_creditos), 0)
    into v_cant, v_total
  from services
  where id = any(p_servicios) and activo;

  if v_cant <> cardinality(p_servicios) then raise exception 'SERVICIO_INVALIDO'; end if;
  if v_total > saldo_cliente(p_profile) then raise exception 'SALDO_INSUFICIENTE'; end if;

  insert into service_orders (profile_id, total_creditos)
  values (p_profile, v_total)
  returning id into v_order;

  insert into order_items (order_id, service_id, nombre, costo_creditos)
  select v_order, s.id, s.nombre, s.costo_creditos
  from services s
  where s.id = any(p_servicios);

  v_pendiente := v_total;
  for r in
    select id, cantidad_restante from credit_lots
    where profile_id = p_profile
      and estado = 'vigente'
      and gracia_hasta > now()
      and cantidad_restante > 0
    order by gracia_hasta asc, created_at asc
    for update
  loop
    exit when v_pendiente = 0;
    v_tomar := least(r.cantidad_restante, v_pendiente);

    update credit_lots
    set cantidad_restante = cantidad_restante - v_tomar,
        estado = case when cantidad_restante - v_tomar = 0 then 'agotado' else estado end
    where id = r.id;

    insert into credit_movements (profile_id, lot_id, tipo, cantidad, motivo, idempotency_key)
    values (p_profile, r.id, 'consumo', -v_tomar,
            'Pedido ' || v_order::text,
            'consumo:' || v_order::text || ':' || r.id::text);

    v_pendiente := v_pendiente - v_tomar;
  end loop;

  if v_pendiente <> 0 then raise exception 'SALDO_INSUFICIENTE'; end if;

  return _guardar_op(v_clave, jsonb_build_object('order_id', v_order, 'total_creditos', v_total));
end $$;

-- ===== Baja, reactivación y eliminación (manuales) =====

create or replace function dar_de_baja(p_actor uuid, p_profile uuid, p_motivo text, p_idem text)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_clave text := 'baja:' || p_idem;
  v_prev jsonb;
  v_prof profiles;
  v_perdidos int;
begin
  perform _requiere_admin(p_actor);
  perform _requiere_motivo(p_motivo);
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.estado <> 'activa' then raise exception 'ESTADO_INVALIDO'; end if;

  v_perdidos := _perder_saldo(p_actor, p_profile, 'Baja: ' || p_motivo);

  update monthly_plans set estado = 'cerrado' where profile_id = p_profile and estado = 'activo';
  update profiles set estado = 'dada_de_baja' where id = p_profile;

  perform _auditar(p_actor, 'dar_de_baja', 'profiles', p_profile::text, p_motivo,
                   jsonb_build_object('creditos_perdidos', v_perdidos));
  return _guardar_op(v_clave, jsonb_build_object('creditos_perdidos', v_perdidos));
end $$;

-- Reactiva con plazo de 24 h. Puede devolver créditos perdidos (decisión del admin).
create or replace function reactivar(p_actor uuid, p_profile uuid, p_devolver int, p_motivo text, p_idem text)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_clave text := 'reactivar:' || p_idem;
  v_prev jsonb;
  v_prof profiles;
  v_disponible int;
  v_lot uuid;
  v_fin timestamptz := now() + interval '30 days';
begin
  perform _requiere_admin(p_actor);
  perform _requiere_motivo(p_motivo);
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.estado <> 'dada_de_baja' then raise exception 'ESTADO_INVALIDO'; end if;

  select coalesce(sum(-cantidad) filter (where tipo = 'perdida'), 0)
       - coalesce(sum(cantidad)  filter (where tipo = 'devolucion'), 0)
    into v_disponible
  from credit_movements
  where profile_id = p_profile;

  if p_devolver is null or p_devolver < 0 or p_devolver > v_disponible then
    raise exception 'DEVOLUCION_INVALIDA: disponible %', v_disponible;
  end if;

  update profiles set estado = 'activa', plazo_inicio = now(), plazo_horas = 24
  where id = p_profile;

  if p_devolver > 0 then
    insert into credit_lots (profile_id, origen, cantidad_inicial, cantidad_restante, ciclo_fin, gracia_hasta)
    values (p_profile, 'reactivacion', p_devolver, p_devolver, v_fin, v_fin + interval '72 hours')
    returning id into v_lot;

    insert into credit_movements (profile_id, lot_id, tipo, cantidad, motivo, autor, idempotency_key)
    values (p_profile, v_lot, 'devolucion', p_devolver, p_motivo, p_actor, 'dev:' || v_lot::text);
  end if;

  perform _auditar(p_actor, 'reactivar', 'profiles', p_profile::text, p_motivo,
                   jsonb_build_object('creditos_devueltos', p_devolver));
  return _guardar_op(v_clave, jsonb_build_object('creditos_devueltos', p_devolver));
end $$;

-- Elimina la cuenta. El historial se conserva; el acceso queda bloqueado.
create or replace function eliminar_cuenta(p_actor uuid, p_profile uuid, p_motivo text, p_idem text)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_clave text := 'eliminar:' || p_idem;
  v_prev jsonb;
  v_prof profiles;
  v_perdidos int;
begin
  perform _requiere_admin(p_actor);
  perform _requiere_motivo(p_motivo);
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.estado = 'eliminada' then raise exception 'ESTADO_INVALIDO'; end if;

  v_perdidos := _perder_saldo(p_actor, p_profile, 'Eliminación de cuenta: ' || p_motivo);

  update monthly_plans set estado = 'cerrado' where profile_id = p_profile and estado = 'activo';
  update profiles set estado = 'eliminada' where id = p_profile;

  perform _auditar(p_actor, 'eliminar_cuenta', 'profiles', p_profile::text, p_motivo,
                   jsonb_build_object('creditos_perdidos', v_perdidos));
  return _guardar_op(v_clave, jsonb_build_object('creditos_perdidos', v_perdidos));
end $$;

-- ===== Procesos de cálculo y avisos (no cambian decisiones sobre clientes) =====

-- Vence lotes cuya ventana de gracia terminó. Idempotente: una corrida repetida no hace nada.
create or replace function vencer_creditos() returns int
language plpgsql set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, profile_id, cantidad_restante from credit_lots
    where estado = 'vigente' and cantidad_restante > 0 and gracia_hasta <= now()
    for update
  loop
    insert into credit_movements (profile_id, lot_id, tipo, cantidad, motivo, idempotency_key)
    values (r.profile_id, r.id, 'vencimiento', -r.cantidad_restante,
            'Vencimiento de saldo tras ciclo y gracia', 'vence:' || r.id::text)
    on conflict (idempotency_key) do nothing;

    update credit_lots set cantidad_restante = 0, estado = 'vencido' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Genera avisos para el panel. No cambia estados de clientes.
create or replace function generar_avisos() returns int
language plpgsql set search_path = public as $$
declare
  n int := 0;
  k int;
begin
  insert into admin_notifications (clave, tipo, profile_id, mensaje)
  select 'plazo_vencido:' || p.id::text || ':' || extract(epoch from p.plazo_inicio)::bigint::text,
         'plazo_vencido', p.id,
         'Venció el plazo para elegir servicios: ' || p.marca
  from profiles p
  where p.estado = 'activa'
    and now() > p.plazo_inicio + make_interval(hours => p.plazo_horas)
  on conflict (clave) do nothing;
  get diagnostics k = row_count;
  n := n + k;

  insert into admin_notifications (clave, tipo, profile_id, mensaje)
  select 'plazo_por_vencer:' || p.id::text || ':' || extract(epoch from p.plazo_inicio)::bigint::text,
         'plazo_por_vencer', p.id,
         'Quedan menos de 12 horas para elegir servicios: ' || p.marca
  from profiles p
  where p.estado = 'activa'
    and now() > p.plazo_inicio + make_interval(hours => p.plazo_horas) - interval '12 hours'
    and now() <= p.plazo_inicio + make_interval(hours => p.plazo_horas)
  on conflict (clave) do nothing;
  get diagnostics k = row_count;
  n := n + k;

  insert into admin_notifications (clave, tipo, profile_id, mensaje)
  select 'gracia:' || l.id::text,
         'creditos_por_vencer', l.profile_id,
         'Saldo que vence en menos de 24 horas: ' || p.marca
  from credit_lots l
  join profiles p on p.id = l.profile_id
  where l.estado = 'vigente'
    and l.cantidad_restante > 0
    and l.gracia_hasta > now()
    and l.gracia_hasta <= now() + interval '24 hours'
  on conflict (clave) do nothing;
  get diagnostics k = row_count;
  n := n + k;

  return n;
end $$;

-- Acceso: solo el servidor (service role) ejecuta estas funciones.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function es_admin(uuid) to anon, authenticated;
grant execute on all functions in schema public to service_role;
