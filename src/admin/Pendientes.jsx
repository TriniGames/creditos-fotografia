import { useState } from 'react';
import Modal from '../shared/Modal.jsx';
import { ARS, fecha } from '../shared/format.js';

export default function Pendientes({ vista, cambiarVista, estado, historial, marcaDe, accion, ocupado, onCerrar, onVerPedido }) {
  const [pago, setPago] = useState(null);
  const titulos = { pedidos: 'Pedidos nuevos', pagos: 'Pagos por aprobar', avisos: 'Avisos pendientes', actividad: 'Actividad de esta sesión' };
  async function aprobar() {
    if (await accion('aprobar_pago_y_activar', { p_payment: pago.id })) setPago(null);
  }
  return <Modal titulo={titulos[vista]} detalle="Revisá los pendientes y el resultado de tus acciones desde cualquier sección."
    ocupado={ocupado} onCerrar={onCerrar}>
    <nav className="bandeja-nav" aria-label="Contenido de la bandeja">
      {['pedidos','pagos','avisos','actividad'].map((v) => <button type="button" key={v} className="secundario"
        aria-pressed={vista === v} onClick={() => { setPago(null); cambiarVista(v); }}>
        {v === 'pedidos' ? `Pedidos (${estado.pedidos_nuevos})` : v === 'pagos' ? `Pagos (${estado.pagos.length})` : v === 'avisos' ? `Avisos (${estado.avisos.length})` : 'Actividad'}
      </button>)}
    </nav>
    {vista === 'pedidos' && <>
      <p className="suave">{estado.pedidos_nuevos ? `${estado.pedidos_nuevos} pedidos pendientes de revisión. Abrí el detalle para revisarlos.` : 'Estás al día. No hay pedidos nuevos.'}</p>
      {estado.pedidos.filter((p) => !p.revisado_at && p.estado !== 'cancelado').map((p) => <article className="pendiente-card" key={p.id}>
        <span className="estado-badge estado-badge--amarillo">Nuevo pedido</span>
        <h3>{p.profiles?.marca || marcaDe(p.profile_id)}</h3>
        <p>{p.order_items.map((i) => i.nombre).join(', ')}</p>
        <p><strong>{p.total_creditos} créditos</strong> · {fecha(p.created_at)}</p>
        <button type="button" className="positivo" onClick={() => onVerPedido(p.id)}>Ver y revisar pedido</button>
      </article>)}
      {estado.pedidos_nuevos > 50 && <p className="suave">Se muestran 50 pendientes. Al revisarlos aparecerán los siguientes.</p>}
    </>}
    {vista === 'pagos' && (pago ? <div className="pendiente-card">
      <span className="estado-badge estado-badge--amarillo">Confirmación de pago</span>
      <h3>{pago.profiles?.marca ?? marcaDe(pago.profile_id)}</h3>
      <p className="pago-monto">{ARS.format(pago.monto)}</p>
      <p>{pago.metodo === 'transferencia' ? 'Transferencia' : 'Mercado Pago'} · {fecha(pago.created_at)}</p>
      <p className="modal__advertencia">Confirmá solo si verificaste que recibiste el importe. Se acreditarán los créditos del plan y comenzará el plazo de 48 horas.</p>
      <div className="modal__acciones">
        <button className="secundario" onClick={() => setPago(null)}>Volver</button>
        <button className="positivo" onClick={aprobar}>Confirmar pago y activar</button>
      </div>
    </div> : !estado.pagos.length ? <p className="estado-vacio">No hay pagos pendientes de aprobación.</p> :
      estado.pagos.map((p) => <article className="pendiente-card" key={p.id}>
        <span className="estado-badge estado-badge--amarillo">Pendiente de aprobación</span>
        <h3>{p.profiles?.marca ?? marcaDe(p.profile_id)}</h3>
        <p className="pago-monto">{ARS.format(p.monto)}</p>
        <p className="suave">{p.metodo === 'transferencia' ? 'Transferencia' : 'Mercado Pago'} · {fecha(p.created_at)}</p>
        <button className="positivo" onClick={() => setPago(p)}>Revisar y aprobar</button>
      </article>))}
    {vista === 'avisos' && (!estado.avisos.length ? <p className="estado-vacio">Estás al día. No hay avisos pendientes.</p> :
      estado.avisos.map((a) => <article className="pendiente-card" key={a.id}>
        <span className={`estado-badge ${a.tipo === 'plazo_vencido' ? 'estado-badge--rojo' : 'estado-badge--amarillo'}`}>
          {a.tipo === 'plazo_vencido' ? 'Plazo vencido' : a.tipo === 'pago_registrado' ? 'Pago registrado' : 'Requiere atención'}
        </span>
        <p>{a.mensaje}</p><p className="suave">{fecha(a.created_at)}</p>
        <button className="secundario" onClick={() => accion('marcar_notificacion_leida', { p_id: a.id })}>Marcar como leído</button>
      </article>))}
    {vista === 'actividad' && <>
      <p className="suave">Últimas 20 acciones. Este registro se mantiene hasta recargar la página.</p>
      {!historial.length ? <p className="estado-vacio">Todavía no realizaste acciones en esta sesión.</p> : historial.map((item) =>
        <article key={item.id} className={`actividad-item actividad-item--${item.tipo}`}>
          <strong>{item.tipo === 'exito' ? 'Completado' : item.tipo === 'error' ? 'Error' : 'Atención'}</strong>
          <p>{item.texto}</p><small>{fecha(item.fecha)}</small>
        </article>)}
    </>}
  </Modal>;
}
