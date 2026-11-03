import NavegacionPanel from './NavegacionPanel.jsx';

export default function BarraPanel({ titulo, secciones, actual, onCambiar, ocupado, children }) {
  return <aside className="admin-barra panel-global" aria-label={titulo}>
    <div className="panel-global__estado"><strong className="panel-global__titulo">{titulo}</strong>{children}</div>
    <NavegacionPanel secciones={secciones} actual={actual} onCambiar={onCambiar} ocupado={ocupado} />
  </aside>;
}
