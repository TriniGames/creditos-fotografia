import { sbRest, sbRpc } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';

// El id sale siempre de la sesión, nunca de la URL ni del cuerpo.
// Los motivos internos no se devuelven: el cliente ve tipo, cantidad y fecha.
export const onRequestGet = ({ data, env }) =>
  manejar(async () => {
    const { profile } = data.sesion;

    const [saldo, planes, movimientos, servicios, pedidos, capacidad] = await Promise.all([
      sbRpc(env, 'saldo_cliente', { p_profile: profile.id }),
      sbRest(env, `monthly_plans?profile_id=eq.${profile.id}&estado=eq.activo&ciclo_fin=gt.${encodeURIComponent(new Date().toISOString())}&select=periodo,creditos,ciclo_fin&order=ciclo_inicio.desc&limit=1`),
      sbRest(env, `credit_movements?profile_id=eq.${profile.id}&select=id,tipo,cantidad,created_at&order=created_at.desc&limit=30`),
      sbRest(env, 'services?activo=eq.true&select=id,nombre,descripcion,costo_creditos&order=nombre'),
      sbRest(env, `service_orders?profile_id=eq.${profile.id}&select=id,estado,total_creditos,created_at,revisado_at,entregado_at,comentario_cliente,comentario_admin,order_items(id,nombre,costo_creditos,detalle_trabajo,estado_trabajo,entregado_at,responsable:profiles!order_items_responsable_id_fkey(nombre))&order=created_at.desc&limit=30`),
      sbRpc(env,'capacidad_cliente',{ p_profile:profile.id }),
    ]);

    const plazoFin =
      profile.plazo_inicio && profile.plazo_horas
        ? new Date(new Date(profile.plazo_inicio).getTime() + profile.plazo_horas * 3600_000).toISOString()
        : null;

    return json({
      marca: profile.marca,
      nombre: profile.nombre,
      estado: profile.estado,
      saldo,
      capacidad,
      plazo_fin: plazoFin,
      plan: planes[0] || null,
      movimientos,
      servicios,
      pedidos,
    }, 200, { 'Cache-Control': 'no-store' });
  });
