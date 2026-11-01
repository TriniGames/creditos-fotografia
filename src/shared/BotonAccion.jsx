import Icono from './Icono.jsx';

const CLASES = {
  primaria: '',
  neutra: 'secundario',
  editar: 'secundario editar',
  positivo: 'secundario positivo',
  precaucion: 'secundario precaucion',
  destructivo: 'secundario destructivo',
};

export default function BotonAccion({ variante = 'neutra', icono, compacto = false, children, ...props }) {
  const soloIcono = compacto && Boolean(icono);
  return <button {...props} type="button"
    className={`${CLASES[variante] ?? CLASES.neutra}${soloIcono ? ' boton-icono' : ''}`}
    title={soloIcono ? children : undefined}>
    {icono && <Icono nombre={icono} />}
    {soloIcono ? <span className="sr-only">{children}</span> : children}
  </button>;
}
