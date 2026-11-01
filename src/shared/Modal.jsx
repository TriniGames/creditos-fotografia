import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUS = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

export default function Modal({ titulo, detalle, ocupado, onCerrar, children }) {
  const tituloId = useId();
  const detalleId = useId();
  const panel = useRef(null);
  const actual = useRef({ ocupado, onCerrar });
  actual.current = { ocupado, onCerrar };

  useEffect(() => {
    const origen = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const destino = panel.current.querySelector('input:not(:disabled), select:not(:disabled)') || panel.current;
    destino.focus();
    function teclado(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!actual.current.ocupado) actual.current.onCerrar();
      }
      if (e.key === 'Tab') {
        const controles = [...panel.current.querySelectorAll(FOCUS), ...document.querySelectorAll('.toast button:not(:disabled)')];
        if (!controles.length) { e.preventDefault(); panel.current.focus(); return; }
        const posicion = controles.indexOf(document.activeElement);
        if (e.shiftKey && posicion <= 0) { e.preventDefault(); controles.at(-1).focus(); }
        else if (!e.shiftKey && (posicion === -1 || posicion === controles.length - 1)) {
          e.preventDefault(); controles[0].focus();
        }
      }
    }
    document.addEventListener('keydown', teclado);
    return () => {
      document.removeEventListener('keydown', teclado);
      document.body.style.overflow = overflow;
      if (origen?.isConnected) origen.focus();
    };
  }, []);

  return createPortal(<div className="modal-fondo">
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby={tituloId}
      aria-describedby={detalle ? detalleId : undefined} ref={panel} tabIndex={-1}>
      <header className="modal__cabecera">
        <div><h2 id={tituloId}>{titulo}</h2>{detalle && <p id={detalleId}>{detalle}</p>}</div>
        <button type="button" className="modal__cerrar" aria-label="Cerrar ventana" disabled={ocupado} onClick={onCerrar}>×</button>
      </header>
      <fieldset disabled={ocupado} aria-busy={ocupado}>
        {children}
      </fieldset>
      {ocupado && <p role="status" className="modal__guardando">Guardando cambios…</p>}
    </div>
  </div>, document.body);
}
