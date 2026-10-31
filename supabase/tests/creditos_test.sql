-- Pruebas de reglas de créditos.
-- Uso (Supabase local):
--   supabase start
--   supabase db reset            (aplica migraciones 0001, 0002, 0003)
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/tests/creditos_test.sql
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja datos.

begin;

-- Usuarios de prueba en auth (Supabase local acepta este insert mínimo).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'cliente@test.local');

create or replace function _assert_eq(actual anyelement, expected anyelement, msg text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALLO %: esperado %, obtenido %', msg, expected, actual;
  end if;
  raise notice 'OK %', msg;
end $$;

do $t$
declare
  adm uuid := '00000000-0000-0000-0000-00000000000a';
  cli uuid := '00000000-0000-0000-0000-00000000000b';
  plan_id uuid := '00000000-0000-0000-0000-000000000011';
  s1 uuid := '00000000-0000-0000-0000-000000000022';   -- 3000 créditos
  s2 uuid := '00000000-0000-0000-0000-000000000033';   -- 150 créditos
  mp uuid;
  pay uuid;
  r jsonb;
  n int;
begin
  insert into profiles (id, username, nombre, marca, email, rol) values
    (adm, 'admin', 'Brian', 'Admin', 'admin@test.local', 'admin'),
    (cli, 'cliente1', 'Cliente', 'Marca Test', 'cliente@test.local', 'cliente');
  insert into plans (id, nombre, precio_ars, creditos) values (plan_id, 'Base', 375000, 4875);
  insert into services (id, nombre, costo_creditos) values
    (s1, 'Foto editorial 15', 3000),
    (s2, 'Foto adicional', 150);

  -- 1. Plan, pago y activación manual
  mp := crear_plan_mensual(adm, cli, plan_id, 'k-plan-1');
  pay := registrar_pago(adm, cli, mp, 375000, 'transferencia', null, null, 'k-pago-1');
  perform aprobar_pago_y_activar(adm, pay, 'k-act-1');
  perform _assert_eq(saldo_cliente(cli), 4875, 'activación acredita 4875 créditos');
  perform _assert_eq((select estado from profiles where id = cli), 'activa', 'cuenta activa tras activar');
  perform _assert_eq((select plazo_horas from profiles where id = cli), 48, 'plazo inicial de 48 h');

  -- 2. Idempotencia: misma clave no acredita dos veces
  r := aprobar_pago_y_activar(adm, pay, 'k-act-1');
  perform _assert_eq(
    (select count(*)::int from credit_movements where profile_id = cli and tipo = 'acreditacion'),
    1, 'idempotencia: una sola acreditación');

  -- 3. Ampliación y consumo FIFO
  perform agregar_creditos(adm, cli, 100, 'Ampliación pagada por transferencia', 'k-amp-1');
  perform _assert_eq(saldo_cliente(cli), 4975, 'ampliación suma 100');

  r := confirmar_pedido(cli, array[s1]::uuid[], 'k-ped-1');
  perform _assert_eq(saldo_cliente(cli), 1975, 'consumo descuenta 3000');
  perform _assert_eq(
    (select cantidad_restante from credit_lots where profile_id = cli and origen = 'plan'),
    1875, 'FIFO: se consume primero el lote del plan');

  -- 4. Saldo insuficiente no descuenta nada
  begin
    perform confirmar_pedido(cli, array[s1]::uuid[], 'k-ped-2');
    raise exception 'FALLO: debió rechazar saldo insuficiente';
  exception when others then
    if sqlerrm not like '%SALDO_INSUFICIENTE%' then raise; end if;
  end;
  perform _assert_eq(saldo_cliente(cli), 1975, 'saldo intacto tras rechazo');

  -- 5. Baja manual: pierde el saldo con movimiento y motivo
  r := dar_de_baja(adm, cli, 'Incumplió plazo de selección', 'k-baja-1');
  perform _assert_eq(saldo_cliente(cli), 0, 'baja deja saldo en 0');
  perform _assert_eq(
    (select count(*)::int from credit_movements where profile_id = cli and tipo = 'perdida'),
    2, 'baja registra una pérdida por lote con motivo');

  -- 6. Motivo obligatorio
  begin
    perform dar_de_baja(adm, cli, '', 'k-baja-2');
    raise exception 'FALLO: motivo vacío debió rechazarse';
  exception when others then
    if sqlerrm not like '%MOTIVO_REQUERIDO%' then raise; end if;
  end;

  -- 7. Reactivación: plazo de 24 h y devolución parcial
  begin
    perform reactivar(adm, cli, 5000, 'Devolución excesiva', 'k-react-x');
    raise exception 'FALLO: no se puede devolver más de lo perdido';
  exception when others then
    if sqlerrm not like '%DEVOLUCION_INVALIDA%' then raise; end if;
  end;
  r := reactivar(adm, cli, 500, 'Devolución parcial por demora justificada', 'k-react-1');
  perform _assert_eq(saldo_cliente(cli), 500, 'reactivación devuelve 500');
  perform _assert_eq((select plazo_horas from profiles where id = cli), 24, 'reactivación: plazo de 24 h');
  perform _assert_eq((select estado from profiles where id = cli), 'activa', 'reactivada queda activa');

  -- 8. Plazo vencido bloquea el consumo y no cambia el estado solo
  update profiles set plazo_inicio = now() - interval '3 days' where id = cli;
  begin
    perform confirmar_pedido(cli, array[s2]::uuid[], 'k-ped-3');
    raise exception 'FALLO: plazo vencido debió bloquear el consumo';
  exception when others then
    if sqlerrm not like '%PLAZO_VENCIDO%' then raise; end if;
  end;
  perform _assert_eq((select estado from profiles where id = cli), 'activa',
                     'plazo vencido no cambia estado automáticamente');

  -- 9. Avisos: se generan una sola vez
  n := generar_avisos();
  perform _assert_eq(n > 0, true, 'generar_avisos crea aviso de plazo vencido');
  n := generar_avisos();
  perform _assert_eq(n, 0, 'segunda corrida de avisos no duplica');

  -- 10. Vencimiento: una sola vez por lote
  update credit_lots set gracia_hasta = now() - interval '1 minute'
  where profile_id = cli and estado = 'vigente';
  perform _assert_eq(vencer_creditos(), 1, 'vence el lote de reactivación');
  perform _assert_eq(vencer_creditos(), 0, 'segunda corrida de vencimiento no duplica');
  perform _assert_eq(saldo_cliente(cli), 0, 'saldo en 0 tras vencimiento');

  -- 11. Permisos: el cliente no puede ejecutar acciones administrativas
  begin
    perform crear_plan_mensual(cli, cli, plan_id, 'k-x');
    raise exception 'FALLO: un cliente no debe ejecutar acciones de admin';
  exception when others then
    if sqlerrm not like '%NO_AUTORIZADO%' then raise; end if;
  end;

  raise notice 'Todas las pruebas de créditos pasaron';
end
$t$;

rollback;
