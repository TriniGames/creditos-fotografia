import { useEffect, useRef, useState } from 'react';

const TIPOS = {
  exito: { titulo: 'Listo', icono: '✓', duracion: 6000 },
  error: { titulo: 'No se pudo completar', icono: '×', duracion: 10000 },
  advertencia: { titulo: 'Atención', icono: '!', duracion: 8000 },
};

export default function Toast({ aviso, onCerrar }) {
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  const [hover, setHover] = useState(false);
  const [foco, setFoco] = useState(false);

  useEffect(() => {
    if (!aviso) { setHover(false); setFoco(false); }
  }, [aviso]);

  useEffect(() => {
    if (!aviso || hover || foco) return;
    const timer = setTimeout(() => cerrar.current(), (TIPOS[aviso.tipo] || TIPOS.advertencia).duracion);
    return () => clearTimeout(timer);
  }, [aviso, hover, foco]);

  if (!aviso) return null;
  const tipo = TIPOS[aviso.tipo] || TIPOS.advertencia;
  return <aside className={`toast toast--${aviso.tipo}`} aria-label="Notificación"
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    onFocusCapture={() => setFoco(true)}
    onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFoco(false); }}>
    <span className="toast__icono" aria-hidden="true">{tipo.icono}</span>
    <div className="toast__contenido" role={aviso.tipo === 'error' ? 'alert' : 'status'} aria-atomic="true">
      <strong>{tipo.titulo}</strong>
      <p>{aviso.texto}</p>
    </div>
    <button type="button" className="toast__cerrar" aria-label="Cerrar notificación" onClick={onCerrar}>×</button>
  </aside>;
}
