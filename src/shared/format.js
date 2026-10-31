const ZONA = 'America/Argentina/Mendoza';

export const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const FECHA = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: ZONA,
});

// Acepta una cadena ISO o un Date.
export const fecha = (valor) => FECHA.format(new Date(valor));

export const sumarHoras = (iso, horas) =>
  new Date(new Date(iso).getTime() + horas * 3600_000);
