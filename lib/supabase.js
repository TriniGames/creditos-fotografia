// Cliente de Supabase para el servidor. Usa la service role key:
// este archivo NUNCA debe importarse desde el frontend (public/).

export class ErrorNegocio extends Error {}

function cabeceras(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Las funciones SQL lanzan códigos como 'SALDO_INSUFICIENTE'. Solo se devuelve
// ese código al cliente; cualquier otro detalle de la base se oculta.
async function fallo(res) {
  let msg = '';
  try {
    msg = (await res.json()).message || '';
  } catch {
    // respuesta sin cuerpo JSON
  }
  const codigo = msg.match(/^([A-Z][A-Z_]{3,})(?::.*)?$/)?.[1];
  if (codigo) throw new ErrorNegocio(codigo);
  throw new Error('SUPABASE_REQUEST_FAILED');
}

async function leer(res) {
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

export async function sbRest(env, ruta) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabeceras(env) });
  if (!res.ok) return fallo(res);
  return leer(res);
}

export async function sbRpc(env, funcion, argumentos = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: cabeceras(env),
    body: JSON.stringify(argumentos),
  });
  if (!res.ok) return fallo(res);
  return leer(res);
}

// Endpoints de administración de usuarios de Supabase Auth.
export function sbAuthAdmin(env, metodo, ruta, cuerpo) {
  return fetch(`${env.SUPABASE_URL}/auth/v1/admin/${ruta}`, {
    method: metodo,
    headers: cabeceras(env),
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
}
