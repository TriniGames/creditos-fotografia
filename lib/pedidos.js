import { sbRest, sbCount, sbRpc } from './supabase.js';

export async function resumenPedidos(env) {
  const [pedidos, nuevos, capacidad] = await Promise.all([
    sbRest(env, 'service_orders?select=id,profile_id,estado,total_creditos,created_at,revisado_at,entregado_at,comentario_cliente,comentario_admin,profiles!service_orders_profile_id_fkey(marca),order_items(nombre,costo_creditos)&order=revisado_at.desc.nullsfirst,created_at.desc&limit=50'),
    sbCount(env, 'service_orders?revisado_at=is.null&estado=not.in.(cancelado,entregado)'),
    sbRpc(env,'capacidad_admin',{}),
  ]);
  return { pedidos, pedidos_nuevos: nuevos, capacidad };
}
