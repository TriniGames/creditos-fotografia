import { useState } from 'react';
import { api, nuevoId } from '../shared/api.js';
import { mensajeError } from '../shared/errores.js';
import { ARS } from '../shared/format.js';

export default function Formularios({ estado, marcaDe, accion, recargar }) {
  const [planMensual, setPlanMensual] = useState('');
  const pendientes = estado.planes_mensuales.filter((x) => x.estado === 'pendiente_pago');

  async function nuevoCliente(e) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api('/api/admin/crear-cliente', { ...datos, idem: nuevoId() });
      e.currentTarget.reset();
      window.alert('Cliente creado. Entregale usuario y contraseña en persona.');
      await recargar();
    } catch (err) {
      window.alert(mensajeError(err));
    }
  }

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
        <h2>Nuevo cliente</h2>
        <form className="formulario" onSubmit={nuevoCliente}>
          <label>Usuario <input name="username" required /></label>
          <label>Nombre <input name="nombre" required /></label>
          <label>Marca <input name="marca" required /></label>
          <label>Correo <input name="email" type="email" required /></label>
          <label>Contraseña temporal (mínimo 10) <input name="password" minLength={10} required /></label>
          <button type="submit">Crear cliente</button>
        </form>
      </section>

      <section>
        <h2>Plan y pago</h2>
        <form className="formulario" onSubmit={crearPlan}>
          <label>
            Cliente
            <select name="profile" required>
              {estado.clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.marca}</option>
              ))}
            </select>
          </label>
          <label>
            Plan
            <select name="plan" required>
              {estado.planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {ARS.format(p.precio_ars)} · {p.creditos} cr.
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Crear plan del mes</button>
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
          <label>Monto (ARS) <input name="monto" type="number" step="0.01" min="1" required /></label>
          <label>
            Método
            <select name="metodo">
              <option value="transferencia">Transferencia</option>
              <option value="mercado_pago">Mercado Pago</option>
            </select>
          </label>
          <label>ID de pago de Mercado Pago (opcional) <input name="mp_id" /></label>
          <label>Comprobante, URL (opcional) <input name="comprobante" /></label>
          <button type="submit">Registrar pago</button>
        </form>
      </section>
    </>
  );
}
