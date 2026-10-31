import { sbRest, sbRpc } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';

// El id sale siempre de la sesión, nunca de la URL ni del cuerpo.
// Los motivos internos no se devuelven: el cliente ve tipo, cantidad y fecha.
export const onRequestGet = ({ data, env }) =>
  manejar(async () => {
    const { profile } = data.sesion;

    const [saldo, planes, movimientos] = await Promise.all([
      sbRpc(env, 'saldo_cliente', { p_profile: profile.id }),
      sbRest(env, `monthly_plans?profile_id=eq.${profile.id}&estado=eq.activo&select=periodo,creditos,ciclo_fin&limit=1`),
      sbRest(env, `credit_movements?profile_id=eq.${profile.id}&select=tipo,cantidad,created_at&order=created_at.desc&limit=30`),
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
      plazo_fin: plazoFin,
      plan: planes[0] || null,
      movimientos,
    });
  });
