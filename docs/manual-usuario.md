# Manual de usuario

## 1. Introducción

Gluten Free Life es un sistema de gestión y punto de venta para comercios de productos sin TACC. Permite administrar productos, stock, vencimientos, compras, ventas, caja y reportes.

El sistema puede ejecutarse con Docker y accederse desde `http://localhost:4000`, o ejecutarse en desarrollo con el frontend en `http://localhost:5173`.

## 2. Acceso al sistema

1. Abrí el sistema en el navegador.
2. Ingresá el usuario y la contraseña.
3. Presioná **Ingresar**.

En una instalación con datos de demostración:

- Usuario: `admin`
- Contraseña: `1234`

La sesión protege las pantallas internas. Para finalizarla, utilizá el botón de cerrar sesión ubicado junto al nombre del usuario.

## 3. Menú principal

Luego de iniciar sesión, el menú lateral contiene:

- **Inicio**: resumen general del negocio.
- **Punto de Venta**: registro de ventas y emisión de tickets.
- **Inventario**: consulta del stock disponible.
- **Productos**: alta, modificación, baja lógica e importación de productos.
- **Vencimientos**: control de fechas de vencimiento.
- **Compras**: generación y seguimiento de pedidos e ingreso de mercadería.
- **Intermediario**: datos del proveedor o intermediario logístico.
- **Caja**: resumen, arqueo y cierre diario.
- **Reportes**: análisis de ventas y productos.
- **Configuración**: parámetros del comercio, simulación del modo offline y cambiar tema oscuro/claro.

## 4. Inicio y dashboard

La pantalla **Inicio** presenta información resumida del negocio. Se utiliza para revisar rápidamente el estado de las ventas, el stock y las alertas.

Como primer paso de la jornada se recomienda:

1. Revisar las alertas de stock crítico.
2. Revisar los vencimientos próximos.
3. Ingresar a **Caja** y verificar el estado del día.

## 5. Punto de venta

### Registrar una venta

1. Entrá en **Punto de Venta**.
2. Buscá un producto por nombre o código de barras.
3. Seleccioná el producto.
4. Para productos vendidos por unidad, indicá una cantidad entera.
5. Para productos vendidos a granel, ingresá la cantidad correspondiente.
6. Repetí el proceso para agregar más productos.
7. Elegí el medio de pago:
   - Efectivo.
   - Mercado Pago.
   - Tarjeta.
8. Si elegiste efectivo, ingresá el dinero recibido.
9. Confirmá la venta.

El sistema calcula el total y, para pagos en efectivo, el vuelto. Al confirmar:

- Se registra la venta.
- Se descuentan las unidades o cantidades del stock.
- Se descuenta primero el vencimiento vigente más próximo.
- Se informa si el producto quedó en stock crítico.
- Se genera el ticket.

El sistema rechaza la operación si no hay stock suficiente, salvo que se trate de una venta offline que se esté sincronizando.

### Anular una venta

Una venta puede anularse desde la información de la operación mientras la caja de ese día no haya sido cerrada. La anulación devuelve el stock y excluye la operación de los totales de caja y reportes.

## 6. Inventario y productos

### Consultar inventario

En **Inventario** se puede:

- Consultar stock actual.
- Ver el stock mínimo.
- Identificar productos críticos.
- Abrir el detalle de un producto.

Un producto se considera **crítico** cuando su stock actual es menor o igual al stock mínimo configurado. También puede aparecer como **bajo** cuando se encuentra cerca de ese límite.

### Crear o editar un producto

Desde **Productos** o **Inventario**:

1. Elegí **Nuevo producto** o la opción de editar.
2. Completá código de barras, nombre y categoría.
3. Seleccioná el tipo de venta: **UNIDAD** o **GRANEL**.
4. Ingresá costo, margen y stock mínimo.
5. Guardá los cambios.

El precio sugerido se calcula como:

```text
precio de venta = precio de costo × (1 + margen / 100)
```

El sistema redondea el resultado al peso.

La baja de un producto es lógica: el registro permanece en la base, pero deja de estar disponible para las operaciones normales.

## 7. Vencimientos

Desde **Vencimientos** se pueden consultar los lotes o cantidades asociadas a cada producto.

Los estados son:

- **Normal**: la fecha está fuera del período de alerta.
- **Próximo**: se encuentra dentro de los días de anticipación configurados.
- **Vencido**: la fecha ya pasó.
- **Retirado**: la mercadería fue retirada del stock.

Para registrar un vencimiento:

1. Abrí el detalle del producto.
2. Elegí la opción para agregar un vencimiento.
3. Indicá la fecha y la cantidad.
4. Guardá.

Para retirar un vencimiento:

1. Seleccioná el registro vencido o que deba retirarse.
2. Confirmá la operación.

El sistema descuenta del stock la cantidad retirada y marca el vencimiento como retirado.

## 8. Compras e ingreso de mercadería

### Intermediario logístico

En **Intermediario** se administran los datos del proveedor o intermediario:

- Nombre.
- Contacto.
- Teléfono de WhatsApp.
- Correo electrónico.
- Observaciones.

### Crear un pedido

1. Entrá a **Compras**.
2. Seleccioná el intermediario.
3. Agregá los productos y cantidades.
4. Guardá el pedido.

Los pedidos recorren estados como:

`EN_PREPARACION → GENERADO → EXPORTADO → ENVIADO → EN_GESTION → ENTREGADO → FINALIZADO`

Cada cambio queda registrado en el historial del pedido.

### Exportar un pedido

Desde el detalle del pedido se puede generar un archivo PDF o Excel. La exportación permite enviar el pedido al intermediario y deja constancia del archivo generado.

### Registrar ingreso de mercadería

1. Entrá a **Compras → Ingreso de mercadería**.
2. Elegí el pedido relacionado, si corresponde.
3. Indicá el comprobante.
4. Agregá los productos recibidos, cantidades, costos y vencimientos.
5. Confirmá el ingreso.

El sistema aumenta el stock y registra el ingreso y sus detalles.

## 9. Caja

En **Caja** se consultan las operaciones del día agrupadas por medio de pago.

El sistema muestra:

- Cantidad de operaciones.
- Total facturado.
- Efectivo.
- Mercado Pago.
- Tarjeta.
- Total digital.
- Ventas anuladas.
- Detalle de ventas.

### Cerrar la caja

1. Revisá el resumen del día.
2. Ingresá el fondo inicial, si corresponde.
3. Contá el efectivo disponible.
4. Ingresá el efectivo contado.
5. Agregá una observación opcional.
6. Confirmá el cierre.

El efectivo esperado se calcula así:

```text
efectivo esperado = efectivo de ventas + fondo inicial
diferencia = efectivo contado - efectivo esperado
```

Una vez cerrada la caja no se puede volver a cerrar el mismo día ni anular ventas correspondientes a esa jornada.

## 10. Reportes

En **Reportes** se puede seleccionar un rango de fechas y consultar:

- Total vendido.
- Cantidad de operaciones.
- Ticket promedio.
- Ventas en efectivo.
- Ventas digitales.
- Productos más vendidos.
- Productos de menor rotación.
- Ventas por día.
- Cantidad de productos en stock crítico.

## 11. Importación de productos

Desde **Productos → Importar** se puede cargar un catálogo mediante un archivo `.xlsx`.

Procedimiento recomendado:

1. Prepará el archivo con las columnas esperadas por el sistema.
2. Seleccioná el archivo.
3. Ejecutá la validación.
4. Revisá los errores y advertencias.
5. Corregí el archivo si corresponde.
6. Confirmá la importación solamente cuando la validación sea correcta.

El archivo de ejemplo con errores se encuentra en `docs/ejemplo-catalogo-con-errores.xlsx`.

## 12. Modo offline

El sistema puede continuar registrando ventas cuando se pierde la conexión.

1. En **Configuración**, activá la simulación de pérdida de conexión o desconectá la red.
2. El indicador cambiará a **Sin conexión**.
3. Registrá ventas desde el POS.
4. Las ventas quedan pendientes en el navegador.
5. Restablecé la conexión.
6. El sistema sincroniza las ventas automáticamente.

Al volver la conexión se muestra la cantidad de ventas sincronizadas. Las operaciones que requieren conexión, como pedidos, ingresos, cierres de caja e importaciones, no se realizan offline.

## 13. Cambiar la apariencia

Para activar el modo oscuro:

1. Entrá en **Configuración**.
2. Ubicá la sección **Sistema**.
3. En **Apariencia**, presioná **Usar modo oscuro**.

Para volver al diseño original, presioná **Usar modo claro**. La preferencia se guarda en el navegador y se mantiene al cerrar y volver a abrir la aplicación. Esta configuración es local al dispositivo y no modifica la cuenta ni la base de datos.

## 14. Recomendaciones operativas

- Abrí y cerrá la caja de cada jornada.
- Revisá el stock crítico antes de generar compras.
- Registrá los vencimientos al ingresar mercadería.
- Validá los archivos Excel antes de importarlos.
- No ejecutes el seed sobre una base con datos reales.
- Realizá copias de seguridad según la política del comercio.

## 15. Resolución de problemas frecuentes

### No puedo iniciar sesión

Verificá que el backend esté funcionando y que las credenciales sean correctas. En la instalación de demostración, usá `admin` y `1234`.

### La aplicación indica que no hay conexión

Verificá que el backend y PostgreSQL estén activos. Si estás probando el modo offline intencionalmente, restablecé la conexión desde Configuración.

### No puedo vender un producto

Revisá que:

- El producto esté activo.
- La cantidad sea válida para el tipo de venta.
- Exista stock suficiente.

### No puedo anular una venta

La caja correspondiente probablemente ya fue cerrada.
