import { ErrorNegocio } from './supabase.js';

export function json(datos, status = 200, cabeceras = {}) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras },
  });
}

// Envuelve un handler: los errores de negocio vuelven como 422 con su código;
// cualquier otro error se registra en el log y responde 500 genérico.
export async function manejar(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorNegocio) return json({ error: e.message }, 422);
    console.error(e);
    return json({ error: 'ERROR_INTERNO' }, 500);
  }
}
