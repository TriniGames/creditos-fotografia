import { sbRpc } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const onRequestPost = ({ request, data, env }) => manejar(async () => {
  if (data.sesion.profile.rol !== 'cliente') return json({ error: 'NO_AUTORIZADO' }, 403);
  const body = await request.json().catch(() => null);
  if (!UUID.test(body?.idem || '')) return json({ error: 'IDEMPOTENCIA_REQUERIDA' }, 400);
  if (!Array.isArray(body.servicios) || !body.servicios.length || body.servicios.length > 100 ||
      !body.servicios.every((id) => typeof id === 'string' && UUID.test(id)) ||
      new Set(body.servicios).size !== body.servicios.length) return json({ error: 'SERVICIO_INVALIDO' }, 400);
  if (body.comentario != null && (typeof body.comentario !== 'string' || body.comentario.length > 2000)) return json({ error: 'COMENTARIO_INVALIDO' }, 400);
  const resultado = await sbRpc(env, 'confirmar_pedido_comentado', {
    p_profile: data.sesion.user.id, p_servicios: [...body.servicios].sort(), p_idem: body.idem, p_comentario: body.comentario?.trim() || null,
  });
  return json({ ok: true, resultado });
});
