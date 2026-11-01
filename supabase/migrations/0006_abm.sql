-- Altas recuperables, edición de clientes y catálogo con auditoría.
create or replace function crear_cliente(
  p_actor uuid, p_auth_id uuid, p_username text, p_nombre text,
  p_marca text, p_email text, p_idem text
) returns uuid language plpgsql set search_path = public as $$
declare
  v_clave text := 'crear_cliente:' || p_idem;
  v_prev jsonb;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave, p_auth_id,
    jsonb_build_array(p_actor, lower(p_username), btrim(p_nombre), btrim(p_marca), lower(p_email)));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return (v_prev->>'profile_id')::uuid; end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_marca is null or length(btrim(p_marca)) < 2 then raise exception 'MARCA_INVALIDA'; end if;
  if p_username is null or p_username !~ '^[a-z0-9_.-]{3,30}$' then raise exception 'USUARIO_INVALIDO'; end if;
  begin
    insert into profiles (id, username, nombre, marca, email)
    values (p_auth_id, lower(p_username), btrim(p_nombre), btrim(p_marca), lower(p_email));
  exception when unique_violation then raise exception 'USUARIO_EN_USO';
  end;
  perform _auditar(p_actor, 'crear_cliente', 'profiles', p_auth_id::text,
    'Alta de cliente', jsonb_build_object('marca', btrim(p_marca)));
  perform _guardar_op(v_clave, jsonb_build_object('profile_id', p_auth_id));
  return p_auth_id;
end $$;

create function buscar_alta(
  p_actor uuid, p_idem text, p_username text, p_nombre text, p_marca text, p_email text
) returns uuid language plpgsql set search_path = public as $$
declare v_datos jsonb; v_resultado jsonb;
begin
  perform _requiere_admin(p_actor);
  select datos into v_datos from operation_requests where clave = 'crear_cliente:' || p_idem;
  if found and v_datos is distinct from
    jsonb_build_array(p_actor, lower(p_username), btrim(p_nombre), btrim(p_marca), lower(p_email)) then
    raise exception 'IDEMPOTENCIA_CONFLICTO';
  end if;
  v_resultado := _op_previa('crear_cliente:' || p_idem);
  return (v_resultado->>'profile_id')::uuid;
end $$;

create function modificar_cliente(
  p_actor uuid, p_profile uuid, p_username text, p_nombre text, p_marca text, p_idem text
) returns uuid language plpgsql set search_path = public as $$
declare v_clave text := 'modificar_cliente:' || p_idem; v_antes profiles;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave, p_profile, jsonb_build_array(p_actor,p_profile,p_username,p_nombre,p_marca));
  if _op_previa(v_clave) is not null then return p_profile; end if;
  select * into v_antes from profiles where id = p_profile;
  if not found or v_antes.rol <> 'cliente' or v_antes.estado = 'eliminada' then raise exception 'ESTADO_INVALIDO'; end if;
  if p_username is null or p_username !~ '^[a-z0-9_.-]{3,30}$' then raise exception 'USUARIO_INVALIDO'; end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_marca is null or length(btrim(p_marca)) < 2 then raise exception 'MARCA_INVALIDA'; end if;
  begin
    update profiles set username=p_username, nombre=btrim(p_nombre), marca=btrim(p_marca) where id=p_profile;
  exception when unique_violation then raise exception 'USUARIO_EN_USO';
  end;
  perform _auditar(p_actor, 'modificar_cliente', 'profiles', p_profile::text, 'Edición de datos',
    jsonb_build_object('antes', jsonb_build_object('username',v_antes.username,'nombre',v_antes.nombre,'marca',v_antes.marca),
                       'despues', jsonb_build_object('username',p_username,'nombre',btrim(p_nombre),'marca',btrim(p_marca))));
  perform _guardar_op(v_clave, jsonb_build_object('profile_id',p_profile));
  return p_profile;
end $$;

create function guardar_catalogo(
  p_actor uuid, p_tipo text, p_id uuid, p_nombre text, p_valor numeric,
  p_creditos int, p_descripcion text, p_activo boolean, p_idem text
) returns uuid language plpgsql set search_path = public as $$
declare v_clave text := 'catalogo:' || p_idem; v_id uuid; v_prev jsonb;
begin
  perform _requiere_admin(p_actor);
  perform _serializar_operacion(v_clave, null,
    jsonb_build_array(p_actor,p_tipo,p_id,p_nombre,p_valor,p_creditos,p_descripcion,p_activo));
  v_prev := _op_previa(v_clave);
  if v_prev is not null then return (v_prev->>'id')::uuid; end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_valor is null or p_valor <= 0 or p_activo is null then raise exception 'CANTIDAD_INVALIDA'; end if;
  v_id := coalesce(p_id, gen_random_uuid());
  if p_tipo = 'plan' then
    if p_creditos is null or p_creditos <= 0 then raise exception 'CANTIDAD_INVALIDA'; end if;
    if p_id is null then
      insert into plans (id,nombre,precio_ars,creditos,activo) values (v_id,btrim(p_nombre),p_valor,p_creditos,p_activo);
    else
      update plans set nombre=btrim(p_nombre),precio_ars=p_valor,creditos=p_creditos,activo=p_activo where id=p_id;
      if not found then raise exception 'PLAN_INVALIDO'; end if;
    end if;
  elsif p_tipo = 'servicio' then
    if p_valor <> trunc(p_valor) or p_valor > 2147483647 then raise exception 'CANTIDAD_INVALIDA'; end if;
    if p_id is null then
      insert into services (id,nombre,costo_creditos,descripcion,activo) values (v_id,btrim(p_nombre),p_valor::int,p_descripcion,p_activo);
    else
      update services set nombre=btrim(p_nombre),costo_creditos=p_valor::int,descripcion=p_descripcion,activo=p_activo where id=p_id;
      if not found then raise exception 'SERVICIO_INVALIDO'; end if;
    end if;
  else raise exception 'ACCION_INVALIDA';
  end if;
  perform _auditar(p_actor,'guardar_catalogo',p_tipo,v_id::text,'Actualización de catálogo',
    jsonb_build_object('nombre',p_nombre,'valor',p_valor,'activo',p_activo));
  perform _guardar_op(v_clave,jsonb_build_object('id',v_id));
  return v_id;
end $$;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function es_admin(uuid) to anon, authenticated;
grant execute on all functions in schema public to service_role;
