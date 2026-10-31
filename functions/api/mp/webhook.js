import { json, manejar } from '../../../lib/http.js';
import { mpConfigurado, verificarFirmaMP } from '../../../lib/mercadopago.js';

// PREPARADO, NO ACTIVO. Verifica la firma y responde, pero no registra pagos
// ni acredita créditos. La acreditación sigue siendo manual desde el panel.
// Cuando se conecte Mercado Pago, el paso siguiente es registrar el pago como
// pendiente (registrar_pago) y notificar al administrador.
export const onRequestPost = ({ request, env }) =>
  manejar(async () => {
    if (!mpConfigurado(env)) return json({ error: 'MP_NO_CONFIGURADO' }, 503);

    const url = new URL(request.url);
    const dataId = url.searchParams.get('data.id') || url.searchParams.get('id');

    if (!(await verificarFirmaMP(request, env, dataId))) {
      return json({ error: 'FIRMA_INVALIDA' }, 401);
    }

    return json({ recibido: true, procesado: false });
  });
