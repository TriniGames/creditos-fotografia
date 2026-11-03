import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  const pedido={servicios:[servicio],comentario:'Necesitamos piezas para el lanzamiento.\nPrioridad: portada.',idem:idem()};
  const pedidos=await Promise.all([request('/api/cuenta/pedido',cliente.cookie,pedido),request('/api/cuenta/pedido',cliente.cookie,pedido)]);
  assert.deepEqual(ok(pedidos[0]),ok(pedidos[1]));
  const pedidoId=ok(pedidos[0]).order_id; ids.push(pedidoId);
  const avisosPedido=await db.query("select id,leida from admin_notifications where order_id=$1 and tipo='pedido_nuevo'",[pedidoId]);
  assert.equal(avisosPedido.rows.length,1,'Un solo aviso ante confirmaciones concurrentes');
  assert.equal(avisosPedido.rows[0].leida,false);
  const bandeja=await request('/api/admin/pedidos',admin.cookie);
  assert.equal(bandeja.status,200,JSON.stringify(bandeja.data));
  assert.ok(bandeja.data.pedidos.some((p)=>p.id===pedidoId && !p.revisado_at),'Pedido visible como nuevo');
  assert.equal(bandeja.data.pedidos_nuevos,Number((await db.query("select count(*) from service_orders where revisado_at is null and estado<>'cancelado'")).rows[0].count),'Contador exacto de pedidos nuevos');
  assert.equal((await request('/api/admin/pedidos',cliente.cookie)).status,401);
  assert.equal((await request('/api/admin/accion',cliente.cookie,{accion:'revisar_pedido',datos:{p_order:pedidoId},idem:idem()})).status,401);
  assert.equal((await cuenta(cliente.cookie)).pedidos.find((p)=>p.id===pedidoId).comentario_cliente,pedido.comentario);
  error(await request('/api/cuenta/pedido',cliente.cookie,{...pedido,comentario:'Otro contexto'}),'IDEMPOTENCIA_CONFLICTO');
  assert.equal((await request('/api/cuenta/pedido',cliente.cookie,{servicios:[servicio],comentario:'x'.repeat(2001),idem:idem()})).data.error,'COMENTARIO_INVALIDO');
  const revision={p_order:pedidoId,p_comentario:'Analizamos el alcance. Coordinaremos los materiales por el canal habitual.'};
  const revisiones=await Promise.all([action('revisar_pedido',revision),action('revisar_pedido',revision)]);
  revisiones.forEach(ok);
  error(await action('revisar_pedido',{...revision,p_comentario:'Otra respuesta'}),'PEDIDO_YA_REVISADO');
  assert.equal((await cuenta(cliente.cookie)).pedidos.find((p)=>p.id===pedidoId).comentario_admin,revision.p_comentario);
  assert.equal((await db.query('select leida from admin_notifications where order_id=$1',[pedidoId])).rows[0].leida,true);
  assert.equal(Number((await db.query("select count(*) from admin_audit where entidad_id=$1 and accion='revisar_pedido'",[pedidoId])).rows[0].count),1,'Revisar repetido no duplica auditoría');
  assert.ok((await cuenta(cliente.cookie)).pedidos.find((p)=>p.id===pedidoId).revisado_at,'El cliente ve la revisión');
  console.log('OK aviso persistente único, contador, acceso administrativo y revisión visible para el cliente');
  let datos=await cuenta(cliente.cookie);
  assert.equal(datos.saldo,700); assert.equal(datos.pedidos.length,1);
  error(await request('/api/cuenta/pedido',cliente.cookie,{servicios:[caro],idem:idem()}),'SALDO_INSUFICIENTE');
  assert.equal(Number((await db.query("select count(*) from admin_notifications where profile_id=$1 and tipo='pedido_nuevo'",[profile])).rows[0].count),1,'Un pedido rechazado no genera avisos');
  error(await request('/api/cuenta/pedido',cliente.cookie,{servicios:[caro],idem:pedido.idem}),'IDEMPOTENCIA_CONFLICTO');
  ok(await guardar('servicio',servicio,`Servicio editado ${suffix}`,350,null));
  datos=await cuenta(cliente.cookie);
  assert.equal(datos.pedidos[0].order_items[0].costo_creditos,300,'Snapshot original');
  ok(await guardar('servicio',caro,`Servicio caro ${suffix}`,900,null,false));
  assert.ok(!(await cuenta(cliente.cookie)).servicios.some((s) => s.id===caro));
  error(await request('/api/cuenta/pedido',cliente.cookie,{servicios:[caro],idem:idem()}),'SERVICIO_INVALIDO');
  console.log('OK pedido concurrente, saldo, cambios de catálogo y conservación del precio original');

  const ampliacion=idem();
  const amp={p_profile:profile,p_creditos:100,p_motivo:'Complemento de prueba'};
  const ampliaciones=await Promise.all([action('agregar_creditos',amp,ampliacion),action('agregar_creditos',amp,ampliacion)]);
  assert.equal(ok(ampliaciones[0]),ok(ampliaciones[1]));
  assert.equal((await cuenta(cliente.cookie)).saldo,800);
  ok(await action('dar_de_baja',{p_profile:profile,p_motivo:'Baja de prueba'}));
  datos=await cuenta(cliente.cookie); assert.equal(datos.estado,'dada_de_baja'); assert.equal(datos.saldo,0);
  error(await request('/api/cuenta/pedido',cliente.cookie,{servicios:[servicio],idem:idem()}),'ESTADO_INVALIDO');
  ok(await action('reactivar',{p_profile:profile,p_devolver:500,p_motivo:'Reactivación de prueba'}));
  datos=await cuenta(cliente.cookie); assert.equal(datos.estado,'activa'); assert.equal(datos.saldo,500);
  await db.query("update profiles set plazo_inicio=now()-interval '2 days' where id=$1",[profile]);
  error(await request('/api/cuenta/pedido',cliente.cookie,{servicios:[servicio],idem:idem()}),'PLAZO_VENCIDO');
  await db.query('update profiles set plazo_inicio=now() where id=$1',[profile]);
  ids.push(ok(await request('/api/cuenta/pedido',cliente.cookie,{servicios:[servicio],idem:idem()})).order_id);
  assert.equal((await cuenta(cliente.cookie)).saldo,150);

  // Verificar RLS con un token real: sin acceso al perfil de otra persona ni escritura directa.
  const token=cliente.cookie.slice('sb_at='.length);
  const headers={apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const lectura=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id`,{headers});
  assert.deepEqual((await lectura.json()).map((p)=>p.id),[profile]);
  const escritura=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${profile}`,{method:'PATCH',headers,body:JSON.stringify({rol:'admin'})});
  assert.equal((await db.query('select rol from profiles where id=$1',[profile])).rows[0].rol,'cliente','RLS impide promoción a administrador');
  console.log('OK ampliación, baja, reactivación, nuevo pedido y permisos RLS');

  ok(await action('eliminar_cuenta',{p_profile:profile,p_motivo:'Fin de prueba'}));
  assert.equal((await login(nuevoUsuario)).status,401);
  assert.equal((await request('/api/cuenta',cliente.cookie)).status,401);
  assert.equal(Number((await db.query('select count(*) from service_orders where profile_id=$1',[profile])).rows[0].count),2);
  assert.ok(Number((await db.query('select count(*) from admin_audit where entidad_id=$1',[profile])).rows[0].count)>=5);
  console.log('OK eliminación bloquea sesiones existentes y conserva historial y auditoría');
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
    await db.query('delete from admin_audit where entidad_id=any($1::text[])',[ids]);
    await db.query('delete from plans where id=any($1::uuid[])',[ids]);
    await db.query('delete from services where id=any($1::uuid[])',[ids]);
    for (const table of ['operation_requests','operaciones_idempotentes']) await db.query(`delete from ${table} where split_part(clave,':',2)=any($1::text[])`,[idems]);
    await db.query('commit');
    if (profile) {
      const deleted=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${profile}`,{method:'DELETE',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}});
      assert.ok(deleted.ok,'Limpieza del usuario Auth de prueba');
    }
  } catch (e) { await db.query('rollback'); throw e; }
  finally { await db.end(); }
}
