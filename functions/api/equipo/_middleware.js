import { obtenerSesion } from '../../../lib/session.js';
import { json } from '../../../lib/http.js';

// Única puerta de entrada del panel. Las funciones SQL además validan el rol
// (_requiere_admin), así que aunque esta capa fallara, la base seguiría protegida.
export async function onRequest(context) {
  const sesion = await obtenerSesion(context.request, context.env);
  if (!sesion || sesion.profile.rol !== 'empleado') {
    return json({ error: 'NO_AUTORIZADO' }, 401);
  }
  context.data.sesion = sesion;
  return context.next();
}
