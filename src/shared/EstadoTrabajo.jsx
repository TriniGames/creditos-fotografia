import EstadoBadge from './EstadoBadge.jsx';
export default function EstadoTrabajo({ trabajo }) {
  const estado = trabajo.estado_pedido === 'cancelado' ? 'cancelado' : trabajo.estado_trabajo;
  return <EstadoBadge variante={estado === 'entregado' ? 'positivo' : estado === 'cancelado' ? 'peligro' : 'advertencia'}>
    {{pendiente:'Pendiente',en_produccion:'En producción',entregado:'Entregado',cancelado:'Cancelado'}[estado] || 'Pendiente'}
  </EstadoBadge>;
}
