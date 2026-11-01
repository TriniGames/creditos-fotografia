import BotonAccion from './BotonAccion.jsx';

const idFila = (fila) => fila.id;

// Presentación solamente: los formularios y las llamadas a la API pertenecen a cada pantalla.
export default function Tabla({ titulo, datos, columnas, acciones = [], onAccion, ocupado = false,
  obtenerId = idFila, mensajeVacio = 'No hay datos para mostrar.' }) {
  const tieneAcciones = acciones.length > 0;
  return <div className="tabla-scroll" role="region" aria-label={titulo} tabIndex={0} aria-busy={ocupado}>
    <table className="tabla">
      <caption className="sr-only">{titulo}</caption>
      <thead><tr>
        {columnas.map((columna) => <th key={columna.id} scope="col" className={columna.alineacion === 'derecha' ? 'tabla__numero' : undefined}>{columna.titulo}</th>)}
        {tieneAcciones && <th scope="col">Acciones</th>}
      </tr></thead>
      <tbody>
        {!datos.length && <tr><td colSpan={columnas.length + Number(tieneAcciones)} className="estado-vacio">{mensajeVacio}</td></tr>}
        {datos.map((fila) => {
          const disponibles = acciones.filter((accion) => !accion.visible || accion.visible(fila));
          return <tr key={obtenerId(fila)}>
            {columnas.map((columna) => <td key={columna.id} className={columna.alineacion === 'derecha' ? 'tabla__numero' : undefined}>
              {columna.render ? columna.render(fila) : (fila[columna.campo ?? columna.id] ?? '—')}
            </td>)}
            {tieneAcciones && <td className="tabla__acciones">
              {!disponibles.length ? <span className="suave">—</span> : ['principal','riesgo'].map((grupo) => {
                const items = disponibles.filter((accion) => (accion.grupo ?? 'principal') === grupo);
                return items.length > 0 && <div key={grupo} className={`tabla-acciones${grupo === 'riesgo' ? ' tabla-acciones--riesgo' : ''}`}>
                  {items.map((accion) => <BotonAccion key={accion.id} variante={accion.variante} icono={accion.icono} compacto={Boolean(accion.icono)}
                    disabled={ocupado || Boolean(accion.deshabilitada?.(fila))}
                    onClick={() => onAccion(accion.id, fila)}>{accion.texto}</BotonAccion>)}
                </div>;
              })}
            </td>}
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}
