-- Aviso persistente en la misma transacción que confirma y descuenta el pedido.
alter table service_orders add column revisado_at timestamptz;
alter table service_orders add column revisado_por uuid references profiles(id);
alter table admin_notifications add column order_id uuid references service_orders(id) on delete cascade;
create index pedidos_sin_revisar_idx on service_orders (created_at desc)
  where revisado_at is null and estado <> 'cancelado';

create function _notificar_pedido() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into admin_notifications (clave,tipo,profile_id,order_id,mensaje)
  values ('pedido:' || new.id::text,'pedido_nuevo',new.profile_id,new.id,
    'Nuevo pedido de ' || (select marca from profiles where id=new.profile_id) || ': ' || new.total_creditos || ' créditos.')
  on conflict (clave) do nothing;
  return new;
end $$;
create trigger pedido_notificacion after insert on service_orders
  for each row execute function _notificar_pedido();

-- Mostrar también los pedidos recibidos antes de esta migración que siguen pendientes.
insert into admin_notifications (clave,tipo,profile_id,order_id,mensaje)
select 'pedido:' || o.id::text,'pedido_nuevo',o.profile_id,o.id,
  'Pedido pendiente de revisión de ' || p.marca || ': ' || o.total_creditos || ' créditos.'
from service_orders o join profiles p on p.id=o.profile_id
where o.estado='seleccionado'
on conflict (clave) do nothing;

create function revisar_pedido(p_actor uuid,p_order uuid) returns void
language plpgsql set search_path = public as $$
declare v_pedido service_orders;
begin
  perform _requiere_admin(p_actor);
  select * into v_pedido from service_orders where id=p_order for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;
  if v_pedido.revisado_at is null then
    update service_orders set revisado_at=now(),revisado_por=p_actor where id=p_order;
    perform _auditar(p_actor,'revisar_pedido','service_orders',p_order::text,'Pedido revisado',
      jsonb_build_object('profile_id',v_pedido.profile_id));
  end if;
  update admin_notifications set leida=true where order_id=p_order and tipo='pedido_nuevo';
end $$;

revoke all on function _notificar_pedido() from public,anon,authenticated;
revoke all on function revisar_pedido(uuid,uuid) from public,anon,authenticated;
grant execute on function revisar_pedido(uuid,uuid) to service_role;
