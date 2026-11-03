-- Dos notas únicas por pedido; no existe un hilo de mensajes.
alter table service_orders add column comentario_cliente text check (char_length(comentario_cliente) <= 2000);
alter table service_orders add column comentario_admin text check (char_length(comentario_admin) <= 2000);

create or replace function confirmar_pedido_comentado(p_profile uuid, p_servicios uuid[], p_idem text, p_comentario text)
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
  p_comentario := nullif(btrim(p_comentario),'');
  if char_length(p_comentario) > 2000 then raise exception 'COMENTARIO_INVALIDO'; end if;
  perform _serializar_operacion(v_clave, p_profile,
    case when p_comentario is null then jsonb_build_array(p_profile,p_servicios)
    else jsonb_build_array(p_profile,p_servicios,p_comentario) end);
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

  insert into service_orders (profile_id, total_creditos, comentario_cliente)
  values (p_profile, v_total, p_comentario)
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

-- Compatibilidad con consumidores anteriores de la función.
create or replace function confirmar_pedido(p_profile uuid,p_servicios uuid[],p_idem text)
returns jsonb language sql set search_path=public as $$
  select confirmar_pedido_comentado(p_profile,p_servicios,p_idem,null);
$$;
create function revisar_pedido_comentado(p_actor uuid,p_order uuid,p_comentario text) returns void
language plpgsql set search_path=public as $$
declare v_pedido service_orders;
begin
  perform _requiere_admin(p_actor);
  p_comentario := nullif(btrim(p_comentario),'');
  if char_length(p_comentario) > 2000 then raise exception 'COMENTARIO_INVALIDO'; end if;
  select * into v_pedido from service_orders where id=p_order for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;
  if v_pedido.estado='cancelado' then raise exception 'ESTADO_INVALIDO'; end if;
  if v_pedido.revisado_at is not null then
    if v_pedido.comentario_admin is distinct from p_comentario then raise exception 'PEDIDO_YA_REVISADO'; end if;
    return;
  end if;
  update service_orders set revisado_at=now(),revisado_por=p_actor,comentario_admin=p_comentario where id=p_order;
  perform _auditar(p_actor,'revisar_pedido','service_orders',p_order::text,'Pedido revisado',jsonb_build_object('profile_id',v_pedido.profile_id));
  update admin_notifications set leida=true where order_id=p_order and tipo='pedido_nuevo';
end $$;
create or replace function revisar_pedido(p_actor uuid,p_order uuid) returns void
language sql set search_path=public as $$ select revisar_pedido_comentado(p_actor,p_order,null); $$;
revoke all on function confirmar_pedido_comentado(uuid,uuid[],text,text) from public,anon,authenticated;
revoke all on function revisar_pedido_comentado(uuid,uuid,text) from public,anon,authenticated;
grant execute on function confirmar_pedido_comentado(uuid,uuid[],text,text) to service_role;
grant execute on function revisar_pedido_comentado(uuid,uuid,text) to service_role;
