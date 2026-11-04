import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../shared/api.js';
import { useOperacion } from '../shared/useOperacion.js';
import { mensajeError } from '../shared/errores.js';
import Clientes from './Clientes.jsx';
import PlanesPagos from './PlanesPagos.jsx';
import NuevoCliente from './NuevoCliente.jsx';
import Catalogo from './Catalogo.jsx';
import Capacidad from './Capacidad.jsx';
import EquipoAdmin from './EquipoAdmin.jsx';
import Trabajos from '../shared/Trabajos.jsx';
import Toast from '../shared/Toast.jsx';
import Pendientes from './Pendientes.jsx';
import CabeceraSesion from '../shared/CabeceraSesion.jsx';
import Pedidos from '../shared/Pedidos.jsx';
import BarraPanel from '../shared/BarraPanel.jsx';
import { useAutoActualizar } from '../shared/useAutoActualizar.js';

const CONFIRMACIONES = {
  guardar_empleado:'Empleado actualizado.',
  asignar_trabajo:'Responsable del servicio actualizado.',
  actualizar_trabajo:'Detalle y estado del servicio actualizados. El cliente ya puede verlos.',
  guardar_capacidad: 'Topes de capacidad guardados.',
  guardar_limite_cliente: 'Límite del cliente actualizado.',
  entregar_pedido: 'Pedido marcado como entregado. Se liberó su capacidad pendiente.',
  modificar_cliente: 'Datos del cliente actualizados.',
  guardar_catalogo: 'Catálogo actualizado.',
  crear_plan_mensual: 'Plan mensual creado. Ya podés registrar el pago.',
  registrar_pago: 'Pago registrado. Quedó pendiente de aprobación.',
  aprobar_pago_y_activar: 'Pago aprobado y cuenta activada. Los créditos ya están disponibles.',
  agregar_creditos: 'Créditos agregados al cliente.',
  dar_de_baja: 'Cliente dado de baja. El historial se conserva.',
  reactivar: 'Cuenta reactivada. El cliente tiene 24 horas para elegir servicios.',
  eliminar_cuenta: 'Cuenta eliminada y acceso bloqueado. El historial se conserva.',
  marcar_notificacion_leida: 'Aviso marcado como leído.',
  revisar_pedido: 'Pedido marcado como revisado. El cliente ya puede verlo en su cuenta.',
};

export default function Admin() {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  const [seccion, setSeccion] = useState('clientes');
  const [bandeja, setBandeja] = useState(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [pedidoAbierto, setPedidoAbierto] = useState(null);
  const [trabajoAbierto,setTrabajoAbierto]=useState(null);
  const [errorPedidos, setErrorPedidos] = useState(null);
  const conocidos = useRef(new Set());
  const revisionPedidos = useRef(0);
  const { ejecutar, ocupado, aviso, historial, notificar, cerrarAviso } = useOperacion();

  // Recarga el resumen. Al consultarlo el servidor también genera avisos nuevos.
  const cargar = useCallback(async () => {
    revisionPedidos.current += 1;
    try {
      const resumen = await api('/api/admin/resumen');
      resumen.pedidos.forEach((p) => conocidos.current.add(p.id));
      setEstado(resumen);
      setError(null);
      return resumen;
    } catch (e) {
      setError(mensajeError(e));
      throw e;
    }
  }, []);

  useEffect(() => {
    cargar().catch(() => {});
  }, [cargar]);

  useAutoActualizar(async () => {
    const revision = revisionPedidos.current;
    try {
      const [pedidos,trabajos] = await Promise.all([api('/api/admin/pedidos'),api('/api/admin/trabajos')]);
      const resumen={...pedidos,...trabajos};
      if (revision !== revisionPedidos.current) return;
      const nuevos = resumen.pedidos.filter((p) => !conocidos.current.has(p.id) && !p.revisado_at && p.estado !== 'cancelado');
      resumen.pedidos.forEach((p) => conocidos.current.add(p.id));
      setEstado((prev) => ({ ...prev, ...resumen }));
      setErrorPedidos(null);
      if (nuevos.length) {
        // El descuento también debe verse en la tabla de clientes al recibir el pedido.
        await cargar().catch(() => {});
        notificar(nuevos.length === 1 ? `Nuevo pedido de ${nuevos[0].profiles?.marca || 'un cliente'}. Abrí Pedidos nuevos para revisarlo.` : `Llegaron ${nuevos.length} pedidos nuevos. Abrí la bandeja para revisarlos.`, 'advertencia');
      }
    } catch {
      if (revision === revisionPedidos.current) setErrorPedidos('No se pudieron actualizar pedidos y trabajos. Se reintentará automáticamente.');
    }
  }, { habilitado: Boolean(estado) && !ocupado && !altaAbierta });

  function verPedido(id) {
    setBandeja(null);
    setSeccion('pedidos');
    setPedidoAbierto(id);
  }

  const accion = (nombre, datos) => ejecutar('/api/admin/accion', { accion: nombre, datos }, cargar, CONFIRMACIONES[nombre]);
  const crearEmpleado = (datos) => ejecutar('/api/admin/crear-empleado',datos,cargar,'Empleado creado. Ya puede ingresar al panel de trabajo.');
  const crearCliente = (datos) => ejecutar('/api/admin/crear-cliente', datos, cargar, 'Cliente creado. Ya puede ingresar con sus credenciales.');

  if (!estado) {
    return (
      <main className="tarjeta ancha admin-panel">
        <p>{error ?? 'Cargando…'}</p>
      </main>
    );
  }

  const marcaDe = (id) => estado.clientes.find((c) => c.id === id)?.marca ?? '—';

  return (
    <main className="tarjeta ancha admin-panel">
      <CabeceraSesion titulo="Panel de superadministración" />

      <Toast aviso={aviso || (error ? { texto: error, tipo: 'error' } : null)}
        onCerrar={() => { cerrarAviso(); setError(null); }} />
      <BarraPanel titulo="Centro de notificaciones" actual={seccion} onCambiar={setSeccion} ocupado={ocupado} secciones={[
          {id:'clientes',texto:'Clientes'},{id:'gestion',texto:'Planes y pagos'},{id:'catalogo',texto:'Catálogo'},
          {id:'pedidos',texto:'Pedidos',contador:estado.pedidos_nuevos},{id:'trabajos',texto:'Trabajos'},{id:'equipo',texto:'Equipo'},{id:'capacidad',texto:'Capacidad'},
        ]} >
        <nav className="admin-pendientes" aria-label="Notificaciones y pendientes">
          <button className={`bandeja-boton ${estado.pedidos_nuevos ? 'bandeja-boton--atencion' : ''}`} disabled={ocupado} onClick={() => setBandeja('pedidos')}>
            Pedidos nuevos <span className="contador">{estado.pedidos_nuevos}</span>
          </button>
          <button className={`bandeja-boton ${estado.pagos.length ? 'bandeja-boton--atencion' : ''}`} disabled={ocupado} onClick={() => setBandeja('pagos')}>
            Pagos por aprobar <span className="contador">{estado.pagos.length}</span>
          </button>
          <button className={`bandeja-boton ${estado.avisos.length ? 'bandeja-boton--atencion' : ''}`} disabled={ocupado} onClick={() => setBandeja('avisos')}>
            Avisos <span className="contador">{estado.avisos.length}</span>
          </button>
          <button className="bandeja-boton" disabled={ocupado} onClick={() => setBandeja('actividad')}>Actividad <span className="contador">{historial.length}</span></button>
        </nav>
        {ocupado && <p className="admin-progreso" role="status">Guardando cambios…</p>}
        {errorPedidos && <p className="admin-progreso error" role="status">{errorPedidos}</p>}
      </BarraPanel>
      {bandeja && <Pendientes vista={bandeja} cambiarVista={setBandeja} estado={estado} historial={historial}
        marcaDe={marcaDe} accion={accion} ocupado={ocupado} onCerrar={() => setBandeja(null)} onVerPedido={verPedido} />}
      {altaAbierta && <NuevoCliente crearCliente={crearCliente} ocupado={ocupado} onCerrar={() => setAltaAbierta(false)} />}
      <fieldset disabled={ocupado} aria-busy={ocupado}>
      {seccion === 'clientes' && <>
        <div className="seccion-intro"><p className="suave">Gestioná los datos, el saldo y el estado de tus clientes.</p><button onClick={() => setAltaAbierta(true)}>+ Nuevo cliente</button></div>
        <Clientes clientes={estado.clientes} accion={accion} ocupado={ocupado} />
      </>}
      {seccion === 'equipo' && <EquipoAdmin equipo={estado.equipo} ocupado={ocupado} crearEmpleado={crearEmpleado} accion={accion} />}
      {seccion === 'trabajos' && <Trabajos trabajos={estado.trabajos} equipo={estado.equipo} ocupado={ocupado} onActualizar={cargar}
        abrirId={trabajoAbierto} onAbierto={setTrabajoAbierto} onAsignar={(b)=>accion('asignar_trabajo',b)} onGuardar={(b)=>accion('actualizar_trabajo',b)} />}
      {seccion === 'gestion' && <PlanesPagos estado={estado} marcaDe={marcaDe} accion={accion} />}
      {seccion === 'capacidad' && <Capacidad capacidad={estado.capacidad} clientes={estado.clientes} accion={accion} ocupado={ocupado} />}
      {seccion === 'catalogo' && <Catalogo estado={estado} accion={accion} ocupado={ocupado} />}
      {seccion === 'pedidos' && <section>
        <h2>Pedidos de clientes</h2>
        <div className="resumen-pedidos"><strong>{estado.pedidos_nuevos} {estado.pedidos_nuevos === 1 ? 'pendiente' : 'pendientes'} de revisión</strong><span>Se muestran hasta 50 pedidos, con prioridad para los pendientes.</span></div>
        <Pedidos pedidos={estado.pedidos} marcaDe={marcaDe} ocupado={ocupado} abierto={pedidoAbierto} onAbrir={setPedidoAbierto}
          onRevisar={(id,comentario) => accion('revisar_pedido',{p_order:id,p_comentario:comentario})}
          onGestionar={(id) => {setPedidoAbierto(null);setTrabajoAbierto(id);setSeccion('trabajos');}} />
      </section>}
      </fieldset>
    </main>
  );
}
