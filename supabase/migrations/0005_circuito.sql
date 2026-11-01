-- 0005: circuito de clientes, catálogo y pedidos; reintentos seguros.
create table operation_requests (
  clave text primary key,
  datos jsonb not null
);
alter table operation_requests enable row level security;
grant all on operation_requests to service_role;

-- Orden único: clave de operación, perfil, plan/pago/lotes.
-- El registro se confirma o revierte junto con la operación de negocio.
create function _serializar_operacion(p_clave text, p_profile uuid, p_datos jsonb)
returns void language plpgsql set search_path = public as $$
declare v_datos jsonb;
begin
  if p_clave is null or length(split_part(p_clave, ':', 2)) = 0 then
    raise exception 'IDEMPOTENCIA_REQUERIDA';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clave, 0));
  perform 1 from profiles where id = p_profile for update;
  select datos into v_datos from operation_requests where clave = p_clave;
  if found and v_datos is distinct from p_datos then
    raise exception 'IDEMPOTENCIA_CONFLICTO';
  end if;
  insert into operation_requests values (p_clave, p_datos) on conflict do nothing;
end $$;

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
  perform _serializar_operacion(v_clave, p_profile, jsonb_build_array(p_actor, p_profile, p_plan));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then
    return (v_prev->>'monthly_plan_id')::uuid;
  end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found then raise exception 'CLIENTE_INEXISTENTE'; end if;
  if v_prof.rol <> 'cliente' or v_prof.estado in ('dada_de_baja', 'eliminada') then
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
  perform _serializar_operacion(v_clave, p_profile, jsonb_build_array(p_actor, p_profile, p_monthly_plan, p_monto, p_metodo, p_mp_payment_id, p_comprobante));
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

  if p_monto is null or p_monto <> (select precio_ars from monthly_plans where id = p_monthly_plan) then
    raise exception 'MONTO_INCORRECTO';
  end if;
  if exists (select 1 from payments where monthly_plan_id = p_monthly_plan and estado in ('pendiente', 'aprobado')) then
    raise exception 'PAGO_YA_REGISTRADO';
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
  perform _serializar_operacion(v_clave, (select profile_id from payments where id = p_payment), jsonb_build_array(p_actor, p_payment));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  select * into v_pay from payments where id = p_payment for update;
  if not found or v_pay.estado <> 'pendiente' then
    raise exception 'PAGO_NO_PENDIENTE';
  end if;

  select * into v_mp from monthly_plans where id = v_pay.monthly_plan_id for update;
  if v_mp.estado <> 'pendiente_pago' then raise exception 'PLAN_NO_PENDIENTE'; end if;
  if v_pay.monto <> v_mp.precio_ars then raise exception 'MONTO_INCORRECTO'; end if;

  select * into v_prof from profiles where id = v_pay.profile_id for update;
  if v_prof.rol <> 'cliente' or v_prof.estado not in ('sin_creditos', 'activa') then
    raise exception 'ESTADO_INVALIDO: %', v_prof.estado;
  end if;

  if exists (
    select 1 from monthly_plans
    where profile_id = v_prof.id and estado = 'activo' and ciclo_fin > now()
  ) then
    raise exception 'CICLO_EN_CURSO';
  end if;

  update monthly_plans set estado = 'cerrado'
  where profile_id = v_prof.id and estado = 'activo' and ciclo_fin <= now();

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
  perform _serializar_operacion(v_clave, p_profile, jsonb_build_array(p_actor, p_profile, p_creditos, p_motivo));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return (v_prev->>'lot_id')::uuid; end if;

  if p_creditos is null or p_creditos <= 0 then raise exception 'CANTIDAD_INVALIDA'; end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.rol <> 'cliente' or v_prof.estado <> 'activa' then raise exception 'ESTADO_INVALIDO'; end if;

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
  perform _serializar_operacion(v_clave, p_profile, jsonb_build_array(p_profile, p_servicios));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  if p_servicios is null or cardinality(p_servicios) = 0 then
    raise exception 'PEDIDO_VACIO';
  end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.rol <> 'cliente' or v_prof.estado <> 'activa' then raise exception 'ESTADO_INVALIDO'; end if;

  if v_prof.plazo_inicio is null or v_prof.plazo_horas is null or now() > v_prof.plazo_inicio + make_interval(hours => v_prof.plazo_horas) then
    raise exception 'PLAZO_VENCIDO';
  end if;

  perform 1 from services where id = any(p_servicios) order by id for share;

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
  perform _serializar_operacion(v_clave, p_profile, jsonb_build_array(p_actor, p_profile, p_motivo));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.rol <> 'cliente' or v_prof.estado not in ('activa','sin_creditos') then raise exception 'ESTADO_INVALIDO'; end if;

  v_perdidos := _perder_saldo(p_actor, p_profile, 'Baja: ' || p_motivo);

  update monthly_plans set estado = 'cerrado' where profile_id = p_profile and estado in ('activo', 'pendiente_pago');
  update payments set estado = 'rechazado', revisado_por = p_actor, revisado_at = now()
  where profile_id = p_profile and estado = 'pendiente';
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
  perform _serializar_operacion(v_clave, p_profile, jsonb_build_array(p_actor, p_profile, p_devolver, p_motivo));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.rol <> 'cliente' or v_prof.estado <> 'dada_de_baja' then raise exception 'ESTADO_INVALIDO'; end if;

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
  perform _serializar_operacion(v_clave, p_profile, jsonb_build_array(p_actor, p_profile, p_motivo));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return v_prev; end if;

  select * into v_prof from profiles where id = p_profile for update;
  if not found or v_prof.rol <> 'cliente' or v_prof.estado = 'eliminada' then raise exception 'ESTADO_INVALIDO'; end if;

  v_perdidos := _perder_saldo(p_actor, p_profile, 'Eliminación de cuenta: ' || p_motivo);

  update monthly_plans set estado = 'cerrado' where profile_id = p_profile and estado in ('activo', 'pendiente_pago');
  update payments set estado = 'rechazado', revisado_por = p_actor, revisado_at = now()
  where profile_id = p_profile and estado = 'pendiente';
  update profiles set estado = 'eliminada' where id = p_profile;

  perform _auditar(p_actor, 'eliminar_cuenta', 'profiles', p_profile::text, p_motivo,
                   jsonb_build_object('creditos_perdidos', v_perdidos));
  return _guardar_op(v_clave, jsonb_build_object('creditos_perdidos', v_perdidos));
end $$;

