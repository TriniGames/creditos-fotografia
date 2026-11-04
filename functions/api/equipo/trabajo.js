import { sbRpc } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const onRequestPost=({request,data,env})=>manejar(async()=>{
  const b=await request.json().catch(()=>null);
  if(!UUID.test(b?.idem||''))return json({error:'IDEMPOTENCIA_REQUERIDA'},400);
  if(!UUID.test(b.p_item||'') || !Number.isInteger(b.p_version))return json({error:'TRABAJO_INVALIDO'},400);
  if(typeof b.p_detalle!=='string'||b.p_detalle.length>10000)return json({error:'DETALLE_INVALIDO'},400);
  const resultado=await sbRpc(env,'actualizar_trabajo',{p_actor:data.sesion.user.id,p_item:b.p_item,p_version:b.p_version,p_detalle:b.p_detalle,p_estado:b.p_estado,p_idem:b.idem});
  return json({ok:true,resultado});
});
