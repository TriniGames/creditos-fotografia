import { useEffect, useRef } from 'react';

// Consulta al volver a la pestaña y periódicamente solo mientras esté visible.
export function useAutoActualizar(actualizar, { habilitado = true, intervalo = 15000 } = {}) {
  const callback = useRef(actualizar);
  callback.current = actualizar;
  useEffect(() => {
    if (!habilitado) return;
    let pendiente = false;
    async function ejecutar() {
      if (pendiente || document.hidden) return;
      pendiente = true;
      try { await callback.current(); }
      catch { /* La pantalla conserva el último resultado y comunica el fallo. */ }
      finally { pendiente = false; }
    }
    const timer = setInterval(ejecutar, intervalo);
    window.addEventListener('focus', ejecutar);
    document.addEventListener('visibilitychange', ejecutar);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', ejecutar);
      document.removeEventListener('visibilitychange', ejecutar);
    };
  }, [habilitado, intervalo]);
}
