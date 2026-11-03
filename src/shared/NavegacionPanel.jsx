export default function NavegacionPanel({ secciones, actual, onCambiar, ocupado = false }) {
  return <nav className="admin-secciones" aria-label="Secciones del panel">
    {secciones.map(({ id, texto, contador }) => <button type="button" key={id} className="admin-seccion"
      aria-pressed={actual === id} disabled={ocupado} onClick={() => onCambiar(id)}>
      {texto}{contador > 0 && <> <span className="contador">{contador}</span></>}
    </button>)}
  </nav>;
}
