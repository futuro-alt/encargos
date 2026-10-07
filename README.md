# Encargos

Web app instalable (PWA) para personal shoppers que compran en Estados Unidos
para clientes en México. Funciona en el iPhone desde la pantalla de inicio,
también sin internet.

- Viajes con tipo de cambio, impuesto de compra y ganancia sugerida.
- Clientes reutilizables entre viajes.
- Artículos por cliente: código de barras (escáner con la cámara), nombre,
  descripción, tienda, talla o color, cantidad, precio de compra (US$),
  precio de venta (pesos), estado, foto y notas.
- Pagos y anticipos, saldo de cada cliente y mensaje listo para WhatsApp.
- Exportación a Excel (.xlsx) con fórmulas: del viaje completo y por cliente.
- Respaldo y restauración en un archivo `.json`.

Los datos se guardan solo en el teléfono (IndexedDB). Respalda seguido desde
**Ajustes › Crear respaldo**.

## Publicar una actualización

1. Cambia los archivos que necesites.
2. En `sw.js`, sube el número de `VERSION` (por ejemplo de `1.0.0` a `1.0.1`).
3. Sube a este repositorio los archivos que cambiaste y `sw.js`.
4. Al abrir la app con internet aparecerá "Hay una versión nueva"; toca **Actualizar**.

Si agregas un archivo nuevo, agrégalo también a la lista `FILES` de `sw.js`.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Página principal de la app |
| `styles.css` | Diseño (colores, tipografía, modo oscuro) |
| `app.js` | Arranque, navegación, barra superior y avisos de versión nueva |
| `router.js` | Navegación entre pantallas (`#/viajes`, `#/viaje/...`) |
| `db.js` | Base de datos local (IndexedDB) y migraciones (`DB_VERSION`) |
| `calc.js` | Cálculos de dinero, redondeo igual que Excel, formatos |
| `ui.js` | Íconos, avisos, hojas, diálogos y formularios |
| `parts.js` | Piezas visuales compartidas (ticket, indicadores) |
| `view-trips.js` | Pantalla de viajes y formulario de viaje |
| `view-trip.js` | Detalle del viaje: Clientes, Artículos y Resumen |
| `view-client.js` | Cuenta del cliente, pagos, directorio y selector de clientes |
| `view-item.js` | Formulario de artículo (escáner, foto, precios, borrador) |
| `view-settings.js` | Ajustes, respaldo, restauración y versión |
| `scanner.js` | Escáner de códigos de barras con la cámara |
| `photos.js` | Reducción y visor de fotos |
| `excel.js` | Archivos de Excel |
| `share.js` | Compartir archivos y mensaje de WhatsApp |
| `backup.js` | Respaldo y restauración (`.json`) |
| `sw.js` | Funcionamiento sin internet y actualizaciones (`VERSION`) |
| `manifest.webmanifest` | Nombre, ícono y colores de la app instalada |
| `vendor-*.js`, `zxing_reader.wasm` | Librerías de terceros (Excel y lector de códigos) |
| `font-bricolage.woff2` | Tipografía de títulos |
| `LICENCIAS.txt` | Licencias del software de terceros |

## Formato del respaldo

`{ app: "encargos", schemaVersion: 1, exportedAt, settings, trips, clients,
tripClients, items, payments, photos }`. Montos: `unitCostUSD` (dólares por
pieza), `unitPriceMXN` (pesos por pieza), `amountMXN` (pagos). Fotos en base64.
Este archivo es el puente para pasar los datos a una futura app nativa.
