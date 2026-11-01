# Componentes de presentación

## Sesión compartida

`SesionProvider` mantiene en memoria la identidad validada por `GET /api/auth/sesion`.
`useSesion()` expone `usuario`, `estado`, `cargarSesion()`, `cerrarSesion()`, `cerrando` y `errorSalir`.
Cada página protegida monta el proveedor y `RequiereSesion` con su rol. Al cambiar de página
se vuelve a consultar la sesión; al recuperar foco también se actualiza por posibles cambios en otra pestaña.
Al cambiar de usuario se reinicia el contenido de la página para no conservar datos de la cuenta anterior.
`CabeceraSesion` muestra nombre, usuario, correo, rol y cierre de sesión.
Los tokens permanecen en la cookie HttpOnly; no se guardan en Context ni en localStorage.
Los permisos de las API se verifican en el servidor, independientemente del estado de React.

## Tabla

`Tabla` recibe datos y configuración. No conoce entidades, formularios ni endpoints.

```jsx
<Tabla
  titulo="Planes"
  datos={planes}
  columnas={[
    { id: 'nombre', titulo: 'Nombre' },
    { id: 'precio', campo: 'precio_ars', titulo: 'Precio', render: (fila) => ARS.format(fila.precio_ars), alineacion: 'derecha' },
  ]}
  acciones={[
    { id: 'editar', texto: 'Editar', variante: 'editar' },
    { id: 'desactivar', texto: 'Desactivar', variante: 'precaucion', grupo: 'riesgo', visible: (fila) => fila.activo },
  ]}
  onAccion={(accionId, fila) => abrirFormulario(accionId, fila)}
  ocupado={ocupado}
  mensajeVacio="Todavía no hay planes."
/>
```

- `columnas`: `id` estable, `titulo`, `campo` opcional (por defecto `id`), `render(fila)` opcional y `alineacion: 'derecha'` opcional.
- `acciones`: `id`, `texto`, `variante`, `visible(fila)` y `deshabilitada(fila)` opcionales. `grupo` admite `principal` (por defecto) o `riesgo`.
- `onAccion(id, fila)` comunica la intención; la pantalla decide qué hacer.
- `icono` en cada acción activa el botón compacto y conserva `texto` como nombre accesible y tooltip. Nombres: `editar`, `sumar`, `reactivar`, `baja`, `eliminar`.
- `obtenerId(fila)` permite personalizar la clave de fila; por defecto usa `fila.id`.
- `ocupado` deshabilita las acciones. El estado vacío se muestra dentro de la tabla.

## BotonAccion y EstadoBadge

`BotonAccion` mantiene las variantes `primaria`, `neutra`, `editar`, `positivo`, `precaucion` y `destructivo`. Siempre es un botón de acción (`type="button"`).

`EstadoBadge` recibe una variante `positivo`, `advertencia`, `peligro` o `neutro` y su etiqueta como contenido. Los textos y reglas de estado pertenecen a cada pantalla.
