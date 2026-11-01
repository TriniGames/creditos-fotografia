import { useState } from 'react';
import { ARS } from '../shared/format.js';

export default function PlanesPagos({ estado, marcaDe, accion }) {
  const [planMensual, setPlanMensual] = useState('');
  const pendientes = estado.planes_mensuales.filter((x) => x.estado === 'pendiente_pago' && !estado.pagos.some((p) => p.profile_id === x.profile_id));
  const planes = estado.planes.filter((p) => p.activo);
  const clientes = estado.clientes.filter((c) => ['sin_creditos', 'activa'].includes(c.estado));
  const mensualElegido = pendientes.find((x) => x.id === planMensual);

  function crearPlan(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    accion('crear_plan_mensual', { p_profile: f.get('profile'), p_plan: f.get('plan') });
  }

  function registrarPago(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // El cliente sale del plan mensual elegido, no de un campo aparte.
    const mensual = estado.planes_mensuales.find((x) => x.id === planMensual);
    accion('registrar_pago', {
      p_profile: mensual?.profile_id,
      p_monthly_plan: planMensual,
      p_monto: Number(f.get('monto')),
      p_metodo: f.get('metodo'),
      p_mp_payment_id: f.get('mp_id') || null,
      p_comprobante: f.get('comprobante') || null,
    });
  }

  return (
    <>
      <section>
        <h2>Planes y pagos</h2>
        <form className="formulario" onSubmit={crearPlan}>
          <label>
            Cliente
            <select name="profile" required>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.marca}</option>
              ))}
            </select>
          </label>
          <label>
            Plan
            <select name="plan" required>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {ARS.format(p.precio_ars)} · {p.creditos} cr.
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!clientes.length || !planes.length}>Crear plan del mes</button>
          {!planes.length && <p>Cargá un plan activo en el catálogo para continuar.</p>}
        </form>

        <form className="formulario" onSubmit={registrarPago}>
          <label>
            Plan pendiente de pago
            <select value={planMensual} onChange={(e) => setPlanMensual(e.target.value)} required>
              <option value="">Elegí un plan…</option>
              {pendientes.map((x) => (
                <option key={x.id} value={x.id}>{marcaDe(x.profile_id)} · {x.periodo}</option>
              ))}
            </select>
          </label>
          <label>Monto completo (ARS) <input name="monto" type="number" value={mensualElegido?.precio_ars ?? ''} readOnly required /></label>
          <label>
            Método
            <select name="metodo">
              <option value="transferencia">Transferencia</option>
              <option value="mercado_pago">Mercado Pago</option>
            </select>
          </label>
          <label>ID de pago de Mercado Pago (opcional) <input name="mp_id" /></label>
          <label>Comprobante, URL (opcional) <input name="comprobante" /></label>
          <button type="submit" disabled={!mensualElegido}>Registrar pago</button>
        </form>
      </section>
    </>
  );
}
