import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync,existsSync,unlinkSync } from 'node:fs';
import pg from 'pg';

// Solo localhost. Usa fixtures propios y los elimina al terminar; no modifica las cuentas de ejemplo.
const base = 'http://localhost:8788';
const env = Object.fromEntries(readFileSync('.dev.vars','utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => {
  const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1)];
}));
assert.ok(['127.0.0.1','localhost'].includes(new URL(env.SUPABASE_URL).hostname));
const idems = [];
const ids = [];
const idem = () => { const id=randomUUID(); idems.push(id); return id; };
let profile;
const empleados=[];
const suffix=randomUUID().slice(0,8);
const username=`test_${suffix}`;
const password='PruebaLocal-12345!';
async function request(path, cookie, body) {
  const response=await fetch(base+path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type':'application/json', ...(cookie ? { Cookie:cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(user, pass=password) { return request('/api/auth/login',null,{username:user,password:pass}); }
const admin=await login('admin_local','SoloLocal-12345!');
assert.equal(admin.status,200,'Login administrador');
async function action(name, datos, key=idem()) {
  return request('/api/admin/accion',admin.cookie,{accion:name,datos,idem:key});
}
function ok(result) { assert.equal(result.status,200,JSON.stringify(result.data)); return result.data.resultado; }
function error(result, code) { assert.equal(result.data.error,code,JSON.stringify(result)); }
async function cuenta(cookie) { const r=await request('/api/cuenta',cookie); assert.equal(r.status,200); return r.data; }
const db=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});
await db.connect();
try {
  const alta={username,nombre:'Cliente de prueba',marca:'Marca de prueba',email:`${username}@example.test`,password,idem:idem()};
  const altas=await Promise.all([request('/api/admin/crear-cliente',admin.cookie,alta),request('/api/admin/crear-cliente',admin.cookie,alta)]);
  profile=altas.find((r)=>r.status===200)?.data.profile_id;
  for (const r of altas) { assert.equal(r.status,200,JSON.stringify(r)); }
  assert.equal(altas[0].data.profile_id,altas[1].data.profile_id,'Alta concurrente: un perfil');
  assert.equal((await request('/api/admin/crear-cliente',admin.cookie,alta)).data.profile_id,profile);
  console.log('OK alta concurrente y reintento sin duplicar Auth ni perfil');
  const nuevoUsuario=`edit_${suffix}`;
  ok(await action('modificar_cliente',{p_profile:profile,p_username:nuevoUsuario,p_nombre:'Cliente editado',p_marca:'Marca editada'}));
  assert.equal((await login(username)).status,401);
  const cliente=await login(nuevoUsuario); assert.equal(cliente.status,200);
  assert.equal((await cuenta(cliente.cookie)).marca,'Marca editada');
  assert.equal((await request('/api/admin/accion',cliente.cookie,{accion:'eliminar_cuenta',datos:{p_profile:profile},idem:idem()})).status,401);
  ok(await action('dar_de_baja',{p_profile:profile,p_motivo:'Baja antes de contratar'}));
  assert.equal((await cuenta(cliente.cookie)).estado,'dada_de_baja');
  ok(await action('reactivar',{p_profile:profile,p_devolver:0,p_motivo:'Retomar contratación'}));
  console.log('OK modificación, nuevo usuario de acceso y permisos');

  const guardar=(tipo,id,nombre,valor,creditos,activo=true,descripcion=null) => action('guardar_catalogo',{
    p_tipo:tipo,p_id:id,p_nombre:nombre,p_valor:valor,p_creditos:creditos,p_descripcion:descripcion,p_activo:activo,
  });
  const plan=ok(await guardar('plan',null,`Plan ${suffix}`,10000,1000)); ids.push(plan);
  const descripcion='Incluye piezas de diseño.\nEntregables: archivos listos para publicar.';
  const servicio=ok(await guardar('servicio',null,`Servicio ${suffix}`,300,null,true,descripcion)); ids.push(servicio);
  const caro=ok(await guardar('servicio',null,`Servicio caro ${suffix}`,900,null)); ids.push(caro);
  const mensual=ok(await action('crear_plan_mensual',{p_profile:profile,p_plan:plan}));
  ids.push(mensual);
  const pagoDatos={p_profile:profile,p_monthly_plan:mensual,p_monto:1,p_metodo:'transferencia',p_mp_payment_id:null,p_comprobante:null};
  error(await action('registrar_pago',pagoDatos),'MONTO_INCORRECTO');
  pagoDatos.p_monto=10000;
  const pago=ok(await action('registrar_pago',pagoDatos));
  error(await action('registrar_pago',pagoDatos),'PAGO_YA_REGISTRADO');
  const activacion=idem();
  const activaciones=await Promise.all([action('aprobar_pago_y_activar',{p_payment:pago},activacion),action('aprobar_pago_y_activar',{p_payment:pago},activacion)]);
  assert.deepEqual(ok(activaciones[0]),ok(activaciones[1]));
  assert.equal((await cuenta(cliente.cookie)).saldo,1000);
  console.log('OK plan, validación de monto, pago único y activación concurrente');

  assert.equal((await cuenta(cliente.cookie)).servicios.find((s)=>s.id===servicio).descripcion,descripcion,'Descripción completa visible para el cliente');

  const personal=[];
  for(let n=1;n<=2;n++) {
    const alta={username:`empleado_${n}_${suffix}`,nombre:`Empleado QA ${n}`,email:`empleado_${n}_${suffix}@example.test`,password,rol:'admin',idem:idem()};
    const altas=await Promise.all([request('/api/admin/crear-empleado',admin.cookie,alta),request('/api/admin/crear-empleado',admin.cookie,alta)]);
    altas.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.data)));
    const id=altas[0].data.profile_id;empleados.push(id);assert.equal(altas[1].data.profile_id,id);
    const sesion=await login(alta.username);assert.equal(sesion.status,200);assert.equal(sesion.data.rol,'empleado','No se puede elegir rol desde el cuerpo');
    personal.push({id,username:alta.username,cookie:sesion.cookie});
  }
  const [uno,dos]=personal;
  assert.equal((await request('/api/admin/resumen',uno.cookie)).status,401);
  assert.equal((await request('/api/cuenta',uno.cookie)).status,401);
  assert.equal((await request('/api/equipo',cliente.cookie)).status,401);
  const trabajador=(p,b)=>request('/api/equipo/trabajo',p.cookie,{...b,idem:b.idem||idem()});
  const trabajos=async(p)=>(await request('/api/equipo',p.cookie)).data.trabajos;
  const adminId=(await db.query("select id from profiles where username='admin_local'")).rows[0].id;
  ok(await guardar('servicio',caro,`Servicio B ${suffix}`,200,null));
  const pedido=ok(await request('/api/cuenta/pedido',cliente.cookie,{servicios:[servicio,caro],comentario:'Campaña de lanzamiento',idem:idem()}));ids.push(pedido.order_id);
  let datos=await cuenta(cliente.cookie);const items=datos.pedidos.find(p=>p.id===pedido.order_id).order_items;ids.push(...items.map(i=>i.id));
  const item=items.find(i=>i.nombre===`Servicio ${suffix}`),segundo=items.find(i=>i.id!==item.id);
  error(await action('actualizar_trabajo',{p_item:item.id,p_version:0,p_detalle:'Entrega sin revisión',p_estado:'entregado'}),'PEDIDO_SIN_REVISAR');
  ok(await action('revisar_pedido',{p_order:pedido.order_id,p_comentario:'Revisado'}));
  const asignacion=idem();const asignar={p_item:item.id,p_responsable:uno.id,p_version:0};
  ok(await action('asignar_trabajo',asignar,asignacion));ok(await action('asignar_trabajo',asignar,asignacion));
  assert.equal((await trabajos(uno)).length,1);assert.equal((await trabajos(dos)).length,0);
  error(await trabajador(dos,{p_item:item.id,p_actor:adminId,p_version:1,p_detalle:'No autorizado',p_estado:'pendiente'}),'NO_AUTORIZADO');
  assert.equal((await request('/api/admin/accion',uno.cookie,{accion:'asignar_trabajo',datos:asignar,idem:idem()})).status,401);
  const detalle='Objetivo: campaña de lanzamiento.\nEntregables: tres piezas y una ronda de ajustes.';
  ok(await trabajador(uno,{p_item:item.id,p_version:1,p_detalle:detalle,p_estado:'en_produccion'}));
  datos=await cuenta(cliente.cookie);assert.equal(datos.pedidos.find(p=>p.id===pedido.order_id).order_items.find(i=>i.id===item.id).detalle_trabajo,detalle);
  ok(await trabajador(uno,{p_item:item.id,p_version:2,p_detalle:detalle,p_estado:'pendiente'}));
  assert.equal((await cuenta(cliente.cookie)).pedidos.find(p=>p.id===pedido.order_id).estado,'seleccionado','Volver a pendiente restaura el estado del pedido');
  ok(await trabajador(uno,{p_item:item.id,p_version:3,p_detalle:detalle,p_estado:'en_produccion'}));
  ok(await action('asignar_trabajo',{p_item:item.id,p_responsable:dos.id,p_version:4}));
  assert.equal((await trabajos(uno)).length,0);assert.equal((await trabajos(dos))[0].detalle_trabajo,detalle);
  error(await trabajador(uno,{p_item:item.id,p_version:5,p_detalle:'Acceso anterior',p_estado:'pendiente'}),'NO_AUTORIZADO');
  error(await trabajador(dos,{p_item:item.id,p_version:1,p_detalle:'Borrador viejo',p_estado:'pendiente'}),'TRABAJO_MODIFICADO');
  console.log('OK alta recuperable de empleados, permisos, asignación, detalle compartido, reasignación y versiones');
  ok(await action('asignar_trabajo',{p_item:segundo.id,p_responsable:adminId,p_version:0}));
  ok(await action('actualizar_trabajo',{p_item:segundo.id,p_version:1,p_detalle:'Servicio gestionado por el superadmin.',p_estado:'en_produccion'}));
  assert.ok((await request('/api/admin/trabajos',admin.cookie)).data.trabajos.some(t=>t.id===segundo.id && t.responsable_id===adminId));
  const tokenResponse=await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:`empleado_2_${suffix}@example.test`,password})});
  const {access_token:token}=await tokenResponse.json();const headers={apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const lectura=await fetch(`${env.SUPABASE_URL}/rest/v1/order_items?select=id`,{headers});assert.deepEqual((await lectura.json()).map(i=>i.id),[item.id]);
  const rpcDirecta=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/actualizar_trabajo`,{method:'POST',headers,body:JSON.stringify({p_actor:adminId,p_item:item.id,p_detalle:'Bypass',p_estado:'entregado',p_version:3,p_idem:idem()})});assert.equal(rpcDirecta.status,403);
  await fetch(`${env.SUPABASE_URL}/rest/v1/order_items?id=eq.${item.id}`,{method:'PATCH',headers,body:JSON.stringify({detalle_trabajo:'Bypass',responsable_id:uno.id})});
  assert.equal((await trabajos(dos))[0].detalle_trabajo,detalle);
  const entrega={p_item:item.id,p_version:5,p_detalle:detalle,p_estado:'entregado',idem:idem()};
  const entregas=await Promise.all([trabajador(dos,entrega),trabajador(dos,entrega)]);entregas.forEach(ok);
  datos=await cuenta(cliente.cookie);assert.equal(datos.capacidad.pendiente,200,'Libera solo el servicio entregado');assert.equal(datos.saldo,500,'Entregar no devuelve saldo');
  assert.equal(datos.pedidos.find(p=>p.id===pedido.order_id).estado,'en_produccion');
  const entregado=datos.pedidos.find(p=>p.id===pedido.order_id).order_items.find(i=>i.id===item.id);assert.equal(entregado.estado_trabajo,'entregado');assert.ok(entregado.entregado_at);
  assert.equal(Number((await db.query("select count(*) as n from admin_audit where entidad_id=$1 and accion='actualizar_trabajo' and detalle->>'estado'='entregado'",[item.id])).rows[0].n),1);
  ok(await action('actualizar_trabajo',{p_item:segundo.id,p_version:2,p_detalle:'Servicio gestionado por el superadmin.',p_estado:'entregado'}));
  datos=await cuenta(cliente.cookie);assert.equal(datos.capacidad.pendiente,0);assert.equal(datos.pedidos.find(p=>p.id===pedido.order_id).estado,'entregado');
  console.log('OK trabajo del superadmin, aislamiento RLS, entrega parcial concurrente y cierre completo sin doble liberación');
  ok(await action('guardar_empleado',{p_profile:dos.id,p_nombre:'Empleado QA 2',p_activo:false}));
  assert.equal((await request('/api/equipo',dos.cookie)).status,401);assert.equal((await login(dos.username)).status,401);
  const bloqueado=await fetch(`${env.SUPABASE_URL}/rest/v1/order_items?select=id`,{headers});assert.deepEqual(await bloqueado.json(),[]);
  error(await action('guardar_empleado',{p_profile:adminId,p_nombre:'Intento',p_activo:false}),'NO_AUTORIZADO');
  console.log('OK desactivación bloquea login, sesión y acceso directo; no modifica superadmins');
  if(process.env.QA_EQUIPO==='1') {
    const nuevo=ok(await request('/api/cuenta/pedido',cliente.cookie,{servicios:[servicio],comentario:'Coordinar una nueva campaña.',idem:idem()}));ids.push(nuevo.order_id);
    ok(await action('revisar_pedido',{p_order:nuevo.order_id,p_comentario:'Revisamos el alcance.'}));
    const i=(await cuenta(cliente.cookie)).pedidos.find(p=>p.id===nuevo.order_id).order_items[0];ids.push(i.id);
    ok(await action('asignar_trabajo',{p_item:i.id,p_version:0,p_responsable:uno.id}));
    ok(await trabajador(uno,{p_item:i.id,p_version:1,p_detalle:'Brief acordado en la reunión: piezas para la campaña, formato vertical y colores de marca.',p_estado:'en_produccion'}));
    console.log('QA EQUIPO',uno.username,nuevoUsuario,password);
    await new Promise(resolve=>{const timer=setInterval(()=>{if(existsSync('tmp/qa-equipo.done')){clearInterval(timer);resolve();}},250);});unlinkSync('tmp/qa-equipo.done');
  }
} finally {
  await db.query('begin');
  try {
    if (profile) {
      await db.query('delete from schedule_events where order_id in (select id from service_orders where profile_id=$1)',[profile]);
      await db.query('delete from order_items where order_id in (select id from service_orders where profile_id=$1)',[profile]);
      for (const table of ['service_orders','credit_movements','credit_lots','payments','monthly_plans','admin_notifications','terms_acceptances']) {
        await db.query(`delete from ${table} where profile_id=$1`,[profile]);
      }
      await db.query('delete from admin_audit where entidad_id=$1',[profile]);
      await db.query('delete from profiles where id=$1',[profile]);
    }
    for(const empleado of empleados) { await db.query('delete from admin_audit where entidad_id=$1 or actor=$1::uuid',[empleado]); await db.query('delete from profiles where id=$1',[empleado]); }
    await db.query('delete from admin_audit where entidad_id=any($1::text[])',[ids]);
    await db.query('delete from plans where id=any($1::uuid[])',[ids]);
    await db.query('delete from services where id=any($1::uuid[])',[ids]);
    for (const table of ['operation_requests','operaciones_idempotentes']) await db.query(`delete from ${table} where split_part(clave,':',2)=any($1::text[])`,[idems]);
    await db.query('commit');
    for(const empleado of empleados) { const r=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${empleado}`,{method:'DELETE',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}}); assert.ok(r.ok); }
    if (profile) {
      const deleted=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${profile}`,{method:'DELETE',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}});
      assert.ok(deleted.ok,'Limpieza del usuario Auth de prueba');
    }
  } catch (e) { await db.query('rollback'); throw e; }
  finally { await db.end(); }
}
