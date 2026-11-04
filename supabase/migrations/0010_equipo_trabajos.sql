-- El rol admin existente es el superadministrador; no se cambian sus accesos.
alter table profiles drop constraint profiles_rol_check;
alter table profiles add constraint profiles_rol_check check(rol in ('admin','cliente','empleado'));
alter table order_items add column responsable_id uuid references profiles(id);
alter table order_items add column detalle_trabajo text not null default '' check(char_length(detalle_trabajo)<=10000);
alter table order_items add column estado_trabajo text not null default 'pendiente' check(estado_trabajo in ('pendiente','en_produccion','entregado'));
alter table order_items add column entregado_at timestamptz;
alter table order_items add column version int not null default 0;
update order_items i set estado_trabajo='entregado',entregado_at=coalesce(o.entregado_at,o.created_at)
  from service_orders o where o.id=i.order_id and o.estado='entregado';
create index trabajos_responsable_idx on order_items(responsable_id,estado_trabajo);

create function es_trabajador_activo(p_uid uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=p_uid and (rol='admin' and estado<>'eliminada' or rol='empleado' and estado='activa'));
$$;
create policy empleado_items_lectura on order_items for select
  using(responsable_id=auth.uid() and es_trabajador_activo(auth.uid()));

create function crear_empleado(p_actor uuid,p_auth_id uuid,p_username text,p_nombre text,p_marca text,p_email text,p_idem text)
returns uuid language plpgsql set search_path=public as $$
declare v_clave text:='crear_empleado:'||p_idem; v_prev jsonb;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave,p_auth_id,jsonb_build_array(p_actor,lower(p_username),btrim(p_nombre),btrim(p_marca),lower(p_email)));
  v_prev:=_op_previa(v_clave);
  if v_prev is not null then return (v_prev->>'profile_id')::uuid; end if;
  if p_nombre is null or length(btrim(p_nombre))<2 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_username is null or p_username !~ '^[a-z0-9_.-]{3,30}$' then raise exception 'USUARIO_INVALIDO'; end if;
  begin
    insert into profiles(id,username,nombre,marca,email,rol,estado)
      values(p_auth_id,lower(p_username),btrim(p_nombre),'Equipo',lower(p_email),'empleado','activa');
  exception when unique_violation then raise exception 'USUARIO_EN_USO'; end;
  perform _auditar(p_actor,'crear_empleado','profiles',p_auth_id::text,'Alta de empleado','{}'::jsonb);
  perform _guardar_op(v_clave,jsonb_build_object('profile_id',p_auth_id));
  return p_auth_id;
end $$;
create function buscar_alta_empleado(p_actor uuid,p_idem text,p_username text,p_nombre text,p_marca text,p_email text)
returns uuid language plpgsql set search_path=public as $$
declare v_datos jsonb; v_prev jsonb;
begin
  perform _requiere_admin(p_actor);
  select datos into v_datos from operation_requests where clave='crear_empleado:'||p_idem;
  if found and v_datos is distinct from jsonb_build_array(p_actor,lower(p_username),btrim(p_nombre),btrim(p_marca),lower(p_email)) then raise exception 'IDEMPOTENCIA_CONFLICTO'; end if;
  v_prev:=_op_previa('crear_empleado:'||p_idem);
  return (v_prev->>'profile_id')::uuid;
end $$;
create function guardar_empleado(p_actor uuid,p_profile uuid,p_nombre text,p_activo boolean,p_idem text)
returns void language plpgsql set search_path=public as $$
declare v_clave text:='empleado:'||p_idem;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave,p_profile,jsonb_build_array(p_actor,p_profile,p_nombre,p_activo));
  if _op_previa(v_clave) is not null then return; end if;
  if p_nombre is null or length(btrim(p_nombre))<2 or p_activo is null then raise exception 'NOMBRE_INVALIDO'; end if;
  update profiles set nombre=btrim(p_nombre),estado=case when p_activo then 'activa' else 'dada_de_baja' end where id=p_profile and rol='empleado';
  if not found then raise exception 'NO_AUTORIZADO'; end if;
  perform _auditar(p_actor,'guardar_empleado','profiles',p_profile::text,'Actualización de empleado',jsonb_build_object('activo',p_activo));
  perform _guardar_op(v_clave,'true'::jsonb);
end $$;

create function asignar_trabajo(p_actor uuid,p_item uuid,p_responsable uuid,p_version int,p_idem text)
returns void language plpgsql set search_path=public as $$
declare v_clave text:='asignacion:'||p_idem; v_item order_items; v_order service_orders;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave,p_actor,jsonb_build_array(p_actor,p_item,p_responsable,p_version));
  if _op_previa(v_clave) is not null then return; end if;
  -- Todas las operaciones por servicio bloquean primero el pedido y luego el ítem.
  select o.* into v_order from service_orders o join order_items i on i.order_id=o.id where i.id=p_item for update of o;
  select * into v_item from order_items where id=p_item for update;
  if not found then raise exception 'TRABAJO_INEXISTENTE'; end if;
  if p_version is distinct from v_item.version then raise exception 'TRABAJO_MODIFICADO'; end if;
  if v_order.estado in ('entregado','cancelado') or v_item.estado_trabajo='entregado' then raise exception 'ESTADO_INVALIDO'; end if;
  if p_responsable is not null and not es_trabajador_activo(p_responsable) then raise exception 'RESPONSABLE_INVALIDO'; end if;
  update order_items set responsable_id=p_responsable,version=version+1 where id=p_item;
  perform _auditar(p_actor,'asignar_trabajo','order_items',p_item::text,'Asignación de servicio',jsonb_build_object('anterior',v_item.responsable_id,'responsable_id',p_responsable));
  perform _guardar_op(v_clave,'true'::jsonb);
end $$;

create function actualizar_trabajo(p_actor uuid,p_item uuid,p_detalle text,p_estado text,p_version int,p_idem text)
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
  elsif p_estado in ('en_produccion','entregado') then
    update service_orders set estado='en_produccion' where id=v_order.id;
  end if;
  perform _auditar(p_actor,'actualizar_trabajo','order_items',p_item::text,'Actualización de servicio contratado',
    jsonb_build_object('detalle_anterior',v_item.detalle_trabajo,'detalle',btrim(p_detalle),'estado_anterior',v_item.estado_trabajo,'estado',p_estado));
  perform _guardar_op(v_clave,'true'::jsonb);
end $$;

create function listar_trabajos(p_actor uuid) returns jsonb
language plpgsql stable set search_path=public as $$
begin
  if not es_trabajador_activo(p_actor) then raise exception 'NO_AUTORIZADO'; end if;
  return (select coalesce(jsonb_agg(t order by t.created_at desc,t.id),'[]'::jsonb) from (
    select i.id,i.order_id,i.nombre,i.costo_creditos,i.detalle_trabajo,i.estado_trabajo,i.entregado_at,i.version,i.responsable_id,
      r.nombre as responsable,r.estado as responsable_estado,p.marca as cliente,o.profile_id,o.created_at,o.estado as estado_pedido,o.revisado_at,o.comentario_cliente
    from order_items i join service_orders o on o.id=i.order_id join profiles p on p.id=o.profile_id
      left join profiles r on r.id=i.responsable_id
    where es_admin(p_actor) or i.responsable_id=p_actor
  )t);
end $$;

revoke all on function crear_empleado(uuid,uuid,text,text,text,text,text),buscar_alta_empleado(uuid,text,text,text,text,text),guardar_empleado(uuid,uuid,text,boolean,text),asignar_trabajo(uuid,uuid,uuid,int,text),actualizar_trabajo(uuid,uuid,text,text,int,text),listar_trabajos(uuid) from public,anon,authenticated;
grant execute on function crear_empleado(uuid,uuid,text,text,text,text,text),buscar_alta_empleado(uuid,text,text,text,text,text),guardar_empleado(uuid,uuid,text,boolean,text),asignar_trabajo(uuid,uuid,uuid,int,text),actualizar_trabajo(uuid,uuid,text,text,int,text),listar_trabajos(uuid) to service_role;

-- La capacidad se libera por servicio, conservando el costo contratado original.
create or replace function _validar_capacidad_pedido() returns trigger
language plpgsql set search_path=public as $$
declare v_config capacity_settings; v_max int; v_cliente bigint; v_total bigint;
begin
  -- Una fila común serializa pedidos de DIFERENTES clientes y cambios de topes.
  select * into strict v_config from capacity_settings where id=true for update;
  if new.estado in ('entregado','cancelado') then return new; end if;
  if TG_OP='UPDATE' and old.estado not in ('entregado','cancelado')
    and new.profile_id=old.profile_id and new.total_creditos<=old.total_creditos then return new; end if;
  select coalesce((select max_creditos from client_capacity_limits where profile_id=new.profile_id),v_config.max_cliente) into v_max;
  select coalesce(sum(i.costo_creditos) filter (where o.profile_id=new.profile_id),0),coalesce(sum(i.costo_creditos),0)
    into v_cliente,v_total from order_items i join service_orders o on o.id=i.order_id
    where o.estado not in ('entregado','cancelado') and i.estado_trabajo<>'entregado' and o.id<>new.id;
  if v_max is not null and v_cliente+new.total_creditos>v_max then raise exception 'TOPE_CLIENTE_SUPERADO'; end if;
  if v_config.max_total is not null and v_total+new.total_creditos>v_config.max_total then raise exception 'CAPACIDAD_EQUIPO_SUPERADA'; end if;
  return new;
end $$;

create or replace function capacidad_cliente(p_profile uuid) returns jsonb
language sql stable set search_path=public as $$
  with carga as (
    select coalesce(sum(i.costo_creditos),0) as total,
      coalesce(sum(i.costo_creditos) filter(where o.profile_id=p_profile),0) as cliente
    from order_items i join service_orders o on o.id=i.order_id where o.estado not in ('entregado','cancelado') and i.estado_trabajo<>'entregado'
  ), limites as (
    select coalesce((select max_creditos from client_capacity_limits where profile_id=p_profile),max_cliente) as cliente,max_total as total
    from capacity_settings where id=true
  )
  select jsonb_build_object('pendiente',c.cliente,'max_cliente',l.cliente,
    'disponible',case when l.cliente is null and l.total is null then null else greatest(0,least(l.cliente-c.cliente,l.total-c.total)) end)
    from carga c cross join limites l;
$$;

create or replace function capacidad_admin() returns jsonb
language sql stable set search_path=public as $$
  select jsonb_build_object('max_cliente',s.max_cliente,'max_total',s.max_total,
    'pendiente_total',(select coalesce(sum(i.costo_creditos),0) from order_items i join service_orders o on o.id=i.order_id where o.estado not in ('entregado','cancelado') and i.estado_trabajo<>'entregado'),
    'clientes',(select coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'max_creditos',l.max_creditos,
      'pendiente',(select coalesce(sum(i.costo_creditos),0) from order_items i join service_orders o on o.id=i.order_id where o.profile_id=p.id and o.estado not in ('entregado','cancelado') and i.estado_trabajo<>'entregado'))),'[]'::jsonb)
      from profiles p left join client_capacity_limits l on l.profile_id=p.id where p.rol='cliente' and p.estado<>'eliminada'))
    from capacity_settings s where id=true;
$$;

create or replace function entregar_pedido(p_actor uuid,p_order uuid,p_idem text) returns void
language plpgsql set search_path=public as $$
declare v_clave text := 'entrega:'||p_idem; v_pedido service_orders;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave,p_actor,jsonb_build_array(p_actor,p_order));
  if _op_previa(v_clave) is not null then return; end if;
  select * into v_pedido from service_orders where id=p_order for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;
  if v_pedido.estado='cancelado' or v_pedido.revisado_at is null then raise exception 'ESTADO_INVALIDO'; end if;
  if v_pedido.estado<>'entregado' then
    update order_items set estado_trabajo='entregado',entregado_at=now(),version=version+1 where order_id=p_order and estado_trabajo<>'entregado';
    update service_orders set estado='entregado',entregado_at=now() where id=p_order;
    perform _auditar(p_actor,'entregar_pedido','service_orders',p_order::text,'Pedido entregado',jsonb_build_object('profile_id',v_pedido.profile_id));
  end if;
  perform _guardar_op(v_clave,'true'::jsonb);
end $$;
