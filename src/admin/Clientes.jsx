import { fecha, sumarHoras } from '../shared/format.js';

const pedir = (texto) => {
  const v = window.prompt(texto);
  return v && v.trim() ? v.trim() : null;
};

// Cada acción destructiva pide confirmación y motivo obligatorio.
export default function Clientes({ clientes, accion }) {
  function ampliar(c) {
    const cantidad = pedir('Créditos a agregar:');
    if (!cantidad) return;
    const motivo = pedir('Motivo (obligatorio):');
    if (motivo) accion('agregar_creditos', { p_profile: c.id, p_creditos: Number(cantidad), p_motivo: motivo });
  }

  function darDeBaja(c) {
    if (!window.confirm(`¿Dar de baja a ${c.marca}? Los créditos no usados quedan registrados como perdidos.`)) return;
    const motivo = pedir('Motivo (obligatorio):');
    if (motivo) accion('dar_de_baja', { p_profile: c.id, p_motivo: motivo });
  }

  function reactivar(c) {
    const devolver = pedir('Créditos a devolver (0 si ninguno):');
    if (devolver === null) return;
    const motivo = pedir('Motivo (obligatorio):');
    if (motivo) accion('reactivar', { p_profile: c.id, p_devolver: Number(devolver), p_motivo: motivo });
  }

  function eliminar(c) {
    if (!window.confirm(`Eliminar la cuenta de ${c.marca}. El historial se conserva y el acceso queda bloqueado. ¿Continuar?`)) return;
    const motivo = pedir('Motivo de eliminación (obligatorio):');
    if (motivo) accion('eliminar_cuenta', { p_profile: c.id, p_motivo: motivo });
  }

  return (
    <section>
      <h2>Clientes</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Marca</th>
              <th>Usuario</th>
              <th>Estado</th>
              <th>Saldo</th>
              <th>Plazo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.marca}</td>
                <td>{c.username}</td>
                <td>{c.estado}</td>
                <td>{c.saldo} cr.</td>
                <td>{c.estado === 'activa' && c.plazo_inicio ? fecha(sumarHoras(c.plazo_inicio, c.plazo_horas)) : '—'}</td>
                <td>
                  <button className="secundario" onClick={() => ampliar(c)}>Ampliar</button>
                  <button className="secundario" onClick={() => darDeBaja(c)}>Dar de baja</button>
                  <button className="secundario" onClick={() => reactivar(c)}>Reactivar</button>
                  <button className="secundario" onClick={() => eliminar(c)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
