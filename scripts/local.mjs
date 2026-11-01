import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import pg from 'pg';

function status() {
  const command = 'npx --no-install supabase status -o json';
  const output = process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8' })
    : execFileSync('npx', ['--no-install', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  const config = JSON.parse(output);
  for (const key of ['API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (!config[key]) throw new Error(`Falta ${key} en el estado de Supabase local.`);
  }
  for (const key of ['API_URL', 'DB_URL']) {
    const url = new URL(config[key]);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Esta herramienta solo acepta servicios locales.');
    }
  }
  return config;
}

async function main() {
  const mode = process.argv[2];
  if (!['env', 'seed', 'test'].includes(mode)) throw new Error('Uso: node scripts/local.mjs env|seed|test');
  const config = status();
  if (mode === 'env') {
    writeFileSync('.dev.vars', [
      `SUPABASE_URL=${config.API_URL}`,
      `SUPABASE_ANON_KEY=${config.ANON_KEY}`,
      `SUPABASE_SERVICE_ROLE_KEY=${config.SERVICE_ROLE_KEY}`,
      'PUBLIC_SITE_URL=http://localhost:8788',
      'MP_ACCESS_TOKEN=', 'MP_WEBHOOK_SECRET=', '',
    ].join('\n'), { flag: 'wx' });
    console.log('.dev.vars creado. Si ya existe, revisalo manualmente; no se sobrescribe.');
    return;
  }
  if (mode === 'test') {
    const client = new pg.Client({ connectionString: config.DB_URL });
    client.on('notice', (notice) => console.log(notice.message));
    await client.connect();
    try {
      await client.query(readFileSync('supabase/tests/creditos_test.sql', 'utf8'));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      await client.end();
    }
    return;
  }
  const headers = { apikey: config.SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  async function request(path, method = 'GET', body) {
    const res = await fetch(`${config.API_URL}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const { users } = await request('/auth/v1/admin/users?per_page=1000');
  for (const [username, rol, nombre, marca] of [
    ['admin_local', 'admin', 'Administrador local', 'Administración'],
    ['cliente_local', 'cliente', 'Cliente local', 'Marca de prueba'],
  ]) {
    const email = `${username}@example.test`;
    const existing = users.find((user) => user.email === email);
    const user = existing || await request('/auth/v1/admin/users', 'POST', {
      email, password: 'SoloLocal-12345!', email_confirm: true,
    });
    const profiles = await request(`/rest/v1/profiles?id=eq.${user.id}&select=id`);
    if (!profiles.length) await request('/rest/v1/profiles', 'POST', { id: user.id, username, rol, nombre, marca, email });
  }
  for (const [table, rows] of [
    ['plans', [{ id: '10000000-0000-4000-8000-000000000001', nombre: 'Plan de prueba', precio_ars: 375000, creditos: 4875 }]],
    ['services', [
      { id: '20000000-0000-4000-8000-000000000001', nombre: 'Foto editorial', costo_creditos: 3000 },
      { id: '20000000-0000-4000-8000-000000000002', nombre: 'Foto adicional', costo_creditos: 150 },
    ]],
  ]) {
    for (const row of rows) {
      if (!(await request(`/rest/v1/${table}?id=eq.${row.id}&select=id`)).length) await request(`/rest/v1/${table}`, 'POST', row);
    }
  }
  console.log('Datos locales preparados. Usuarios: admin_local y cliente_local. Contraseña inicial: SoloLocal-12345!');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
