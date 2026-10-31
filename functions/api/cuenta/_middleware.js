import { obtenerSesion } from '../../../lib/session.js';
import { json } from '../../../lib/http.js';

export async function onRequest(context) {
  const sesion = await obtenerSesion(context.request, context.env);
  if (!sesion) return json({ error: 'NO_AUTENTICADO' }, 401);
  context.data.sesion = sesion;
  return context.next();
}
