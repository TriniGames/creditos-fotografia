import { useRef, useState } from 'react';
import { api, nuevoId } from './api.js';
import { mensajeError } from './errores.js';

// Una clave por intento lógico. Un error de transporte conserva la clave al reintentar.
export function useOperacion() {
  const bloqueo = useRef(false);
  const intentos = useRef(new Map());
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [historial, setHistorial] = useState([]);
  function notificar(texto, tipo) {
    const item = { id: nuevoId(), texto, tipo, fecha: new Date().toISOString() };
    setAviso(item);
    setHistorial((prev) => [item, ...prev].slice(0, 20));
  }
  async function ejecutar(ruta, cuerpo, despues, mensaje = 'Cambios guardados.') {
    if (bloqueo.current) return false;
    bloqueo.current = true;
    setOcupado(true);
    setAviso(null);
    const firma = JSON.stringify([ruta, cuerpo]);
    const idem = intentos.current.get(firma) || nuevoId();
    intentos.current.set(firma, idem);
    try {
      await api(ruta, { ...cuerpo, idem });
      intentos.current.delete(firma);
      try {
        await despues?.();
        notificar(mensaje, 'exito');
      }
      catch { notificar(`${mensaje} No se pudo actualizar la vista; recargá la página.`, 'advertencia'); }
      return true;
    } catch (error) {
      if (error.status && error.status < 500) intentos.current.delete(firma);
      notificar(mensajeError(error), 'error');
      return false;
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }
  return { ejecutar, ocupado, aviso, historial, cerrarAviso: () => setAviso(null) };
}
