import { useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { mensajeError } from '../shared/errores.js';
import { fecha } from '../shared/format.js';

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

  useEffect(() => {
    api('/api/cuenta').then(setDatos).catch((e) => setError(mensajeError(e)));
  }, []);

  async function salir() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  if (!datos) {
    return (
      <main className="tarjeta ancha">
        <p>{error ?? 'Cargando…'}</p>
      </main>
    );
  }

  return (
    <main className="tarjeta ancha">
      <header className="cabecera">
        <h1>{datos.marca}</h1>
        <button className="secundario" onClick={salir}>Salir</button>
      </header>
      <p className="suave">{ESTADOS[datos.estado] ?? datos.estado}</p>

      <section>
        <h2>Saldo disponible</h2>
        <p className="numero">{datos.saldo} créditos</p>
        {datos.estado === 'activa' && datos.plazo_fin && (
          <p className="aviso">Elegí tus servicios antes del {fecha(datos.plazo_fin)}.</p>
        )}
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
            {datos.movimientos.map((m, i) => (
              <li key={i}>
                {fecha(m.created_at)} · {TIPOS[m.tipo] ?? m.tipo} · {m.cantidad > 0 ? '+' : ''}{m.cantidad}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
