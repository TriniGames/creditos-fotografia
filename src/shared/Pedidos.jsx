import { useState } from 'react';
import Tabla from './Tabla.jsx';
import EstadoTrabajo from './EstadoTrabajo.jsx';
import Modal from './Modal.jsx';
import EstadoBadge from './EstadoBadge.jsx';
import { fecha } from './format.js';

const ESTADOS = {
  seleccionado: ['Recibido', 'advertencia'], agendado: ['Agendado', 'neutro'],
  en_produccion: ['En producción', 'neutro'], entregado: ['Entregado', 'positivo'], cancelado: ['Cancelado', 'peligro'],
};
export const referenciaPedido = (id) => `#${id.slice(0,8).toUpperCase()}`;

export function EstadoPedido({ pedido }) {
  const [texto,variante] = pedido.estado === 'seleccionado'
    ? pedido.revisado_at ? ['Revisado por el administrador','positivo'] : ['Recibido · pendiente de revisión','advertencia']
    : ESTADOS[pedido.estado] || [pedido.estado,'neutro'];
  return <EstadoBadge variante={variante}>{texto}</EstadoBadge>;
}

// Ambos roles comparten tabla y detalle. Solo administración recibe la acción de revisar.
export default function Pedidos({ pedidos, ocupado, marcaDe, onRevisar, onGestionar, abierto, onAbrir }) {
  const pedido = pedidos.find((p) => p.id === abierto);
  const nombreCliente = (p) => p.profiles?.marca || marcaDe?.(p.profile_id);
  return <>
    <p className="suave">{onRevisar ? 'Los pedidos sin revisar aparecen primero. Abrí un pedido para ver sus servicios y marcarlo como revisado.' : 'Tu pedido queda registrado y el equipo recibe un aviso. Podés consultar aquí si ya fue revisado.'}</p>
    <Tabla titulo={onRevisar ? 'Pedidos de clientes' : 'Mis pedidos'} datos={pedidos} ocupado={ocupado}
      mensajeVacio={onRevisar ? 'Todavía no hay pedidos de clientes.' : 'Todavía no confirmaste pedidos. Elegí tus servicios para crear el primero.'}
      columnas={[
        { id: 'id', titulo: 'Pedido', render: (p) => <><strong>{referenciaPedido(p.id)}</strong><div className="suave">{fecha(p.created_at)}</div></> },
        ...(marcaDe ? [{ id:'cliente',titulo:'Cliente',render:nombreCliente }] : []),
        { id: 'servicios', titulo: 'Servicios', render: (p) => p.order_items.map((i) => i.nombre).join(', ') },
        { id: 'total_creditos', titulo: 'Créditos', alineacion: 'derecha' },
        { id: 'estado', titulo: 'Estado', render: (p) => <EstadoPedido pedido={p} /> },
      ]}
      acciones={[{id:'ver',texto:'Ver pedido',icono:'ver',variante:'editar'}]}
      onAccion={(_accion,p) => onAbrir(p.id)} />
    {pedido && <Modal titulo={`Pedido ${referenciaPedido(pedido.id)}`} detalle={nombreCliente(pedido) || `Enviado el ${fecha(pedido.created_at)}`}
      ocupado={ocupado} onCerrar={() => onAbrir(null)}>
      <div className="pedido-meta"><EstadoPedido pedido={pedido} /><span>{fecha(pedido.created_at)}</span></div>
      <ul className="lista pedido-servicios pedido-trabajos">{pedido.order_items.map((item,i) => <li key={item.id || i}>
        <div className="pedido-meta"><strong>{item.nombre}</strong><span>{item.costo_creditos} cr.</span><EstadoTrabajo trabajo={{...item,estado_pedido:pedido.estado}} /></div>
        <p className="suave">Responsable: {item.responsable?.nombre || 'Por asignar'}{item.entregado_at && <> · Entregado el {fecha(item.entregado_at)}</>}</p>
        <div className="pedido-nota"><strong>Detalle acordado de este servicio</strong><p>{item.detalle_trabajo || 'Por completar después de coordinar con el equipo.'}</p></div>
        {onGestionar && <button className="secundario editar" onClick={() => onGestionar(item.id)}>Gestionar servicio y responsable</button>}
      </li>)}</ul>
      <p className="pedido-total">Total <strong>{pedido.total_creditos} créditos</strong></p>
      <ol className="pedido-etapas" aria-label="Seguimiento del pedido">
        <li className="pedido-etapas__completo"><strong>1. Pedido recibido</strong><span>{fecha(pedido.created_at)}</span></li>
        <li className={pedido.revisado_at ? 'pedido-etapas__completo' : ''}><strong>2. Revisión del administrador</strong><span>{pedido.revisado_at ? 'Revisado y analizado el ' + fecha(pedido.revisado_at) : pedido.estado === 'cancelado' ? 'Cancelado antes de la revisión' : 'Pendiente: el administrador aún no confirmó la revisión'}</span></li>
        {pedido.entregado_at && <li className="pedido-etapas__completo"><strong>3. Pedido entregado</strong><span>{fecha(pedido.entregado_at)}</span></li>}
      </ol>
      <section className="pedido-nota"><h3>Comentario inicial del cliente</h3><p>{pedido.comentario_cliente || 'El cliente no dejó un comentario inicial.'}</p></section>
      {pedido.revisado_at && <section className="pedido-nota pedido-nota--admin"><h3>Respuesta del administrador</h3><p>{pedido.comentario_admin || 'El administrador revisó el pedido sin agregar una respuesta.'}</p></section>}
      {onRevisar && !pedido.revisado_at && pedido.estado !== 'cancelado' && <RevisionPedido key={pedido.id} pedido={pedido} onRevisar={onRevisar} />}
      <p className="suave">Este detalle contiene un comentario inicial y una única respuesta del administrador. Para continuar la conversación, usá el canal habitual con el equipo.</p>
      <div className="modal__acciones">
        <button type="button" className="secundario" onClick={() => onAbrir(null)}>Cerrar</button>
      </div>
    </Modal>}
  </>;
}

function RevisionPedido({ pedido, onRevisar }) {
  const [comentario, setComentario] = useState('');
  return <form className="pedido-respuesta" onSubmit={(e) => { e.preventDefault(); onRevisar(pedido.id,comentario.trim()); }}>
    <label>Respuesta del administrador (opcional)<textarea rows="4" maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Dejá la conclusión de tu revisión para el cliente." /></label>
    <p className="suave">Al confirmar se registra la revisión y se envía esta única respuesta. Después no se puede editar ni agregar otra.</p>
    <button className="positivo" type="submit">Confirmar revisión y enviar respuesta</button>
  </form>;
}
