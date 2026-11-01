import { sbRpc } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';

// Lista blanca: solo estas funciones pueden invocarse desde el panel.
// Cada una declara los argumentos que acepta y si requiere clave de idempotencia.
const ACCIONES = {
  modificar_cliente: { args: ['p_profile', 'p_username', 'p_nombre', 'p_marca'], idem: true },
  guardar_catalogo: { args: ['p_tipo', 'p_id', 'p_nombre', 'p_valor', 'p_creditos', 'p_descripcion', 'p_activo'], idem: true },
  crear_plan_mensual: { args: ['p_profile', 'p_plan'], idem: true },
  registrar_pago: {
    args: ['p_profile', 'p_monthly_plan', 'p_monto', 'p_metodo', 'p_mp_payment_id', 'p_comprobante'],
    idem: true,
  },
  aprobar_pago_y_activar: { args: ['p_payment'], idem: true },
  agregar_creditos: { args: ['p_profile', 'p_creditos', 'p_motivo'], idem: true },
  dar_de_baja: { args: ['p_profile', 'p_motivo'], idem: true },
  reactivar: { args: ['p_profile', 'p_devolver', 'p_motivo'], idem: true },
  eliminar_cuenta: { args: ['p_profile', 'p_motivo'], idem: true },
  marcar_notificacion_leida: { args: ['p_id'], idem: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost = ({ request, data, env }) =>
  manejar(async () => {
    const body = await request.json().catch(() => null);
    const def = body && Object.hasOwn(ACCIONES, body.accion) && ACCIONES[body.accion];
    if (!def) return json({ error: 'ACCION_INVALIDA' }, 400);
    if (def.idem && !UUID.test(body.idem || '')) return json({ error: 'IDEMPOTENCIA_REQUERIDA' }, 400);

    const datos = body.datos || {};
    const args = { p_actor: data.sesion.user.id };
    for (const nombre of def.args) args[nombre] = datos[nombre] ?? null;
    if (def.idem) args.p_idem = body.idem;

    const resultado = await sbRpc(env, body.accion, args);
    return json({ ok: true, resultado });
  });
