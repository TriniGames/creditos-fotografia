// Mensajes en español para los códigos que devuelve la base de datos.
const ERRORES = {
  NO_AUTORIZADO: 'No tenés permisos para esta acción.',
  SALDO_INSUFICIENTE: 'Saldo insuficiente.',
  PLAZO_VENCIDO: 'El plazo para elegir servicios ya venció.',
  MOTIVO_REQUERIDO: 'Falta el motivo.',
  CICLO_EN_CURSO: 'El cliente ya tiene un ciclo activo.',
  PLAN_DEL_MES_YA_EXISTE: 'Ya existe un plan para ese mes.',
  DEVOLUCION_INVALIDA: 'La cantidad a devolver supera lo perdido.',
  PAGO_NO_PENDIENTE: 'El pago ya no está pendiente.',
  PLAN_NO_PENDIENTE: 'El plan no está pendiente de pago.',
  ESTADO_INVALIDO: 'El estado de la cuenta no permite esta acción.',
  SIN_CICLO_ACTIVO: 'El cliente no tiene un ciclo activo.',
  CANTIDAD_INVALIDA: 'La cantidad debe ser mayor a cero.',
};

export const mensajeError = (e) =>
  ERRORES[e?.message] || 'Ocurrió un error. Revisá los datos e intentá de nuevo.';
