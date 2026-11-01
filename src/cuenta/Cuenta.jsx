import { useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { mensajeError } from '../shared/errores.js';
import { fecha } from '../shared/format.js';
import { useOperacion } from '../shared/useOperacion.js';
import Toast from '../shared/Toast.jsx';
import CabeceraSesion from '../shared/CabeceraSesion.jsx';

const ESTADOS = {
  sin_creditos: 'Pendiente de pago',
  activa: 'Activa',
  dada_de_baja: 'Dada de baja',
};
const TIPOS = {
  acreditacion: 'Acreditación',
  ampliacion: 'Ampliación',
  consumo: 'Consumo',
  vencimiento: 'Vencimiento',
  perdida: 'Pérdida',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
};

export default function Cuenta() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const { ejecutar, ocupado, aviso, cerrarAviso } = useOperacion();

  useEffect(() => {
    api('/api/cuenta').then(setDatos).catch((e) => setError(mensajeError(e)));
  }, []);

  async function confirmar(e) {
    e.preventDefault();
    await ejecutar('/api/cuenta/pedido', { servicios: [...seleccion].sort() }, async () => {
      setSeleccion([]);
      setDatos(await api('/api/cuenta'));
    }, 'Pedido confirmado. Los créditos se descontaron y tu pedido ya está registrado.');
  }

  if (!datos) {
    return (
      <main className="tarjeta ancha">
        <p>{error ?? 'Cargando…'}</p>
      </main>
    );
  }

  const total = datos.servicios.filter((s) => seleccion.includes(s.id)).reduce((sum, s) => sum + s.costo_creditos, 0);
  const plazoVencido = !datos.plazo_fin || new Date(datos.plazo_fin).getTime() <= Date.now();
  const puedePedir = datos.estado === 'activa' && !plazoVencido;
  return (
    <main className="tarjeta ancha">
      <CabeceraSesion titulo={datos.marca} />
      <p className="suave">{ESTADOS[datos.estado] ?? datos.estado}</p>
      <Toast aviso={aviso} onCerrar={cerrarAviso} />

      <section>
        <h2>Saldo disponible</h2>
        <p className="numero">{datos.saldo} créditos</p>
        {datos.estado === 'activa' && datos.plazo_fin && (
          <p className="aviso">Elegí tus servicios antes del {fecha(datos.plazo_fin)}.</p>
        )}
      </section>

      <section>
        <h2>Elegí tus servicios</h2>
        {!puedePedir && <p className="aviso">{datos.estado === 'activa' ? 'El plazo de selección venció. Contactá al administrador.' : 'Tu cuenta debe estar activa para confirmar un pedido.'}</p>}
        <form onSubmit={confirmar}>
          <fieldset disabled={ocupado || !puedePedir}>
            {!datos.servicios.length && <p>No hay servicios disponibles.</p>}
            {datos.servicios.map((s) => <label className="opcion" key={s.id}>
              <input type="checkbox" checked={seleccion.includes(s.id)} onChange={(e) => setSeleccion((prev) => e.target.checked ? [...prev,s.id] : prev.filter((id) => id !== s.id))} />
              <span>{s.nombre} · {s.costo_creditos} créditos{s.descripcion && <span className="suave"> · {s.descripcion}</span>}</span>
            </label>)}
            <p>Total: <strong>{total} créditos</strong>. Saldo luego del pedido: {datos.saldo - total} créditos.</p>
            {total > datos.saldo && <p className="error">El saldo no alcanza para esta selección.</p>}
            <button type="submit" disabled={!seleccion.length || total > datos.saldo}>{ocupado ? 'Confirmando…' : 'Confirmar pedido y descontar créditos'}</button>
          </fieldset>
        </form>
      </section>

      <section>
        <h2>Mis pedidos</h2>
        {!datos.pedidos.length ? <p className="suave">Todavía no confirmaste pedidos.</p> :
          <ul className="lista">{datos.pedidos.map((p) => <li key={p.id}>
            {fecha(p.created_at)} · {p.total_creditos} créditos · {p.estado}
            <div>{p.order_items.map((i) => `${i.nombre} (${i.costo_creditos} cr.)`).join(', ')}</div>
          </li>)}</ul>}
      </section>

      <section>
        <h2>Plan del mes</h2>
        <p>
          {datos.plan
            ? `${datos.plan.periodo} · ${datos.plan.creditos} créditos · ciclo hasta ${fecha(datos.plan.ciclo_fin)}`
            : 'Sin plan activo.'}
        </p>
      </section>

      <section>
        <h2>Movimientos</h2>
        {datos.movimientos.length === 0 ? (
          <p className="suave">Todavía no hay movimientos.</p>
        ) : (
          <ul className="lista">
            {datos.movimientos.map((m) => (
              <li key={m.id}>
                {fecha(m.created_at)} · {TIPOS[m.tipo] ?? m.tipo} · {m.cantidad > 0 ? '+' : ''}{m.cantidad}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
