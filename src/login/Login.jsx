import { useState } from 'react';

export default function Login() {
  const [error, setError] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(false);
    setEnviando(true);

    // No usa api(): un 401 aquí significa credenciales incorrectas, no sesión vencida.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: f.get('username'), password: f.get('password') }),
    });
    setEnviando(false);

    if (!res.ok) {
      setError(true);
      return;
    }
    const { rol } = await res.json();
    window.location.href = rol === 'admin' ? '/admin/' : '/cuenta/';
  }

  return (
    <main className="tarjeta">
      <h1>Ingresar</h1>
      <form onSubmit={onSubmit}>
        <label>
          Usuario
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
        {error && <p className="error">Usuario o contraseña incorrectos.</p>}
      </form>
    </main>
  );
}
