import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Todo se revierte; incluye configuración, clientes, créditos, pedidos y auditoría.
const connectionString='postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db=new pg.Client({connectionString});
const paralelo=new pg.Client({connectionString});
await db.connect(); await paralelo.connect();
const cliente=randomUUID(), otro=randomUUID(), servicio=randomUUID();
const uuid=()=>randomUUID();
async function rpc(nombre,args) {
  const valores=Object.values(args);
  return (await db.query(`select ${nombre}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) as resultado`,valores)).rows[0].resultado;
}
async function falla(fn,codigo) {
  await db.query('savepoint rechazo');
  try { await fn(); assert.fail(`Se esperaba ${codigo}`); }
  catch(e) { assert.equal(e.message,codigo); }
  finally { await db.query('rollback to savepoint rechazo'); }
}
const pedir=(profile,idem=uuid())=>rpc('confirmar_pedido_comentado',{p_profile:profile,p_servicios:[servicio],p_idem:idem,p_comentario:null});
try {
  await db.query('begin');
  const admin=(await db.query("select id from profiles where username='admin_local' and rol='admin'")).rows[0].id;
  const original=(await rpc('capacidad_admin',{})).pendiente_total;
  for(const id of [cliente,otro]) {
    await db.query('insert into auth.users(id) values($1)',[id]);
    await db.query("insert into profiles(id,username,nombre,marca,email,estado,plazo_inicio,plazo_horas) values($1,$2,'QA capacidad','QA capacidad','capacidad@example.test','activa',now(),24)",[id,'cap_'+id.slice(0,20)]);
    await db.query("insert into credit_lots(profile_id,origen,cantidad_inicial,cantidad_restante,ciclo_fin,gracia_hasta) values($1,'ampliacion',2000,2000,now()+interval '30 days',now()+interval '33 days')",[id]);
  }
  await db.query("insert into services(id,nombre,costo_creditos,activo) values($1,'QA capacidad',300,true)",[servicio]);
  await rpc('guardar_capacidad',{p_actor:admin,p_max_cliente:null,p_max_total:null,p_idem:uuid()});
  assert.equal((await rpc('capacidad_cliente',{p_profile:cliente})).disponible,null,'Sin topes no equivale a cero');
  await rpc('guardar_capacidad',{p_actor:admin,p_max_cliente:500,p_max_total:Number(original)+300,p_idem:uuid()});

  // Otra conexión no puede comprobar/ocupar capacidad mientras esta transacción la cambia.
  await paralelo.query('begin');
  await paralelo.query("set local lock_timeout='250ms'");
  await assert.rejects(paralelo.query('insert into service_orders(profile_id,total_creditos) values($1,300)',[otro]),(e)=>e.code==='55P03');
  await paralelo.query('rollback');
  console.log('OK bloqueo global común para pedidos de diferentes clientes');

  const clave=uuid();
  const pedido=await pedir(cliente,clave);
  assert.deepEqual(await pedir(cliente,clave),pedido,'Reintentar al tope devuelve el mismo pedido');
  await falla(()=>pedir(cliente),'TOPE_CLIENTE_SUPERADO');
  await falla(()=>pedir(otro),'CAPACIDAD_EQUIPO_SUPERADA');
  assert.equal(Number((await db.query('select saldo_cliente($1) as saldo',[otro])).rows[0].saldo),2000,'Un rechazo no consume créditos');
  assert.equal(Number((await db.query('select count(*) as n from service_orders where profile_id=$1',[cliente])).rows[0].n),1);
  assert.equal(Number((await db.query('select count(*) as n from admin_notifications where profile_id=$1 and order_id is not null',[otro])).rows[0].n),0,'Un rechazo no genera avisos');
  console.log('OK límites por cliente y equipo, igualdad aceptada e idempotencia sin doble consumo');

  await rpc('guardar_limite_cliente',{p_actor:admin,p_profile:cliente,p_max_creditos:0,p_idem:uuid()});
  await falla(()=>pedir(cliente),'TOPE_CLIENTE_SUPERADO');
  assert.equal((await rpc('capacidad_cliente',{p_profile:cliente})).pendiente,300,'Bajar el tope conserva los trabajos');
  await falla(()=>rpc('entregar_pedido',{p_actor:admin,p_order:pedido.order_id,p_idem:uuid()}),'ESTADO_INVALIDO');
  await rpc('revisar_pedido_comentado',{p_actor:admin,p_order:pedido.order_id,p_comentario:null});
  const entrega=uuid();
  await rpc('entregar_pedido',{p_actor:admin,p_order:pedido.order_id,p_idem:entrega});
  await rpc('entregar_pedido',{p_actor:admin,p_order:pedido.order_id,p_idem:entrega});
  assert.equal((await rpc('capacidad_cliente',{p_profile:cliente})).pendiente,0);
  assert.equal(Number((await db.query('select saldo_cliente($1) as saldo',[cliente])).rows[0].saldo),1700,'Entregar no devuelve créditos');
  assert.equal(Number((await db.query("select count(*) as n from admin_audit where entidad_id=$1 and accion='entregar_pedido'",[pedido.order_id])).rows[0].n),1);
  await pedir(otro);
  await rpc('guardar_limite_cliente',{p_actor:admin,p_profile:cliente,p_max_creditos:null,p_idem:uuid()});
  assert.equal((await rpc('capacidad_cliente',{p_profile:cliente})).max_cliente,500,'Vacío vuelve al límite general');
  await rpc('guardar_capacidad',{p_actor:admin,p_max_cliente:null,p_max_total:0,p_idem:uuid()});
  await falla(()=>pedir(cliente),'CAPACIDAD_EQUIPO_SUPERADA');
  await falla(()=>rpc('guardar_capacidad',{p_actor:cliente,p_max_cliente:100,p_max_total:100,p_idem:uuid()}),'NO_AUTORIZADO');
  await falla(()=>rpc('guardar_capacidad',{p_actor:admin,p_max_cliente:-1,p_max_total:null,p_idem:uuid()}),'LIMITE_INVALIDO');
  console.log('OK excepción por cliente, pausa, entrega, liberación exacta, auditoría y permisos');
} finally {
  await db.query('rollback'); await paralelo.query('rollback');
  await Promise.all([db.end(),paralelo.end()]);
}
