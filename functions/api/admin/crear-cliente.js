import { sbAuthAdmin, sbRpc } from '../../../lib/supabase.js';
import { json, manejar } from '../../../lib/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost = ({ request, data, env }) =>
  manejar(async () => {
    const b = await request.json().catch(() => null);
    if (!b) return json({ error: 'SOLICITUD_INVALIDA' }, 400);

    const username = String(b.username || '').trim().toLowerCase();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');

    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return json({ error: 'USUARIO_INVALIDO' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'EMAIL_INVALIDO' }, 400);
    if (password.length < 10) return json({ error: 'PASSWORD_CORTA' }, 400);
    if (!UUID.test(b.idem || '')) return json({ error: 'IDEMPOTENCIA_REQUERIDA' }, 400);

    // 1) Login en Supabase Auth (correo ya confirmado: no hay registro público).
    const resAuth = await sbAuthAdmin(env, 'POST', 'users', {
      email,
      password,
      email_confirm: true,
    });
    if (!resAuth.ok) return json({ error: 'NO_SE_PUDO_CREAR_LOGIN' }, 422);
    const usuario = await resAuth.json();

    // 2) Perfil en la base, con auditoría. Si falla, se revierte el login.
    try {
      const profileId = await sbRpc(env, 'crear_cliente', {
        p_actor: data.sesion.user.id,
        p_auth_id: usuario.id,
        p_username: username,
        p_nombre: String(b.nombre || ''),
        p_marca: String(b.marca || ''),
        p_email: email,
        p_idem: b.idem,
      });
      return json({ ok: true, profile_id: profileId });
    } catch (e) {
      await sbAuthAdmin(env, 'DELETE', `users/${usuario.id}`);
      throw e;
    }
  });
