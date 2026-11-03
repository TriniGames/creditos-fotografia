import { useState } from 'react';
import Tabla from '../shared/Tabla.jsx';
import Modal from '../shared/Modal.jsx';
import EstadoBadge from '../shared/EstadoBadge.jsx';

const valor = (v) => v === '' ? null : Number(v);
const limite = (v) => v === null ? 'Sin tope' : `${v} cr.`;

export default function Capacidad({ capacidad, clientes, accion, ocupado }) {
  const [editor, setEditor] = useState(null);
  const filas = capacidad.clientes.map((c) => ({ ...c, id:c.profile_id,
    marca:clientes.find((p) => p.id === c.profile_id)?.marca || 'Cliente',
    efectivo:c.max_creditos ?? capacidad.max_cliente,
  }));
  const alTope = capacidad.max_total !== null && capacidad.pendiente_total >= capacidad.max_total;
  return <section>
    <h2>Capacidad del equipo</h2>
    <p>Los topes cuentan los créditos de pedidos recibidos, agendados y en producción. Revisar un pedido no libera capacidad; entregarlo sí. El saldo de créditos no cambia.</p>
    <div className="capacidad-resumen">
      <div><span>Trabajo pendiente de entrega</span><strong className="numero">{capacidad.pendiente_total} cr.</strong></div>
      <div><span>Tope del equipo</span><strong>{limite(capacidad.max_total)}</strong></div>
      <EstadoBadge variante={alTope ? 'advertencia' : 'positivo'}>{alTope ? 'Sin capacidad para nuevos pedidos' : 'Capacidad disponible'}</EstadoBadge>
    </div>
    <form key={`${capacidad.max_cliente}:${capacidad.max_total}`} className="formulario capacidad-config" onSubmit={async (e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      await accion('guardar_capacidad',{p_max_cliente:valor(f.get('cliente')),p_max_total:valor(f.get('total'))});
    }}>
      <h3>Topes generales</h3>
      <label>Máximo pendiente por cliente (créditos)<input name="cliente" type="number" min="0" max="2147483647" step="1" defaultValue={capacidad.max_cliente ?? ''} placeholder="Sin tope" /></label>
      <label>Máximo pendiente del equipo (créditos)<input name="total" type="number" min="0" max="2147483647" step="1" defaultValue={capacidad.max_total ?? ''} placeholder="Sin tope" /></label>
      <p className="suave">Vacío significa sin tope. Cero pausa nuevos pedidos. Si bajás un tope por debajo de la carga actual, los trabajos existentes se conservan y se bloquean nuevos pedidos hasta recuperar capacidad.</p>
      <button disabled={ocupado} type="submit">Guardar topes generales</button>
    </form>
    <h3>Límites por cliente</h3>
    <p className="suave">Cada cliente usa el tope general salvo que configures una excepción. El límite total del equipo siempre se respeta.</p>
    <Tabla titulo="Capacidad por cliente" datos={filas} ocupado={ocupado} columnas={[
      {id:'marca',titulo:'Cliente'}, {id:'pendiente',titulo:'Pendiente (cr.)',alineacion:'derecha'},
      {id:'efectivo',titulo:'Límite',render:(c) => <>{limite(c.efectivo)}<div className="suave">{c.max_creditos === null ? 'Usa el general' : 'Límite propio'}</div></>},
      {id:'estado',titulo:'Capacidad del cliente',render:(c) => <EstadoBadge variante={c.efectivo !== null && c.pendiente >= c.efectivo ? 'advertencia' : 'positivo'}>{c.efectivo === null ? 'Sin tope individual' : `${Math.max(0,c.efectivo-c.pendiente)} cr. libres`}</EstadoBadge>},
    ]} acciones={[{id:'editar',texto:'Configurar límite',icono:'editar',variante:'editar'}]} onAccion={(_,c) => setEditor(c)} />
    {editor && <Modal titulo="Límite del cliente" detalle={editor.marca} ocupado={ocupado} onCerrar={() => setEditor(null)}>
      <form className="formulario" onSubmit={async (e) => { e.preventDefault(); const f=new FormData(e.currentTarget);
        if (await accion('guardar_limite_cliente',{p_profile:editor.id,p_max_creditos:valor(f.get('maximo'))})) setEditor(null);
      }}>
        <p>Carga pendiente: {editor.pendiente} cr. · Tope general: {limite(capacidad.max_cliente)}.</p>
        <label>Máximo pendiente propio (créditos)<input name="maximo" type="number" min="0" max="2147483647" step="1" defaultValue={editor.max_creditos ?? ''} placeholder="Usar el tope general" /></label>
        <p className="suave">Dejalo vacío para volver al tope general. Cero pausa nuevos pedidos de este cliente. Sus pedidos actuales se conservan.</p>
        <div className="modal__acciones"><button type="button" className="secundario" onClick={() => setEditor(null)}>Cancelar</button><button type="submit">Guardar límite del cliente</button></div>
      </form>
    </Modal>}
  </section>;
}
