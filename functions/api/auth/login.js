import { sbRest } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';
import { cookieSesion } from '../../../lib/session.js';

// Login por usuario y contraseña. El usuario se traduce al correo interno
// y la autenticación la hace Supabase Auth. Los errores son siempre genéricos
// para no revelar qué usuarios existen.
export const onRequestPost = ({ request, env }) =>
  manejar(async () => {
    const body = await request.json().catch(() => null);
    const username = String(body?.username || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const fallo = () => json({ error: 'CREDENCIALES_INVALIDAS' }, 401);

    if (!username || !password) return fallo();

    const filas = await sbRest(
      env,
      `profiles?username=eq.${encodeURIComponent(username)}&select=email,rol,estado`
    );
    const perfil = filas[0];
    if (!perfil || perfil.estado === 'eliminada') return fallo();

    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: perfil.email, password }),
    });
    if (!res.ok) return fallo();

    const token = await res.json();
    return json(
      { ok: true, rol: perfil.rol },
      200,
      { 'Set-Cookie': cookieSesion(token.access_token, token.expires_in) }
    );
  });
