import assert from 'node:assert/strict';

const base = 'http://localhost:8788';
async function login(username, password = 'SoloLocal-12345!') {
  return fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

assert.equal((await fetch(`${base}/api/admin/resumen`)).status, 401);
assert.equal((await fetch(`${base}/api/auth/sesion`)).status, 401, 'Sesión privada sin cookie');
assert.equal((await login('admin_local', 'incorrecta')).status, 401);
for (const [username, role, path] of [
  ['admin_local', 'admin', '/api/admin/resumen'],
  ['cliente_local', 'cliente', '/api/cuenta'],
]) {
  const response = await login(username);
  assert.equal(response.status, 200, `Login ${username}`);
  assert.equal((await response.json()).rol, role);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie?.includes('HttpOnly'));
  const headers = { Cookie: cookie.split(';')[0] };
  const session = await fetch(`${base}/api/auth/sesion?rol=admin`, { headers });
  assert.equal(session.status, 200);
  assert.equal(session.headers.get('cache-control'), 'no-store');
  const sessionData = await session.json();
  assert.equal(sessionData.usuario.username, username);
  assert.equal(sessionData.usuario.rol, role, 'El servidor determina el rol, no el parámetro');
  assert.ok(sessionData.usuario.nombre);
  assert.ok(sessionData.usuario.email);
  assert.ok(!JSON.stringify(sessionData).includes(cookie.split(';')[0].slice('sb_at='.length)), 'No expone el token');
  const panel = await fetch(`${base}${path}`, { headers });
  assert.equal(panel.status, 200, `Panel ${username}`);
  const data = await panel.json();
  if (role === 'admin') assert.ok(Array.isArray(data.clientes));
  else {
    assert.equal(typeof data.saldo, 'number');
    assert.equal((await fetch(`${base}/api/admin/resumen`, { headers })).status, 401);
  }
  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers });
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
  console.log(`OK identidad, rol, login, acceso y cierre de sesión ${username}`);
}
console.log('OK acceso anónimo rechazado, contraseña incorrecta rechazada y cliente sin acceso administrativo.');
