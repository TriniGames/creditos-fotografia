import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const SesionContext = createContext(null);

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [cerrando, setCerrando] = useState(false);
  const [errorSalir, setErrorSalir] = useState(null);
  const revision = useRef(0);
  const saliendo = useRef(false);
  const pendiente = useRef(null);

  const cargarSesion = useCallback(() => {
    if (saliendo.current) return Promise.resolve();
    if (pendiente.current) return pendiente.current;
    const version = revision.current;
    setEstado((prev) => prev === 'autenticado' ? prev : 'cargando');
    pendiente.current = api('/api/auth/sesion').then(({ usuario: actual }) => {
      if (version !== revision.current) return;
      setUsuario(actual);
      setEstado('autenticado');
    }).catch((error) => {
      if (version !== revision.current) return;
      setEstado(error.message === 'NO_AUTORIZADO' ? 'sin_sesion' : 'error');
      setUsuario(null);
    }).finally(() => { pendiente.current = null; });
    return pendiente.current;
  }, []);

  useEffect(() => {
    cargarSesion();
    // Si otra pestaña cambió la sesión, actualizamos la identidad al volver.
    window.addEventListener('focus', cargarSesion);
    return () => window.removeEventListener('focus', cargarSesion);
  }, [cargarSesion]);

  async function cerrarSesion() {
    if (saliendo.current) return;
    saliendo.current = true;
    revision.current += 1;
    setCerrando(true);
    setErrorSalir(null);
    try {
      await api('/api/auth/logout', {});
      setUsuario(null);
      setEstado('sin_sesion');
      window.location.assign('/');
    } catch {
      setErrorSalir('No se pudo cerrar la sesión. Intentá de nuevo.');
    } finally {
      saliendo.current = false;
      setCerrando(false);
    }
  }

  return <SesionContext.Provider value={{ usuario, estado, cerrando, errorSalir, cargarSesion, cerrarSesion }}>
    {children}
  </SesionContext.Provider>;
}

export function useSesion() {
  const sesion = useContext(SesionContext);
  if (!sesion) throw new Error('useSesion requiere SesionProvider');
  return sesion;
}

export function RequiereSesion({ rol, children }) {
  const { usuario, estado, cargarSesion } = useSesion();
  const destino = usuario?.rol === 'admin' ? '/admin/' : '/cuenta/';
  useEffect(() => {
    if (estado === 'autenticado' && usuario.rol !== rol) window.location.replace(destino);
  }, [estado, usuario, rol, destino]);
  if (estado === 'error') return <main className="tarjeta ancha">
    <p role="alert">No se pudo verificar tu sesión.</p>
    <button type="button" onClick={cargarSesion}>Reintentar</button>
  </main>;
  if (estado === 'sin_sesion') return <main className="tarjeta ancha"><a href="/">Volver al ingreso</a></main>;
  if (estado !== 'autenticado' || usuario.rol !== rol) return <main className="tarjeta ancha"><p role="status">Verificando sesión…</p></main>;
  return <Fragment key={usuario.id}>{children}</Fragment>;
}
