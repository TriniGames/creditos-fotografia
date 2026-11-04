export const destinoRol = (rol) => ({admin:'/admin/',empleado:'/equipo/',cliente:'/cuenta/'}[rol] || '/');
export const nombreRol = (rol) => ({admin:'Superadmin',empleado:'Empleado',cliente:'Cliente'}[rol] || rol);
