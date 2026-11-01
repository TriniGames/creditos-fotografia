import { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { useOperacion } from '../shared/useOperacion.js';
import { mensajeError } from '../shared/errores.js';
import { fecha } from '../shared/format.js';
import Clientes from './Clientes.jsx';
import PlanesPagos from './PlanesPagos.jsx';
import NuevoCliente from './NuevoCliente.jsx';
import Catalogo from './Catalogo.jsx';
import Toast from '../shared/Toast.jsx';
import Pendientes from './Pendientes.jsx';
import CabeceraSesion from '../shared/CabeceraSesion.jsx';

const CONFIRMACIONES = {
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
};

export default function Admin() {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  const [seccion, setSeccion] = useState('clientes');
  const [bandeja, setBandeja] = useState(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const { ejecutar, ocupado, aviso, historial, cerrarAviso } = useOperacion();

  // Recarga el resumen. Al consultarlo el servidor también genera avisos nuevos.
  const cargar = useCallback(async () => {
    try {
      setEstado(await api('/api/admin/resumen'));
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
      throw e;
    }
  }, []);

  useEffect(() => {
    cargar().catch(() => {});
  }, [cargar]);

  const accion = (nombre, datos) => ejecutar('/api/admin/accion', { accion: nombre, datos }, cargar, CONFIRMACIONES[nombre]);
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
      <CabeceraSesion titulo="Panel de administración" />

      <Toast aviso={aviso || (error ? { texto: error, tipo: 'error' } : null)}
        onCerrar={() => { cerrarAviso(); setError(null); }} />
      <div className="admin-barra">
        <nav className="admin-secciones" aria-label="Secciones del panel">
          {[['clientes','Clientes'],['gestion','Planes y pagos'],['catalogo','Catálogo'],['pedidos','Pedidos']].map(([id,texto]) =>
            <button key={id} className="admin-seccion" aria-pressed={seccion === id} disabled={ocupado} onClick={() => setSeccion(id)}>{texto}</button>)}
        </nav>
        <nav className="admin-pendientes" aria-label="Notificaciones y pendientes">
          <button className={`bandeja-boton ${estado.pagos.length ? 'bandeja-boton--atencion' : ''}`} disabled={ocupado} onClick={() => setBandeja('pagos')}>
            Pagos por aprobar <span className="contador">{estado.pagos.length}</span>
          </button>
          <button className={`bandeja-boton ${estado.avisos.length ? 'bandeja-boton--atencion' : ''}`} disabled={ocupado} onClick={() => setBandeja('avisos')}>
            Avisos <span className="contador">{estado.avisos.length}</span>
          </button>
          <button className="bandeja-boton" disabled={ocupado} onClick={() => setBandeja('actividad')}>Actividad <span className="contador">{historial.length}</span></button>
        </nav>
        {ocupado && <p className="admin-progreso" role="status">Guardando cambios…</p>}
      </div>
      {bandeja && <Pendientes vista={bandeja} cambiarVista={setBandeja} estado={estado} historial={historial}
        marcaDe={marcaDe} accion={accion} ocupado={ocupado} onCerrar={() => setBandeja(null)} />}
      {altaAbierta && <NuevoCliente crearCliente={crearCliente} ocupado={ocupado} onCerrar={() => setAltaAbierta(false)} />}
      <fieldset disabled={ocupado} aria-busy={ocupado}>
      {seccion === 'clientes' && <>
        <div className="seccion-intro"><p className="suave">Gestioná los datos, el saldo y el estado de tus clientes.</p><button onClick={() => setAltaAbierta(true)}>+ Nuevo cliente</button></div>
        <Clientes clientes={estado.clientes} accion={accion} ocupado={ocupado} />
      </>}
      {seccion === 'gestion' && <PlanesPagos estado={estado} marcaDe={marcaDe} accion={accion} />}
      {seccion === 'catalogo' && <Catalogo estado={estado} accion={accion} ocupado={ocupado} />}
      {seccion === 'pedidos' && <section>
        <h2>Pedidos de clientes</h2>
        {!estado.pedidos.length ? <p className="suave">Todavía no hay pedidos.</p> :
          <ul className="lista">{estado.pedidos.map((p) => <li key={p.id}>
            <strong>{marcaDe(p.profile_id)}</strong> · {fecha(p.created_at)} · {p.total_creditos} créditos · {p.estado}
            <div>{p.order_items.map((i) => i.nombre).join(', ')}</div>
          </li>)}</ul>}
      </section>}
      </fieldset>
    </main>
  );
}
