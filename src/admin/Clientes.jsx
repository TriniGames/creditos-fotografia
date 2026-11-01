import { useState } from 'react';
import { fecha, sumarHoras } from '../shared/format.js';
import Modal from '../shared/Modal.jsx';
import Tabla from '../shared/Tabla.jsx';
import EstadoBadge from '../shared/EstadoBadge.jsx';

const TITULOS = { modificar_cliente: 'Editar cliente', agregar_creditos: 'Ampliar créditos', dar_de_baja: 'Dar de baja', reactivar: 'Reactivar', eliminar_cuenta: 'Eliminar cuenta' };
export default function Clientes({ clientes, accion, ocupado }) {
  const [seleccion, setSeleccion] = useState(null);
  async function guardar(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const datos = { p_profile: seleccion.cliente.id };
    if (seleccion.tipo === 'modificar_cliente') Object.assign(datos, {
      p_username: f.username.trim().toLowerCase(), p_nombre: f.nombre.trim(), p_marca: f.marca.trim(),
    });
    else {
      datos.p_motivo = f.motivo.trim();
      if (seleccion.tipo === 'agregar_creditos') datos.p_creditos = Number(f.cantidad);
      if (seleccion.tipo === 'reactivar') datos.p_devolver = Number(f.cantidad);
    }
    if (await accion(seleccion.tipo, datos)) setSeleccion(null);
  }
  const elegir = (cliente, tipo) => setSeleccion({ cliente, tipo });
  return <section>
    <h2>Clientes</h2>
    <Tabla titulo="Clientes" datos={clientes} ocupado={ocupado}
      mensajeVacio="Creá tu primer cliente desde Nuevo cliente."
      columnas={[
        { id: 'marca', titulo: 'Marca / nombre', render: (c) => <>{c.marca}<div className="suave">{c.nombre}</div></> },
        { id: 'username', titulo: 'Usuario / correo', render: (c) => <>{c.username}<div className="suave">{c.email}</div></> },
        { id: 'estado', titulo: 'Estado', render: (c) => <EstadoBadge variante={c.estado === 'activa' ? 'positivo' : c.estado === 'sin_creditos' ? 'advertencia' : 'peligro'}>
          {{activa:'Activa',sin_creditos:'Sin créditos',dada_de_baja:'De baja',eliminada:'Eliminada'}[c.estado] || c.estado}
        </EstadoBadge> },
        { id: 'saldo', titulo: 'Saldo', alineacion: 'derecha', render: (c) => `${c.saldo} cr.` },
        { id: 'plazo', titulo: 'Plazo', render: (c) => c.estado === 'activa' && c.plazo_inicio ? fecha(sumarHoras(c.plazo_inicio,c.plazo_horas)) : '—' },
      ]}
      acciones={[
        { id: 'modificar_cliente', texto: 'Editar datos', icono: 'editar', variante: 'editar', visible: (c) => c.estado !== 'eliminada' },
        { id: 'agregar_creditos', texto: 'Agregar créditos', icono: 'sumar', variante: 'positivo', visible: (c) => c.estado === 'activa' },
        { id: 'reactivar', texto: 'Reactivar', icono: 'reactivar', variante: 'positivo', visible: (c) => c.estado === 'dada_de_baja' },
        { id: 'dar_de_baja', texto: 'Dar de baja', icono: 'baja', variante: 'precaucion', grupo: 'riesgo', visible: (c) => ['activa','sin_creditos'].includes(c.estado) },
        { id: 'eliminar_cuenta', texto: 'Eliminar cuenta', icono: 'eliminar', variante: 'destructivo', grupo: 'riesgo', visible: (c) => c.estado !== 'eliminada' },
      ]}
      onAccion={(tipo, cliente) => elegir(cliente, tipo)}
    />
    {seleccion && <Modal key={`${seleccion.cliente.id}:${seleccion.tipo}`}
      titulo={TITULOS[seleccion.tipo]} detalle={`${seleccion.cliente.marca} · ${seleccion.cliente.username}`}
      ocupado={ocupado} onCerrar={() => setSeleccion(null)}>
      <form className="formulario" onSubmit={guardar}>
      {seleccion.tipo === 'modificar_cliente' ? <>
        <label>Usuario <input name="username" defaultValue={seleccion.cliente.username} minLength={3} maxLength={30} pattern="[a-z0-9_.\-]{3,30}" required /></label>
        <label>Nombre <input name="nombre" defaultValue={seleccion.cliente.nombre} minLength={2} required /></label>
        <label>Marca <input name="marca" defaultValue={seleccion.cliente.marca} minLength={2} required /></label>
        <p className="suave">Correo de acceso: {seleccion.cliente.email}</p>
      </> : <>
        {seleccion.tipo === 'dar_de_baja' && <p className="modal__advertencia">Se perderán {seleccion.cliente.saldo} créditos y se cerrarán los planes y pagos pendientes. El historial se conserva.</p>}
        {seleccion.tipo === 'eliminar_cuenta' && <p className="modal__advertencia">Se bloqueará el acceso y se perderán {seleccion.cliente.saldo} créditos. Esta cuenta no podrá reactivarse. El historial se conserva.</p>}
        {['agregar_creditos','reactivar'].includes(seleccion.tipo) && <label>
          {seleccion.tipo === 'reactivar' ? 'Créditos a devolver (0 si ninguno)' : 'Créditos a agregar'}
          <input name="cantidad" type="number" step="1" min={seleccion.tipo === 'reactivar' ? 0 : 1} defaultValue={seleccion.tipo === 'reactivar' ? 0 : ''} required />
        </label>}
        {seleccion.tipo === 'reactivar' && <p>La cuenta vuelve a estar activa y dispone de 24 horas para elegir servicios.</p>}
        <label>Motivo <input name="motivo" minLength={3} required /></label>
      </>}
      <div className="modal__acciones">
        <button type="button" className="secundario" onClick={() => setSeleccion(null)}>Cancelar</button>
        <button type="submit" className={seleccion.tipo === 'eliminar_cuenta' ? 'peligro' : seleccion.tipo === 'dar_de_baja' ? 'precaucion' : ['reactivar','agregar_creditos'].includes(seleccion.tipo) ? 'positivo' : ''}>
          {seleccion.tipo === 'modificar_cliente' ? 'Guardar cambios' : TITULOS[seleccion.tipo]}
        </button>
      </div>
      </form>
    </Modal>}
  </section>;
}
