const TRAZOS = {
  ver: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  editar: <><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></>,
  sumar: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  reactivar: <><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3-3" /></>,
  baja: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  eliminar: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
};

export default function Icono({ nombre }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {TRAZOS[nombre]}
  </svg>;
}
