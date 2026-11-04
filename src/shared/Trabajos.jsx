import { useEffect, useState } from 'react';
import Tabla from './Tabla.jsx';
import Modal from './Modal.jsx';
import EstadoBadge from './EstadoBadge.jsx';
import { useSesion } from './SesionContext.jsx';
import { fecha } from './format.js';
import EstadoTrabajo from './EstadoTrabajo.jsx';
import { referenciaPedido } from './Pedidos.jsx';


export default function Trabajos({ trabajos, equipo = [], ocupado, onGuardar, onAsignar, onActualizar, abrirId, onAbierto }) {
  const { usuario } = useSesion();
  const [filtro, setFiltro] = useState('pendientes');
  const [responsable, setResponsable] = useState('todos');
  const [editor, setEditor] = useState(null);
  const filas = trabajos.filter((t) => (filtro === 'todos' || (filtro === 'entregados' ? t.estado_trabajo === 'entregado' : t.estado_trabajo !== 'entregado' && t.estado_pedido !== 'cancelado')) &&
    (responsable === 'todos' || (responsable === 'sin_asignar' ? !t.responsable_id : t.responsable_id === usuario.id)));
  useEffect(() => { if (abrirId) { const item=trabajos.find((t) => t.id === abrirId); if (item) {setEditor(item);onAbierto(null);} } },[abrirId,trabajos,onAbierto]);
  const actual = editor && trabajos.find((t) => t.id === editor.id);
  return <section>
    <h2>{onAsignar ? 'Servicios contratados y responsables' : 'Mis trabajos'}</h2>
    <p className="suave">Cada fila corresponde a un servicio de un pedido. El detalle acordado fuera de la plataforma es visible para el cliente. La descripción general del catálogo se conserva aparte.</p>
    <div className="trabajos-filtros">
      <label>Estado<select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="pendientes">Pendientes de entrega</option><option value="entregados">Entregados</option><option value="todos">Todos</option></select></label>
      {onAsignar && <label>Responsable<select value={responsable} onChange={(e) => setResponsable(e.target.value)}><option value="todos">Todos</option><option value="sin_asignar">Sin asignar</option><option value="mios">Mis trabajos</option></select></label>}
      <button type="button" className="secundario" disabled={ocupado} onClick={() => onActualizar().catch(() => {})}>Actualizar trabajos</button>
    </div>
    <Tabla titulo="Servicios contratados" datos={filas} ocupado={ocupado} mensajeVacio="No hay servicios para estos filtros." columnas={[
      {id:'cliente',titulo:'Cliente / pedido',render:(t) => <><strong>{t.cliente}</strong><div className="suave">{referenciaPedido(t.order_id)}</div></>},
      {id:'nombre',titulo:'Servicio'},
      ...(onAsignar ? [{id:'responsable',titulo:'Responsable',render:(t) => <>{t.responsable || <EstadoBadge variante="advertencia">Sin asignar</EstadoBadge>}{t.responsable_estado === 'dada_de_baja' && <div className="error">Inactivo: requiere reasignación</div>}</>}] : []),
      {id:'estado',titulo:'Estado',render:(t) => <EstadoTrabajo trabajo={t} />},
      {id:'detalle',titulo:'Detalle acordado',render:(t) => t.detalle_trabajo ? 'Cargado' : 'Por completar'},
    ]} acciones={[{id:'ver',texto:onAsignar ? 'Ver detalle y asignar' : 'Ver y actualizar trabajo',icono:'ver',variante:'editar'}]} onAccion={(_,t) => setEditor(t)} />
    {editor && <Modal titulo={editor.nombre} detalle={`${editor.cliente} · Pedido ${referenciaPedido(editor.order_id)}`} ocupado={ocupado} onCerrar={() => setEditor(null)}>
      <EditorTrabajo key={`${editor.id}:${editor.version}`} trabajo={editor} actual={actual} equipo={equipo} usuario={usuario} onGuardar={onGuardar} onAsignar={onAsignar}
        onCerrar={() => setEditor(null)} onActualizar={async () => { const datos = await onActualizar(); const filas=datos.trabajos || []; const nuevo=filas.find((t) => t.id === editor.id); if (nuevo) setEditor(nuevo); else setEditor(null); }} />
    </Modal>}
  </section>;
}

function EditorTrabajo({ trabajo, actual, equipo, usuario, onGuardar, onAsignar, onCerrar, onActualizar }) {
  const [detalle, setDetalle] = useState(trabajo.detalle_trabajo);
  const [estado, setEstado] = useState(trabajo.estado_trabajo);
  const [responsable, setResponsable] = useState(trabajo.responsable_id || '');
  const [confirmar, setConfirmar] = useState(false);
  const cerrado = trabajo.estado_trabajo === 'entregado' || ['entregado','cancelado'].includes(trabajo.estado_pedido);
  const cambio = !actual || actual.version !== trabajo.version;
  async function guardar(e) {
    e.preventDefault();
    if (estado === 'entregado' && !confirmar) { setConfirmar(true); return; }
    if (await onGuardar({p_item:trabajo.id,p_version:trabajo.version,p_detalle:detalle.trim(),p_estado:estado})) onCerrar();
  }
  return <>
    <div className="pedido-meta"><EstadoTrabajo trabajo={trabajo} /><span>Responsable: {trabajo.responsable || 'Sin asignar'}</span></div>
    {trabajo.comentario_cliente && <section className="pedido-nota"><h3>Comentario inicial del cliente</h3><p>{trabajo.comentario_cliente}</p></section>}
    {cambio && <p className="modal__advertencia" role="alert">Este trabajo cambió o ya no está asignado a tu cuenta. Actualizá antes de guardar. Se reemplazará tu borrador. <button className="secundario" onClick={() => onActualizar().catch(() => {})}>Actualizar detalle</button></p>}
    {onAsignar && !cerrado && <form className="trabajo-asignacion" onSubmit={async (e) => { e.preventDefault(); if(await onAsignar({p_item:trabajo.id,p_version:trabajo.version,p_responsable:responsable || null})) onCerrar(); }}>
      <label>Asignar responsable<select value={responsable} onChange={(e) => setResponsable(e.target.value)} disabled={cambio}>
        <option value="">Sin asignar</option>{equipo.filter((p) => p.rol === 'admin' || p.estado === 'activa' || p.id === trabajo.responsable_id).map((p) => <option key={p.id} value={p.id} disabled={p.rol === 'empleado' && p.estado !== 'activa'}>{p.nombre}{p.id === usuario.id ? ' (yo)' : p.rol === 'admin' ? ' (superadmin)' : p.estado !== 'activa' ? ' (inactivo)' : ''}</option>)}
      </select></label>
      <div className="modal__acciones"><button type="button" className="secundario editar" disabled={cambio} onClick={async () => { if(await onAsignar({p_item:trabajo.id,p_version:trabajo.version,p_responsable:usuario.id})) onCerrar(); }}>Asignarme este servicio</button><button disabled={cambio} type="submit">Guardar responsable</button></div>
    </form>}
    <form className="formulario trabajo-editor" onSubmit={guardar}>
      <label>Detalle acordado con el cliente<textarea rows="7" maxLength={10000} disabled={cerrado || cambio} value={detalle} onChange={(e) => {setDetalle(e.target.value);setConfirmar(false);}} placeholder="Registrá lo acordado en la reunión o los mensajes: objetivo, entregables, materiales y alcance." /></label>
      <p className="suave">Visible para el cliente. No incluyas notas internas. Las modificaciones quedan auditadas.</p>
      {!cerrado && <label>Estado del servicio<select value={estado} disabled={cambio} onChange={(e) => {setEstado(e.target.value);setConfirmar(false);}}><option value="pendiente">Pendiente</option><option value="en_produccion">En producción</option><option value="entregado" disabled={!trabajo.revisado_at}>Entregado</option></select></label>}
      {!trabajo.revisado_at && !cerrado && <p className="modal__advertencia">El superadmin debe confirmar la revisión del pedido antes de entregar sus servicios.</p>}
      {trabajo.entregado_at && <p className="pedido-revisado">Entregado el {fecha(trabajo.entregado_at)}</p>}
      {confirmar && <p className="modal__advertencia" role="alert">¿Confirmás que este servicio ya fue entregado? Se liberan {trabajo.costo_creditos} créditos de capacidad y se informa al cliente. La entrega no se puede deshacer desde este panel.</p>}
      <div className="modal__acciones"><button type="button" className="secundario" onClick={onCerrar}>Cerrar</button>{!cerrado && <button disabled={cambio || (estado === 'entregado' && !detalle.trim())} className={estado === 'entregado' ? 'positivo' : ''} type="submit">{estado === 'entregado' ? confirmar ? 'Confirmar entrega del servicio' : 'Revisar entrega del servicio' : 'Guardar detalle y estado'}</button>}</div>
    </form>
  </>;
}
