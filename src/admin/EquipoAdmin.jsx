import { useState } from 'react';
import Modal from '../shared/Modal.jsx';
import Tabla from '../shared/Tabla.jsx';
import EstadoBadge from '../shared/EstadoBadge.jsx';

export default function EquipoAdmin({ equipo, ocupado, crearEmpleado, accion }) {
  const [editor, setEditor] = useState(null);
  const empleados=equipo.filter((p) => p.rol === 'empleado');
  return <section><h2>Equipo de trabajo</h2>
    <p>Los empleados acceden únicamente a sus servicios asignados: pueden cargar el detalle visible para el cliente y confirmar entregas. La asignación queda a cargo del superadmin.</p>
    <button onClick={() => setEditor({nuevo:true})} disabled={ocupado}>+ Nuevo empleado</button>
    <Tabla titulo="Empleados" datos={empleados} ocupado={ocupado} mensajeVacio="Todavía no hay empleados. Los superadmins ya pueden asignarse servicios desde Trabajos." columnas={[
      {id:'nombre',titulo:'Nombre'}, {id:'username',titulo:'Usuario'}, {id:'email',titulo:'Correo de acceso'},
      {id:'estado',titulo:'Acceso',render:(p) => <EstadoBadge variante={p.estado === 'activa' ? 'positivo' : 'advertencia'}>{p.estado === 'activa' ? 'Activo' : 'Inactivo'}</EstadoBadge>},
    ]} acciones={[{id:'editar',texto:'Editar empleado y acceso',icono:'editar',variante:'editar'}]} onAccion={(_,p) => setEditor(p)} />
    {editor && <Modal titulo={editor.nuevo ? 'Nuevo empleado' : 'Editar empleado'} detalle={editor.nuevo ? 'Creá un acceso al panel de trabajo, sin permisos de administración.' : editor.username} ocupado={ocupado} onCerrar={() => setEditor(null)}>
      <form className="formulario" onSubmit={async (e) => { e.preventDefault(); const f=Object.fromEntries(new FormData(e.currentTarget));
        const ok=editor.nuevo ? await crearEmpleado(f) : await accion('guardar_empleado',{p_profile:editor.id,p_nombre:f.nombre,p_activo:f.activo === 'on'});
        if(ok)setEditor(null);
      }}>
        <label>Nombre<input name="nombre" minLength={2} defaultValue={editor.nombre || ''} required /></label>
        {editor.nuevo ? <><label>Usuario<input name="username" pattern="[a-z0-9_.\-]{3,30}" maxLength={30} autoComplete="off" required /></label>
          <label>Correo de acceso<input name="email" type="email" autoComplete="off" required /></label>
          <label>Contraseña de acceso (mínimo 10)<input name="password" type="password" minLength={10} autoComplete="new-password" required /></label></> : <>
          <label className="opcion"><input name="activo" type="checkbox" defaultChecked={editor.estado === 'activa'} />Acceso activo</label>
          <p className="suave">Al desactivarlo se bloquean su ingreso y sus sesiones existentes. Sus servicios se conservan asignados para que puedas reasignarlos desde Trabajos.</p></>}
        <div className="modal__acciones"><button type="button" className="secundario" onClick={() => setEditor(null)}>Cancelar</button><button type="submit">{editor.nuevo ? 'Crear empleado' : 'Guardar empleado'}</button></div>
      </form>
    </Modal>}
  </section>;
}
