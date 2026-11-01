import { obtenerSesion } from '../../../lib/session.js';
import { json, manejar } from '../../../lib/http.js';

// La identidad y el rol siempre provienen de la sesión validada por el servidor.
export const onRequestGet = ({ request, env }) => manejar(async () => {
  const sesion = await obtenerSesion(request, env);
  const headers = { 'Cache-Control': 'no-store' };
  if (!sesion) return json({ error: 'NO_AUTENTICADO' }, 401, headers);
  const { id, username, nombre, marca, email, rol, estado } = sesion.profile;
  return json({ usuario: { id, username, nombre, marca, email, rol, estado } }, 200, headers);
});
