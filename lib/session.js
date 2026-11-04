import { sbRest } from './supabase.js';

const COOKIE = 'sb_at';

export function leerCookie(request, nombre) {
  const cookies = request.headers.get('Cookie') || '';
  const par = cookies
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${nombre}=`));
  return par ? decodeURIComponent(par.slice(nombre.length + 1)) : null;
}

// HttpOnly: el navegador no puede leerla desde JavaScript.
// SameSite=Strict: no se envía desde otros sitios (protege contra CSRF).
export function cookieSesion(token, segundos) {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${segundos}`;
}

export function cookieBorrar() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

// Devuelve { user, profile } o null. Un token inválido o un perfil eliminado
// cuentan como no autenticado.
export async function obtenerSesion(request, env) {
  const token = leerCookie(request, COOKIE);
  if (!token) return null;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();

  const filas = await sbRest(env, `profiles?id=eq.${user.id}&select=*`);
  const profile = filas[0];
  if (!profile || profile.estado === 'eliminada' || (profile.rol === 'empleado' && profile.estado !== 'activa')) return null;

  return { user, profile };
}
