# Calendario de entregables — propuesta, sin implementar

## Objetivo y alcance

El administrador coordina las fechas fuera del sistema y registra aquí cuándo se entrega cada servicio contratado. El cliente consulta sus propias fechas y estados. No incluye chat, envío de email/WhatsApp, integración con Google Calendar ni programación automática.

La unidad de agenda será el **servicio dentro del pedido** (`order_items`), no el servicio del catálogo: dos clientes pueden contratar el mismo servicio y tener entregas diferentes. Un pedido con varios servicios puede tener varias fechas.

## 1. Datos y reglas

- Agregar por ítem fecha de entrega comprometida (día, sin hora en esta primera versión). Reutilizar estado, fecha real de entrega, responsable y versión ya existentes.
- Mantener las fechas de rodaje/postproducción como hitos opcionales posteriores. Ya existe `schedule_events`, pero hoy apunta al pedido completo: antes de reutilizarla, agregar una relación opcional con `order_items` y validar que el ítem pertenezca al pedido indicado. No crear una segunda fuente para la misma fecha de entrega.
- Permitir fecha pendiente: no inventar una fecha al recibir el pedido. Mostrar **Por coordinar** al cliente.
- Distinguir **Por coordinar**, **Programado**, **Entregado** y **Cancelado**. **Vencido** se calcula cuando la fecha pasó y todavía no se entregó; no debe confundirse con la expiración de créditos.
- Reprogramar con motivo y auditoría, conservando la fecha anterior. Usar versión del registro para evitar que dos administradores se sobreescriban.
- Usar la zona horaria de negocio `America/Argentina/Buenos_Aires`. Si después se necesitan citas con hora, guardarlas como instante UTC y mostrarlas en esa zona.

## 2. Administración

- Nueva sección **Calendario**, inicialmente con vista mensual y una lista semanal de entregas. Filtros por cliente, estado y servicios sin fecha; navegación Hoy / anterior / siguiente.
- Cada evento muestra cliente, servicio, referencia de pedido y estado. El color acompaña un texto o ícono; no comunica el estado por sí solo.
- Desde el detalle de un pedido, asignar o reprogramar cada servicio en un modal. Desde el calendario, abrir ese mismo editor compartido.
- Mostrar entregas vencidas y próximas como pendientes globales del panel. No generar avisos repetidos en cada actualización.
- Primera versión con formularios explícitos; arrastrar eventos se evalúa después, porque reprogramar necesita motivo y confirmación.

## 3. Cliente

- Mostrar fecha y estado por servicio en el detalle del pedido, además de un resumen **Próximas entregas**.
- Vista de calendario/lista de sus propios entregables, con buena lectura en móvil. Sin controles administrativos ni datos de otros clientes.
- Ante un cambio, reflejar la nueva fecha y una indicación de reprogramación. No convertir los comentarios del pedido en un hilo.

## 4. Relación con la capacidad

- Los topes actuales miden créditos pendientes simultáneos. Una fecha futura también reserva capacidad; reprogramar no libera cupo.
- La entrega por ítem y la liberación parcial de capacidad ya están implementadas en la migración 0010 junto al panel de empleados. El calendario debe usar esa misma operación y sus controles de permisos/idempotencia.
- La migración 0010 ya marcó los ítems de pedidos previamente entregados. No repetir esa migración ni alterar el historial al agregar fechas comprometidas.
- Los créditos son una aproximación a la carga humana. Un calendario con capacidad diaria/semanal real requiere otro dato: horas estimadas y, eventualmente, responsables/recursos por servicio. No asumir que los créditos equivalen a horas ni que la fecha de entrega representa todos los días de trabajo.
- Antes de implementar cancelaciones, definir expresamente si se devuelven créditos y cómo se conserva la auditoría. Liberar capacidad y devolver saldo son operaciones distintas.

## 5. Implementación futura, en orden

1. Acordar si alcanza una fecha por servicio y validar las reglas de entregas parciales/cancelación.
2. Crear migración aditiva, permisos RLS y funciones transaccionales para programar, reprogramar y entregar por ítem. Auditoría, idempotencia y control de concurrencia desde el servidor.
3. Exponer consultas por rango de fechas y filtros, con índices y paginación. No depender de los últimos 30/50 pedidos del panel.
4. Construir editor compartido y calendario administrativo accesible, con alternativa de lista para móvil y teclado.
5. Agregar consulta del cliente y pendientes globales. Mantener fuera de alcance comunicaciones externas.
6. Verificar permisos entre clientes, reprogramaciones concurrentes, días límite, entregas parciales, liberación exacta de capacidad y conservación del historial.

## Criterios de aceptación

Un pedido de tres servicios admite tres fechas. El cliente ve exactamente sus fechas y sus cambios. El admin puede localizar entregas sin fecha o vencidas y reprogramar con historial. La entrega de un ítem libera solo su carga pendiente; repetir la operación no cambia el saldo ni vuelve a liberar capacidad. El calendario funciona también como lista en pantalla chica.

**Estado: planificación solamente. No se agregaron tablas, endpoints ni pantallas de calendario.**
