import { sbAuthAdmin, sbRest, sbRpc, ErrorNegocio } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost = ({ request, data, env }) =>
  manejar(async () => {
    const b = await request.json().catch(() => null);
    if (!b) return json({ error: 'SOLICITUD_INVALIDA' }, 400);

    const username = String(b.username || '').trim().toLowerCase();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const nombre = String(b.nombre || '').trim();
    const marca = String(b.marca || '').trim();

    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return json({ error: 'USUARIO_INVALIDO' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'EMAIL_INVALIDO' }, 400);
    if (password.length < 10) return json({ error: 'PASSWORD_CORTA' }, 400);
    if (!UUID.test(b.idem || '')) return json({ error: 'IDEMPOTENCIA_REQUERIDA' }, 400);
    if (nombre.length < 2) return json({ error: 'NOMBRE_INVALIDO' }, 400);
    if (marca.length < 2) return json({ error: 'MARCA_INVALIDA' }, 400);

    const buscarAnterior = () => sbRpc(env, 'buscar_alta', {
      p_actor: data.sesion.user.id, p_idem: b.idem, p_username: username,
      p_nombre: nombre, p_marca: marca, p_email: email,
    });
    const anterior = await buscarAnterior();
    if (anterior) return json({ ok: true, profile_id: anterior });
    if ((await sbRest(env, `profiles?username=eq.${encodeURIComponent(username)}&select=id`)).length) {
      const completada = await buscarAnterior();
      if (completada) return json({ ok: true, profile_id: completada });
      return json({ error: 'USUARIO_EN_USO' }, 422);
    }

    // 1) Login en Supabase Auth (correo ya confirmado: no hay registro público).
    const resAuth = await sbAuthAdmin(env, 'POST', 'users', {
      email,
      password,
      email_confirm: true,
      app_metadata: { alta_idem: b.idem, alta_actor: data.sesion.user.id },
    });
    let usuario;
    if (resAuth.ok) usuario = await resAuth.json();
    else {
      // Recupera un alta cuya respuesta se perdió entre Auth y la creación del perfil.
      // Solo se acepta un usuario creado por esta misma operación y administrador.
      const fallo = await resAuth.json().catch(() => ({}));
      for (let page = 1; ; page++) {
        const res = await sbAuthAdmin(env, 'GET', `users?page=${page}&per_page=100`);
        if (!res.ok) return json({ error: 'ALTA_REINTENTAR' }, 503);
        const { users = [] } = await res.json();
        usuario = users.find((u) => u.email?.toLowerCase() === email &&
          u.app_metadata?.alta_idem === b.idem && u.app_metadata?.alta_actor === data.sesion.user.id);
        if (usuario || users.length < 100) break;
      }
      if (!usuario) {
        const duplicado = [fallo.code, fallo.error_code].includes('email_exists');
        return json({ error: resAuth.status >= 500 ? 'ALTA_REINTENTAR' : duplicado ? 'EMAIL_EN_USO' : 'NO_SE_PUDO_CREAR_LOGIN' }, resAuth.status >= 500 ? 503 : 422);
      }
    }

    // 2) Perfil y auditoría transaccionales. Los fallos inciertos se recuperan al reintentar.
    try {
      const profileId = await sbRpc(env, 'crear_cliente', {
        p_actor: data.sesion.user.id,
        p_auth_id: usuario.id,
        p_username: username,
        p_nombre: nombre,
        p_marca: marca,
        p_email: email,
        p_idem: b.idem,
      });
      return json({ ok: true, profile_id: profileId });
    } catch (e) {
      // No borrar Auth ante errores de transporte: la transacción pudo haberse confirmado.
      if (resAuth.ok && e instanceof ErrorNegocio && ['USUARIO_EN_USO','IDEMPOTENCIA_CONFLICTO'].includes(e.message) &&
          !(await sbRest(env, `profiles?id=eq.${usuario.id}&select=id`)).length) {
        const cleanup = await sbAuthAdmin(env, 'DELETE', `users/${usuario.id}`);
        if (!cleanup.ok) console.error('No se pudo compensar el alta en Auth', usuario.id);
      }
      throw e;
    }
  });
