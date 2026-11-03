-- Capacidad simultánea: pedidos recibidos, agendados y en producción.
-- NULL = sin tope. No se asignan valores de negocio sin decisión del administrador.
create table capacity_settings (
  id boolean primary key default true check (id),
  max_cliente int check (max_cliente >= 0),
  max_total int check (max_total >= 0)
);
insert into capacity_settings (id) values (true);
create table client_capacity_limits (
  profile_id uuid primary key references profiles(id) on delete cascade,
  max_creditos int not null check (max_creditos >= 0)
);
alter table capacity_settings enable row level security;
alter table client_capacity_limits enable row level security;
grant all on capacity_settings,client_capacity_limits to service_role;
alter table service_orders add column entregado_at timestamptz;

create function _validar_capacidad_pedido() returns trigger
language plpgsql set search_path=public as $$
declare v_config capacity_settings; v_max int; v_cliente bigint; v_total bigint;
begin
  -- Una fila común serializa pedidos de DIFERENTES clientes y cambios de topes.
  select * into strict v_config from capacity_settings where id=true for update;
  if new.estado in ('entregado','cancelado') then return new; end if;
  if TG_OP='UPDATE' and old.estado not in ('entregado','cancelado')
    and new.profile_id=old.profile_id and new.total_creditos<=old.total_creditos then return new; end if;
  select coalesce((select max_creditos from client_capacity_limits where profile_id=new.profile_id),v_config.max_cliente) into v_max;
  select coalesce(sum(total_creditos) filter (where profile_id=new.profile_id),0),coalesce(sum(total_creditos),0)
    into v_cliente,v_total from service_orders where estado not in ('entregado','cancelado') and id<>new.id;
  if v_max is not null and v_cliente+new.total_creditos>v_max then raise exception 'TOPE_CLIENTE_SUPERADO'; end if;
  if v_config.max_total is not null and v_total+new.total_creditos>v_config.max_total then raise exception 'CAPACIDAD_EQUIPO_SUPERADA'; end if;
  return new;
end $$;
create trigger validar_capacidad_pedido before insert or update of estado,total_creditos,profile_id on service_orders
  for each row execute function _validar_capacidad_pedido();

create function guardar_capacidad(p_actor uuid,p_max_cliente int,p_max_total int,p_idem text) returns void
language plpgsql set search_path=public as $$
declare v_clave text := 'capacidad:'||p_idem;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave,p_actor,jsonb_build_array(p_actor,p_max_cliente,p_max_total));
  if _op_previa(v_clave) is not null then return; end if;
  if p_max_cliente<0 or p_max_total<0 then raise exception 'LIMITE_INVALIDO'; end if;
  update capacity_settings set max_cliente=p_max_cliente,max_total=p_max_total where id=true;
  perform _auditar(p_actor,'guardar_capacidad','capacity_settings','global','Configuración de capacidad',jsonb_build_object('max_cliente',p_max_cliente,'max_total',p_max_total));
  perform _guardar_op(v_clave,'true'::jsonb);
end $$;

create function guardar_limite_cliente(p_actor uuid,p_profile uuid,p_max_creditos int,p_idem text) returns void
language plpgsql set search_path=public as $$
declare v_clave text := 'limite_cliente:'||p_idem;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave,p_actor,jsonb_build_array(p_actor,p_profile,p_max_creditos));
  if _op_previa(v_clave) is not null then return; end if;
  if p_max_creditos<0 then raise exception 'LIMITE_INVALIDO'; end if;
  perform 1 from capacity_settings where id=true for update;
  if not exists(select 1 from profiles where id=p_profile and rol='cliente' and estado<>'eliminada') then raise exception 'NO_AUTORIZADO'; end if;
  if p_max_creditos is null then delete from client_capacity_limits where profile_id=p_profile;
  else insert into client_capacity_limits values(p_profile,p_max_creditos)
    on conflict(profile_id) do update set max_creditos=excluded.max_creditos; end if;
  perform _auditar(p_actor,'guardar_limite_cliente','profiles',p_profile::text,'Límite de capacidad del cliente',jsonb_build_object('max_creditos',p_max_creditos));
  perform _guardar_op(v_clave,'true'::jsonb);
end $$;

create function capacidad_cliente(p_profile uuid) returns jsonb
language sql stable set search_path=public as $$
  with carga as (
    select coalesce(sum(total_creditos),0) as total,
      coalesce(sum(total_creditos) filter(where profile_id=p_profile),0) as cliente
    from service_orders where estado not in ('entregado','cancelado')
  ), limites as (
    select coalesce((select max_creditos from client_capacity_limits where profile_id=p_profile),max_cliente) as cliente,max_total as total
    from capacity_settings where id=true
  )
  select jsonb_build_object('pendiente',c.cliente,'max_cliente',l.cliente,
    'disponible',case when l.cliente is null and l.total is null then null else greatest(0,least(l.cliente-c.cliente,l.total-c.total)) end)
    from carga c cross join limites l;
$$;
create function capacidad_admin() returns jsonb
language sql stable set search_path=public as $$
  select jsonb_build_object('max_cliente',s.max_cliente,'max_total',s.max_total,
    'pendiente_total',(select coalesce(sum(total_creditos),0) from service_orders where estado not in ('entregado','cancelado')),
    'clientes',(select coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'max_creditos',l.max_creditos,
      'pendiente',(select coalesce(sum(o.total_creditos),0) from service_orders o where o.profile_id=p.id and o.estado not in ('entregado','cancelado')))),'[]'::jsonb)
      from profiles p left join client_capacity_limits l on l.profile_id=p.id where p.rol='cliente' and p.estado<>'eliminada'))
    from capacity_settings s where id=true;
$$;

create function entregar_pedido(p_actor uuid,p_order uuid,p_idem text) returns void
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
    update service_orders set estado='entregado',entregado_at=now() where id=p_order;
    perform _auditar(p_actor,'entregar_pedido','service_orders',p_order::text,'Pedido entregado',jsonb_build_object('profile_id',v_pedido.profile_id));
  end if;
  perform _guardar_op(v_clave,'true'::jsonb);
end $$;

revoke all on function _validar_capacidad_pedido(),guardar_capacidad(uuid,int,int,text),guardar_limite_cliente(uuid,uuid,int,text),capacidad_cliente(uuid),capacidad_admin(),entregar_pedido(uuid,uuid,text) from public,anon,authenticated;
grant execute on function guardar_capacidad(uuid,int,int,text),guardar_limite_cliente(uuid,uuid,int,text),capacidad_cliente(uuid),capacidad_admin(),entregar_pedido(uuid,uuid,text) to service_role;
