# Pruebas (no corren en el CI)

Sin `npm install`: usan `esbuild` y `puppeteer` de `/opt/npm-tools`, bibliotecas bajadas con `git clone` de GitHub, `openpyxl` y LibreOffice (`soffice --headless`).

- `xlsx/correr.sh <prueba.mjs>`: arma ExcelJS desde su repo (no trae `dist`; ver comentarios del script) y corre la prueba en Node con `src/transfer.js` real.
  - `ida-vuelta.mjs`: exporta una planilla con formato a `.xlsx` y `.csv` (`;` y `,`), la vuelve a importar y compara; también CSV en windows-1252 y TSV. Deja los archivos en `/tmp/xlsx-salida`.
  - `importar.mjs`: importa `dificil.xlsx` (hecho con openpyxl: fórmulas, combinadas, gráfico, tabla, comentarios, colores de tema…), la misma guardada por LibreOffice (`lo/dificil.xlsx`), un `.xls` y un `.ods`, y muestra celdas, estilos y avisos. Se arman con `python3 pruebas/xlsx/dificil.py` (correr antes `ida-vuelta.mjs`).
  - Mirar lo exportado: `python3 -c "import openpyxl; …"` y `soffice --headless --convert-to pdf ida.xlsx` + `pdftoppm -png`.
- `app/armar.sh`: arma la app web con `@capacitor/*` simulado (`capacitor-simulado.mjs`) y la sirve en `http://localhost:8765`.
  - `app/importar-exportar.mjs`: Chrome como celular (toques): importa 3 archivos desde el ⋮, mira el formato en la grilla, inserta una columna (el formato se mueve) y deshace, exporta `.xlsx` y `.csv` (descargas en `/tmp/app-descargas`), exporta desde Mis planillas y recarga. Capturas en `/tmp/app-capturas`.
  - `app/reporte.mjs` (v0.0.5): Chrome como celular de 360 px: importa un `.csv` armado por la prueba (abre en Reporte), revisa columnas y filas vacías ocultas, columnas numéricas y total, franjas y tema oscuro → claro → sistema, encabezado y primera columna fijos al deslizar, tocar una fila → Ficha, volver a la misma posición, Grilla en la fila tocada, recargar (vista y tema recordados) y reporte vacío. Muestra `OK`/`MAL` por punto. Capturas `rep-*.png`.
  - `app/reporte-filtros.mjs` (v0.0.6): Chrome como celular de 360 px: etiquetas de color (columna elegida automáticamente, mismo color en celda y chip), chips con cantidades, buscador sin acentos ni mayúsculas, "Ver todos" sin resultados, ordenar ▲ → ▼ → sin orden (vacías al final, orden natural), total y cantidad de lo filtrado, fila filtrada → Ficha, paleta clara y estado nuevo al cambiar de planilla. Capturas `filt-*.png`.
  - `importar-exportar.mjs` necesita antes `python3 pruebas/xlsx/dificil.py` (busca la hoja "Ventas" de `dificil.xlsx`).
  - `importar-exportar.mjs` toca **Grilla** después de importar (desde la v0.0.5 las importadas abren en Reporte).
  - Ojo: en el Chrome del entorno, una descarga con acentos o "·" en el nombre queda como `download` (es el entorno, no la app).
