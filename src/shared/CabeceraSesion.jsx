import { useSesion } from './SesionContext.jsx';
import { nombreRol } from './roles.js';

export default function CabeceraSesion({ titulo }) {
  const { usuario, cerrarSesion, cerrando, errorSalir } = useSesion();
  const esAdmin = usuario.rol === 'admin';
  const iniciales = usuario.nombre.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase();
  return <header className="cabecera cabecera-sesion">
    <div>
      <span className={`entorno-rol ${esAdmin ? 'entorno-rol--admin' : ''}`}>{esAdmin ? 'Superadministración' : usuario.rol === 'empleado' ? 'Equipo de trabajo' : 'Área de clientes'}</span>
      <h1>{titulo}</h1>
    </div>
    <div className="sesion-actual">
      <span className="sesion-avatar" aria-hidden="true">{iniciales}</span>
      <div className="sesion-identidad">
        <strong>{usuario.nombre}</strong>
        <span>@{usuario.username} · {nombreRol(usuario.rol)}</span>
        <small>{usuario.email}</small>
      </div>
      <button type="button" className="secundario" onClick={cerrarSesion} disabled={cerrando}>
        {cerrando ? 'Cerrando…' : 'Cerrar sesión'}
      </button>
      {errorSalir && <p className="error sesion-error" role="alert">{errorSalir}</p>}
    </div>
  </header>;
}
