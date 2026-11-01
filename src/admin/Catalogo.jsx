import { useState } from 'react';
import { ARS } from '../shared/format.js';
import Modal from '../shared/Modal.jsx';
import Tabla from '../shared/Tabla.jsx';
import EstadoBadge from '../shared/EstadoBadge.jsx';
import BotonAccion from '../shared/BotonAccion.jsx';

export default function Catalogo({ estado, accion, ocupado }) {
  const [editor, setEditor] = useState(null);
  async function guardar(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const ok = await accion('guardar_catalogo', {
      p_tipo: editor.tipo, p_id: editor.item?.id || null, p_nombre: f.nombre.trim(),
      p_valor: Number(f.valor), p_creditos: editor.tipo === 'plan' ? Number(f.creditos) : null,
      p_descripcion: editor.tipo === 'servicio' ? f.descripcion.trim() : null, p_activo: f.activo === 'on',
    });
    if (ok) setEditor(null);
  }
  return <section>
    <h2>Catálogo de planes y servicios</h2>
    <p className="suave">Los cambios se aplican a nuevas compras. Los planes contratados y los pedidos conservan sus valores originales.</p>
    {['plan','servicio'].map((tipo) => <div key={tipo}>
      <h3>{tipo === 'plan' ? 'Planes' : 'Servicios'}</h3>
      <BotonAccion variante="primaria" disabled={ocupado} onClick={() => setEditor({ tipo })}>+ Nuevo {tipo}</BotonAccion>
      <Tabla titulo={tipo === 'plan' ? 'Planes' : 'Servicios'}
        datos={estado[tipo === 'plan' ? 'planes' : 'servicios']} ocupado={ocupado}
        mensajeVacio={tipo === 'plan' ? 'Todavía no hay planes. Creá el primero desde Nuevo plan.' : 'Todavía no hay servicios. Creá el primero desde Nuevo servicio.'}
        columnas={[
          { id: 'nombre', titulo: 'Nombre' },
          ...(tipo === 'plan' ? [
            { id: 'precio_ars', titulo: 'Precio', alineacion: 'derecha', render: (item) => ARS.format(item.precio_ars) },
            { id: 'creditos', titulo: 'Créditos incluidos', alineacion: 'derecha' },
          ] : [
            { id: 'descripcion', titulo: 'Descripción' },
            { id: 'costo_creditos', titulo: 'Costo en créditos', alineacion: 'derecha' },
          ]),
          { id: 'activo', titulo: 'Estado', render: (item) => <EstadoBadge variante={item.activo ? 'positivo' : 'neutro'}>{item.activo ? 'Activo' : 'Inactivo'}</EstadoBadge> },
        ]}
        acciones={[{ id: 'editar', texto: `Editar ${tipo}`, icono: 'editar', variante: 'editar' }]}
        onAccion={(_accion, item) => setEditor({ tipo, item })}
      />
    </div>)}
    {editor && <Modal key={`${editor.tipo}:${editor.item?.id || 'nuevo'}`}
      titulo={`${editor.item ? 'Editar' : 'Nuevo'} ${editor.tipo}`} detalle={editor.item?.nombre}
      ocupado={ocupado} onCerrar={() => setEditor(null)}>
      <form className="formulario" onSubmit={guardar}>
      <label>Nombre <input name="nombre" defaultValue={editor.item?.nombre || ''} minLength={2} required /></label>
      <label>{editor.tipo === 'plan' ? 'Precio en ARS' : 'Costo en créditos'}
        <input name="valor" type="number" min={editor.tipo === 'plan' ? '0.01' : '1'} step={editor.tipo === 'plan' ? '0.01' : '1'} defaultValue={editor.item?.precio_ars ?? editor.item?.costo_creditos ?? ''} required />
      </label>
      {editor.tipo === 'plan' ? <label>Créditos incluidos <input name="creditos" type="number" min="1" step="1" defaultValue={editor.item?.creditos || ''} required /></label>
        : <label>Descripción <input name="descripcion" defaultValue={editor.item?.descripcion || ''} /></label>}
      <label className="opcion"><input type="checkbox" name="activo" defaultChecked={editor.item?.activo ?? true} />Disponible para nuevas compras</label>
      <p className="suave">Desmarcá la disponibilidad para darlo de baja sin borrar el historial.</p>
      <div className="modal__acciones">
        <button type="button" className="secundario" onClick={() => setEditor(null)}>Cancelar</button>
        <button type="submit">Guardar {editor.tipo}</button>
      </div>
      </form>
    </Modal>}
  </section>;
}
