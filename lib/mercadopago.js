// Mercado Pago: PREPARADO, NO ACTIVO.
// Estas funciones no se invocan todavía. El webhook responde 503 mientras
// MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET no estén configurados.
// Antes de producción, revisar el formato de firma contra la documentación
// vigente de Mercado Pago y probar con credenciales de prueba.

const MP_API = 'https://api.mercadopago.com';

export function mpConfigurado(env) {
  return Boolean(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET);
}

// Firma x-signature: "ts=...,v1=...". El mensaje firmado combina el id del
// recurso, el x-request-id y el timestamp.
export async function verificarFirmaMP(request, env, dataId) {
  const firma = request.headers.get('x-signature') || '';
  const requestId = request.headers.get('x-request-id') || '';
  const partes = Object.fromEntries(
    firma.split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2)
  );
  if (!partes.ts || !partes.v1 || !dataId) return false;

  const mensaje = `id:${dataId};request-id:${requestId};ts:${partes.ts};`;
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const firmaCalculada = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(mensaje));
  const hex = [...new Uint8Array(firmaCalculada)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === partes.v1;
}

// Consulta el pago directamente a Mercado Pago (no confiar solo en el webhook).
export async function obtenerPago(env, paymentId) {
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error('MP_CONSULTA_FALLIDA');
  return res.json();
}

// Crea un checkout para un plan mensual. external_reference = id del monthly_plan,
// así el webhook sabe a qué plan corresponde el pago.
export async function crearPreferencia(env, { monthlyPlanId, titulo, monto, email }) {
  if (!mpConfigurado(env)) throw new Error('MP_NO_CONFIGURADO');
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ title: titulo, quantity: 1, unit_price: monto, currency_id: 'ARS' }],
      external_reference: monthlyPlanId,
      payer: { email },
      notification_url: `${env.PUBLIC_SITE_URL}/api/mp/webhook`,
    }),
  });
  if (!res.ok) throw new Error('MP_PREFERENCIA_FALLIDA');
  return res.json();
}
