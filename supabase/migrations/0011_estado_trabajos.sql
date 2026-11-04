-- Mantener el estado del pedido consistente si un servicio vuelve a pendiente.
create or replace function actualizar_trabajo(p_actor uuid,p_item uuid,p_detalle text,p_estado text,p_version int,p_idem text)
returns void language plpgsql set search_path=public as $$
declare v_clave text:='trabajo:'||p_idem; v_item order_items; v_order service_orders; v_admin boolean;
begin
  if not es_trabajador_activo(p_actor) then raise exception 'NO_AUTORIZADO'; end if;
  perform _serializar_operacion(v_clave,p_actor,jsonb_build_array(p_actor,p_item,p_detalle,p_estado,p_version));
  if not es_trabajador_activo(p_actor) then raise exception 'NO_AUTORIZADO'; end if;
  if _op_previa(v_clave) is not null then return; end if;
  select o.* into v_order from service_orders o join order_items i on i.order_id=o.id where i.id=p_item for update of o;
  select * into v_item from order_items where id=p_item for update;
  if not found then raise exception 'TRABAJO_INEXISTENTE'; end if;
  v_admin:=es_admin(p_actor);
  if not v_admin and v_item.responsable_id is distinct from p_actor then raise exception 'NO_AUTORIZADO'; end if;
  if p_version is distinct from v_item.version then raise exception 'TRABAJO_MODIFICADO'; end if;
  if v_order.estado in ('entregado','cancelado') or v_item.estado_trabajo='entregado' then raise exception 'ESTADO_INVALIDO'; end if;
  if p_detalle is null or char_length(p_detalle)>10000 then raise exception 'DETALLE_INVALIDO'; end if;
  if p_estado is null or p_estado not in ('pendiente','en_produccion','entregado') then raise exception 'ESTADO_INVALIDO'; end if;
  if p_estado='entregado' and v_order.revisado_at is null then raise exception 'PEDIDO_SIN_REVISAR'; end if;
  if p_estado='entregado' and length(btrim(p_detalle))=0 then raise exception 'DETALLE_REQUERIDO'; end if;
  update order_items set detalle_trabajo=btrim(p_detalle),estado_trabajo=p_estado,
    entregado_at=case when p_estado='entregado' then now() else null end,version=version+1 where id=p_item;
  if not exists(select 1 from order_items where order_id=v_order.id and estado_trabajo<>'entregado') then
    update service_orders set estado='entregado',entregado_at=now() where id=v_order.id;
  elsif exists(select 1 from order_items where order_id=v_order.id and estado_trabajo in ('en_produccion','entregado')) then
    update service_orders set estado='en_produccion' where id=v_order.id;
  elsif v_order.estado='en_produccion' then
    update service_orders set estado='seleccionado' where id=v_order.id;
  end if;
  perform _auditar(p_actor,'actualizar_trabajo','order_items',p_item::text,'Actualización de servicio contratado',
    jsonb_build_object('detalle_anterior',v_item.detalle_trabajo,'detalle',btrim(p_detalle),'estado_anterior',v_item.estado_trabajo,'estado',p_estado));
  perform _guardar_op(v_clave,'true'::jsonb);
end $$;
