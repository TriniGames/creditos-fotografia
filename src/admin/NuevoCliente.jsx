import Modal from '../shared/Modal.jsx';

export default function NuevoCliente({ crearCliente, ocupado, onCerrar }) {
  async function guardar(e) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    if (await crearCliente(datos)) onCerrar();
  }

  return <Modal titulo="Nuevo cliente" detalle="Creá su acceso. La cuenta comienza sin créditos."
    ocupado={ocupado} onCerrar={onCerrar}>
    <form className="formulario" onSubmit={guardar}>
      <label>Usuario <input name="username" pattern="[a-z0-9_.\-]{3,30}" minLength={3} maxLength={30} autoComplete="off" required /></label>
      <label>Nombre <input name="nombre" minLength={2} autoComplete="name" required /></label>
      <label>Marca <input name="marca" minLength={2} autoComplete="organization" required /></label>
      <label>Correo de acceso <input name="email" type="email" autoComplete="off" required /></label>
      <label>Contraseña temporal (mínimo 10) <input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
      <div className="modal__acciones">
        <button type="button" className="secundario" onClick={onCerrar}>Cancelar</button>
        <button type="submit">Crear cliente</button>
      </div>
    </form>
  </Modal>;
}
