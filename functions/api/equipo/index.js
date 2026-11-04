import { sbRpc } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';
export const onRequestGet = ({data,env}) => manejar(async () => json({trabajos:await sbRpc(env,'listar_trabajos',{p_actor:data.sesion.user.id})},200,{'Cache-Control':'no-store'}));
