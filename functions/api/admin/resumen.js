import { sbRest, sbRpc } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';

export const onRequestGet = ({ env }) =>
  manejar(async () => {
    // Genera avisos nuevos. Es idempotente y no cambia estados de clientes.
    await sbRpc(env, 'generar_avisos', {});

    const [clientes, pagos, avisos, planes, servicios, planesMensuales] = await Promise.all([
      sbRest(env, 'profiles?rol=eq.cliente&select=id,username,nombre,marca,email,estado,plazo_inicio,plazo_horas&order=created_at.desc'),
      sbRest(env, 'payments?estado=eq.pendiente&select=id,monto,metodo,created_at,profile_id,profiles(marca)&order=created_at.asc'),
      sbRest(env, 'admin_notifications?leida=eq.false&select=id,tipo,mensaje,created_at&order=created_at.desc&limit=50'),
      sbRest(env, 'plans?activo=eq.true&select=id,nombre,precio_ars,creditos'),
      sbRest(env, 'services?activo=eq.true&select=id,nombre,costo_creditos'),
      sbRest(env, 'monthly_plans?estado=in.(pendiente_pago,activo)&select=id,profile_id,estado,periodo,creditos,ciclo_fin'),
    ]);

    const saldos = await Promise.all(clientes.map((c) => sbRpc(env, 'saldo_cliente', { p_profile: c.id })));
    clientes.forEach((c, i) => {
      c.saldo = saldos[i];
    });

    return json({ clientes, pagos, avisos, planes, servicios, planes_mensuales: planesMensuales });
  });
