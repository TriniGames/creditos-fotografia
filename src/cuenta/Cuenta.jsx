import { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { mensajeError } from '../shared/errores.js';
import { fecha } from '../shared/format.js';
import { useOperacion } from '../shared/useOperacion.js';
import { useAutoActualizar } from '../shared/useAutoActualizar.js';
import Toast from '../shared/Toast.jsx';
import CabeceraSesion from '../shared/CabeceraSesion.jsx';
import BarraPanel from '../shared/BarraPanel.jsx';
import EstadoBadge from '../shared/EstadoBadge.jsx';
import Tabla from '../shared/Tabla.jsx';
import Modal from '../shared/Modal.jsx';
import Pedidos, { EstadoPedido, referenciaPedido } from '../shared/Pedidos.jsx';

const ESTADOS = { sin_creditos: 'Pendiente de activación', activa: 'Activa', dada_de_baja: 'De baja' };
const TIPOS = { acreditacion:'Acreditación',ampliacion:'Ampliación',consumo:'Consumo',vencimiento:'Vencimiento',perdida:'Pérdida',devolucion:'Devolución',ajuste:'Ajuste' };

export default function Cuenta() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [seccion, setSeccion] = useState('resumen');
  const [seleccion, setSeleccion] = useState([]);
  const [confirmacion, setConfirmacion] = useState(false);
  const [comentario, setComentario] = useState('');
  const [pedidoAbierto, setPedidoAbierto] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  const { ejecutar, ocupado, aviso, cerrarAviso } = useOperacion();

  const cargar = useCallback(async () => {
    try {
      const cuenta = await api('/api/cuenta');
      setDatos(cuenta);
      setError(null);
      setAhora(Date.now());
      setSeleccion((prev) => prev.filter((id) => cuenta.servicios.some((s) => s.id === id)));
      return cuenta;
    } catch (e) {
      setError(mensajeError(e));
      throw e;
    }
  }, []);

  useEffect(() => { cargar().catch(() => {}); }, [cargar]);
  useEffect(() => {
    const timer = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useAutoActualizar(cargar, { habilitado: Boolean(datos) && !ocupado && !confirmacion, intervalo: 30000 });

  async function confirmarPedido(e) {
    e.preventDefault();
    await ejecutar('/api/cuenta/pedido', { servicios: [...seleccion].sort(), comentario: comentario.trim() }, async ({ resultado }) => {
      setConfirmacion(false);
      setSeleccion([]);
      setComentario('');
      await cargar();
      setSeccion('pedidos');
      setPedidoAbierto(resultado.order_id);
    }, 'Pedido enviado al equipo. Los créditos se descontaron y el administrador recibió el aviso.');
  }

  if (!datos) return <main className="tarjeta ancha admin-panel">
    <CabeceraSesion titulo="Mi cuenta" />
    <p role={error ? 'alert' : 'status'}>{error || 'Cargando tu cuenta…'}</p>
    {error && <button onClick={() => cargar().catch(() => {})}>Reintentar</button>}
  </main>;

  const servicios = datos.servicios.filter((s) => seleccion.includes(s.id));
  const total = servicios.reduce((sum,s) => sum + s.costo_creditos,0);
  const plazoVencido = !datos.plazo_fin || new Date(datos.plazo_fin).getTime() <= ahora;
  const puedePedir = datos.estado === 'activa' && !plazoVencido;
  const alcanza = total <= datos.saldo;
  const hayCapacidad = datos.capacidad.disponible === null || total <= datos.capacidad.disponible;
  const ultimo = datos.pedidos[0];

  return <main className="tarjeta ancha admin-panel cuenta-panel">
    <CabeceraSesion titulo={datos.marca} />
    <Toast aviso={aviso} onCerrar={cerrarAviso} />
    <BarraPanel titulo="Estado de tu cuenta" actual={seccion} onCambiar={setSeccion} ocupado={ocupado} secciones={[
        {id:'resumen',texto:'Resumen'},{id:'servicios',texto:'Elegir servicios'},
        {id:'pedidos',texto:'Mis pedidos',contador:datos.pedidos.length},{id:'movimientos',texto:'Movimientos'},
      ]} >
      <div className="cuenta-barra-info">
        <EstadoBadge variante={datos.estado === 'activa' ? 'positivo' : 'advertencia'}>{ESTADOS[datos.estado] || datos.estado}</EstadoBadge>
        <span><strong>{datos.saldo}</strong> créditos disponibles</span>
        {servicios.length > 0 && <button className="secundario editar" disabled={ocupado} onClick={() => setSeccion('servicios')}>Tu selección: {servicios.length} {servicios.length === 1 ? 'servicio' : 'servicios'}</button>}
        <button className="secundario" disabled={ocupado} onClick={() => cargar().catch(() => {})}>Actualizar</button>
      </div>
      {error && <p className="error" role="status">No pudimos actualizar tu cuenta. Reintentaremos automáticamente.</p>}
    </BarraPanel>

    {seccion === 'resumen' && <section>
      <h2>Resumen de tu cuenta</h2>
      <div className="cuenta-resumen-grid">
        <article className="resumen-card"><span>Saldo disponible</span><strong className="numero">{datos.saldo} cr.</strong><small>Para contratar tus servicios</small></article>
        <article className="resumen-card"><span>Plazo para elegir</span><strong>{datos.estado === 'activa' && datos.plazo_fin ? (plazoVencido ? 'Plazo vencido' : fecha(datos.plazo_fin)) : 'Sin plazo activo'}</strong><small>{datos.estado === 'activa' ? 'Confirmá tu selección antes de esta fecha' : 'Comienza al activar tu cuenta'}</small></article>
        <article className="resumen-card"><span>Plan actual</span><strong>{datos.plan ? `${datos.plan.creditos} créditos` : 'Sin plan activo'}</strong><small>{datos.plan ? `Ciclo hasta ${fecha(datos.plan.ciclo_fin)}` : 'El administrador gestiona tu plan y pago'}</small></article>
      </div>
      <div className={`cuenta-siguiente ${puedePedir ? '' : 'cuenta-siguiente--aviso'}`}>
        <div><h3>{puedePedir ? '¿Qué servicios necesitás?' : datos.estado === 'activa' ? 'Tu plazo de selección venció' : datos.estado === 'dada_de_baja' ? 'Tu cuenta está dada de baja' : 'Tu cuenta está pendiente de activación'}</h3>
          <p>{puedePedir ? 'Elegí los servicios, revisá el total y confirmá. El equipo recibe un aviso con tu pedido.' : datos.estado === 'dada_de_baja' ? 'Contactá al administrador para revisar la reactivación de tu cuenta.' : datos.estado === 'activa' ? 'Contactá al administrador para revisar tu plazo.' : 'Cuando el administrador apruebe tu pago, verás los créditos y podrás elegir servicios.'}</p></div>
        <button type="button" className={puedePedir ? 'positivo' : 'secundario'} onClick={() => setSeccion(puedePedir ? 'servicios' : 'pedidos')}>{puedePedir ? 'Elegir servicios' : 'Ver mis pedidos'}</button>
      </div>
      {ultimo && <article className="ultimo-pedido">
        <div><EstadoPedido pedido={ultimo} /><h3>Tu último pedido {referenciaPedido(ultimo.id)}</h3>
          <p>{ultimo.total_creditos} créditos · {fecha(ultimo.created_at)}</p>
          <p>{ultimo.estado === 'cancelado' ? 'Este pedido está cancelado.' : ultimo.revisado_at ? 'El equipo ya revisó tu pedido.' : 'El equipo recibió el aviso. Está pendiente de revisión.'}</p></div>
        <button className="secundario editar" onClick={() => { setSeccion('pedidos'); setPedidoAbierto(ultimo.id); }}>Ver detalle</button>
      </article>}
    </section>}

    {seccion === 'servicios' && <section>
      <h2>Elegí tus servicios</h2>
      <p className="capacidad-aviso">Trabajos pendientes: <strong>{datos.capacidad.pendiente} créditos</strong>{datos.capacidad.max_cliente !== null && <> · Tu límite: {datos.capacidad.max_cliente} créditos</>}. {datos.capacidad.disponible !== null ? <>Podés sumar hasta <strong>{datos.capacidad.disponible} créditos</strong> con la capacidad actual.</> : 'La capacidad no tiene un tope configurado.'} Se libera al entregar los pedidos.</p>
      <p className="suave">Seleccioná lo que necesitás. Antes de enviar el pedido vas a poder revisar los créditos a utilizar.</p>
      {!puedePedir && <p className="modal__advertencia">{datos.estado === 'activa' ? 'Tu plazo venció. Contactá al administrador antes de confirmar.' : 'Tu cuenta debe estar activa para confirmar un pedido.'}</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (puedePedir && servicios.length && alcanza && hayCapacidad) setConfirmacion(true); }}>
        <fieldset disabled={ocupado || !puedePedir}>
          {!datos.servicios.length && <p className="estado-vacio">Todavía no hay servicios disponibles.</p>}
          <div className="servicios-grid">{datos.servicios.map((s) => <article className={`servicio-card ${seleccion.includes(s.id) ? 'servicio-card--seleccionado' : ''}`} key={s.id}>
            <label className="servicio-eleccion"><input type="checkbox" checked={seleccion.includes(s.id)} onChange={(e) => setSeleccion((prev) => e.target.checked ? [...prev,s.id] : prev.filter((id) => id !== s.id))} />
            <span><strong>{s.nombre}</strong><span className="servicio-costo">{s.costo_creditos} créditos</span></span></label>
            {s.descripcion && <details className="servicio-detalle"><summary>Ver detalle del servicio</summary><p>{s.descripcion}</p></details>}
          </article>)}</div>
          <div className="carrito-resumen">
            <div><strong>{servicios.length} {servicios.length === 1 ? 'servicio seleccionado' : 'servicios seleccionados'} · {total} créditos</strong><p>Saldo después del pedido: {datos.saldo - total} créditos.</p>
              {!hayCapacidad && <p className="error" role="alert">La selección supera la capacidad disponible. Elegí menos servicios o consultá al equipo.</p>}
              {!alcanza && <p className="error" role="alert">Tu saldo no alcanza para esta selección.</p>}</div>
            <button type="submit" className="positivo" disabled={!servicios.length || !alcanza || !hayCapacidad}>Revisar y confirmar pedido</button>
          </div>
        </fieldset>
      </form>
    </section>}

    {seccion === 'pedidos' && <section><h2>Mis pedidos</h2>
      <Pedidos pedidos={datos.pedidos} ocupado={ocupado} abierto={pedidoAbierto} onAbrir={setPedidoAbierto} />
    </section>}

    {seccion === 'movimientos' && <section><h2>Movimientos de créditos</h2>
      <p className="suave">Últimos 30 movimientos de tu cuenta.</p>
      <Tabla titulo="Movimientos de créditos" datos={datos.movimientos} mensajeVacio="Todavía no hay movimientos." columnas={[
        {id:'created_at',titulo:'Fecha',render:(m) => fecha(m.created_at)},
        {id:'tipo',titulo:'Movimiento',render:(m) => TIPOS[m.tipo] || m.tipo},
        {id:'cantidad',titulo:'Créditos',alineacion:'derecha',render:(m) => <span className={m.cantidad > 0 ? 'credito-entrada' : 'credito-salida'}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</span>},
      ]} />
    </section>}

    {confirmacion && <Modal titulo="Confirmar tu pedido" detalle="El equipo recibirá un aviso y estos créditos se descontarán de tu saldo."
      ocupado={ocupado} onCerrar={() => setConfirmacion(false)}>
      <form onSubmit={confirmarPedido}>
        <ul className="lista pedido-servicios">{servicios.map((s) => <li key={s.id}><span>{s.nombre}</span><strong>{s.costo_creditos} cr.</strong></li>)}</ul>
        <p className="pedido-total">Total <strong>{total} créditos</strong></p>
        <p>Te quedarán {datos.saldo - total} créditos disponibles.</p>
        <label>Comentario para el equipo (opcional)<textarea rows="4" maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Agregá el contexto inicial de tu pedido." /></label>
        <p className="suave">Se envía una sola vez con el pedido. El administrador podrá dejar una respuesta; para continuar la conversación usá el canal habitual con el equipo.</p>
        {!hayCapacidad && <p className="error">La selección supera la capacidad disponible.</p>}
        {!puedePedir && <p className="error">Tu plazo ya venció. Contactá al administrador.</p>}
        <div className="modal__acciones"><button type="button" className="secundario" onClick={() => setConfirmacion(false)}>Volver a la selección</button>
          <button type="submit" className="positivo" disabled={!puedePedir || !servicios.length || !alcanza || !hayCapacidad}>Confirmar y enviar pedido</button></div>
      </form>
    </Modal>}
  </main>;
}
