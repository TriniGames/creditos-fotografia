import { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { mensajeError } from '../shared/errores.js';
import { useOperacion } from '../shared/useOperacion.js';
import { useAutoActualizar } from '../shared/useAutoActualizar.js';
import CabeceraSesion from '../shared/CabeceraSesion.jsx';
import BarraPanel from '../shared/BarraPanel.jsx';
import Toast from '../shared/Toast.jsx';
import Trabajos from '../shared/Trabajos.jsx';

export default function Equipo() {
  const [datos,setDatos]=useState(null),[error,setError]=useState(null);
  const {ejecutar,ocupado,aviso,cerrarAviso}=useOperacion();
  const cargar=useCallback(async()=>{try{const r=await api('/api/equipo');setDatos(r);setError(null);return r;}catch(e){setError(mensajeError(e));throw e;}},[]);
  useEffect(()=>{cargar().catch(()=>{});},[cargar]);
  useAutoActualizar(cargar,{habilitado:Boolean(datos)&&!ocupado,intervalo:15000});
  return <main className="tarjeta ancha admin-panel"><CabeceraSesion titulo="Mi panel de trabajo" /><Toast aviso={aviso} onCerrar={cerrarAviso} />
    {!datos ? <><p role={error ? 'alert' : 'status'}>{error || 'Cargando trabajos…'}</p>{error && <button onClick={()=>cargar().catch(()=>{})}>Reintentar</button>}</> : <>
      <BarraPanel titulo="Tu trabajo asignado" secciones={[{id:'trabajos',texto:'Mis trabajos'}]} actual="trabajos" onCambiar={()=>{}} ocupado={ocupado}>
        <p>{datos.trabajos.filter((t)=>t.estado_trabajo!=='entregado'&&t.estado_pedido!=='cancelado').length} {datos.trabajos.filter((t)=>t.estado_trabajo!=='entregado'&&t.estado_pedido!=='cancelado').length === 1 ? 'servicio pendiente' : 'servicios pendientes'} · {datos.trabajos.filter((t)=>t.estado_trabajo==='entregado').length} entregados</p>
        {error && <p className="error" role="status">No pudimos actualizar tus trabajos. Se reintentará automáticamente.</p>}
      </BarraPanel>
      <Trabajos trabajos={datos.trabajos} ocupado={ocupado} onActualizar={cargar} onGuardar={(b)=>ejecutar('/api/equipo/trabajo',b,cargar,b.p_estado==='entregado' ? 'Servicio entregado. El cliente ya puede verlo.' : 'Detalle y estado guardados. El cliente ya puede verlos.')} />
    </>}
  </main>;
}
