const COLORES = { positivo: 'verde', advertencia: 'amarillo', peligro: 'rojo', neutro: '' };

export default function EstadoBadge({ variante = 'neutro', children }) {
  const color = COLORES[variante];
  return <span className={`estado-badge${color ? ` estado-badge--${color}` : ''}`}>{children}</span>;
}
