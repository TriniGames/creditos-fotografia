import { json } from '../../../lib/http.js';
import { cookieBorrar } from '../../../lib/session.js';

export const onRequestPost = () =>
  json({ ok: true }, 200, { 'Set-Cookie': cookieBorrar() });
