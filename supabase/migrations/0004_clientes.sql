-- 0004: alta de clientes y avisos.
-- El usuario de login se crea en Supabase Auth desde el servidor; esta función
-- crea el perfil asociado y lo registra en la auditoría.

create or replace function crear_cliente(
  p_actor uuid, p_auth_id uuid, p_username text, p_nombre text,
  p_marca text, p_email text, p_idem text
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_clave text := 'crear_cliente:' || p_idem;
  v_prev jsonb;
  v_id uuid;
begin
  perform _requiere_admin(p_actor);
  v_prev := _op_previa(v_clave);
  if v_prev is not null then
    return (v_prev->>'profile_id')::uuid;
  end if;

  if p_nombre is null or length(btrim(p_nombre)) < 2 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_marca is null or length(btrim(p_marca)) < 2 then raise exception 'MARCA_INVALIDA'; end if;

  insert into profiles (id, username, nombre, marca, email)
  values (p_auth_id, lower(p_username), btrim(p_nombre), btrim(p_marca), lower(p_email))
  returning id into v_id;

  perform _auditar(p_actor, 'crear_cliente', 'profiles', v_id::text,
                   'Alta de cliente', jsonb_build_object('marca', btrim(p_marca)));
  perform _guardar_op(v_clave, jsonb_build_object('profile_id', v_id));
  return v_id;
end $$;

create or replace function marcar_notificacion_leida(p_actor uuid, p_id uuid)
returns void
language plpgsql set search_path = public as $$
begin
  perform _requiere_admin(p_actor);
  update admin_notifications set leida = true where id = p_id;
end $$;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function es_admin(uuid) to anon, authenticated;
grant execute on all functions in schema public to service_role;
