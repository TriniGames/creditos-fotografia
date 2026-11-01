// Cliente HTTP del frontend. Siempre envía la cookie de sesión (same-origin).
// Ante 401 vuelve al ingreso.
export async function api(ruta, cuerpo) {
  const res = await fetch(ruta, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('NO_AUTORIZADO');
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(datos.error || 'ERROR');
    error.status = res.status;
    throw error;
  }
  return datos;
}

export const nuevoId = () => crypto.randomUUID();
