import { useCallback, useEffect, useState } from 'react';
import { api, nuevoId } from '../shared/api.js';
import { mensajeError } from '../shared/errores.js';
import { ARS, fecha } from '../shared/format.js';
import Clientes from './Clientes.jsx';
import Formularios from './Formularios.jsx';

export default function Admin() {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);

  // Recarga el resumen. Al consultarlo el servidor también genera avisos nuevos.
  const cargar = useCallback(async () => {
    try {
      setEstado(await api('/api/admin/resumen'));
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Toda acción lleva una clave de idempotencia nueva. Un doble clic no duplica nada.
  const accion = useCallback(
    async (nombre, datos) => {
      try {
        await api('/api/admin/accion', { accion: nombre, datos, idem: nuevoId() });
        await cargar();
      } catch (e) {
        window.alert(mensajeError(e));
      }
    },
    [cargar]
  );

  async function cerrarSesion() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  if (!estado) {
    return (
      <main className="tarjeta ancha">
        <p>{error ?? 'Cargando…'}</p>
      </main>
    );
  }

  const marcaDe = (id) => estado.clientes.find((c) => c.id === id)?.marca ?? '—';

  return (
    <main className="tarjeta ancha">
      <header className="cabecera">
        <h1>Panel de administración</h1>
        <button className="secundario" onClick={cerrarSesion}>Salir</button>
      </header>

      <section>
        <h2>Avisos</h2>
        {estado.avisos.length === 0 ? (
          <p className="suave">Sin avisos pendientes.</p>
        ) : (
          <ul className="lista">
            {estado.avisos.map((a) => (
              <li key={a.id}>
                {a.mensaje}{' '}
                <button className="secundario" onClick={() => accion('marcar_notificacion_leida', { p_id: a.id })}>
                  Marcar leída
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Pagos pendientes de aprobación</h2>
        {estado.pagos.length === 0 ? (
          <p className="suave">Sin pagos pendientes.</p>
        ) : (
          <ul className="lista">
            {estado.pagos.map((p) => (
              <li key={p.id}>
                {p.profiles?.marca ?? marcaDe(p.profile_id)} · {ARS.format(p.monto)} · {p.metodo} · {fecha(p.created_at)}{' '}
                <button
                  className="secundario"
                  onClick={() => {
                    if (window.confirm('¿Confirmás que recibiste el pago? Se acreditan los créditos y empieza el plazo de 48 horas.')) {
                      accion('aprobar_pago_y_activar', { p_payment: p.id });
                    }
                  }}
                >
                  Aprobar y activar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Clientes clientes={estado.clientes} accion={accion} />
      <Formularios estado={estado} marcaDe={marcaDe} accion={accion} recargar={cargar} />
    </main>
  );
}
