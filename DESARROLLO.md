# DESARROLLO — Planillas (nombre definitivo a elegir)

> Archivo para retomar el trabajo en un chat nuevo.
> Uso: *"Seguimos con Planillas, etapa [X]. Leé `DESARROLLO.md` del repo luchorcompartidos/planillas."*
> Estructura según `plantilla/DESARROLLO.md` del repo home. Lo viejo va resumido en "Historial".
> Al cerrar cada etapa: actualizar secciones 1, 2, 3 y 7, y subir el archivo al repo. Además, revisar si lo hecho deja algo nuevo para `plantilla/APK-DISPOSITIVOS-VIEJOS.md` del repo home y, si corresponde, actualizarla (sección del tema + Historial) y subirla. No hace falta que el usuario lo pida.

---

## 1. Ficha rápida
| Campo | Valor |
|---|---|
| App | Planillas (nombre definitivo a elegir) |
| Repo | luchorcompartidos/planillas |
| URL publicada | https://luchorcompartidos.github.io/planillas/ |
| Tipo | Web + Android (Capacitor, un solo código, como ANote...) + Windows (forma a definir) |
| Estado | Prototipo (Etapa 1c publicada; Etapa 1 completa) |
| Última versión (Release) | v0.0.4 — 2026-11-27 |
| Se conecta con | Firebase, proyecto **notas-pro-2026** (el mismo de ANote..., mismas cuentas; datos separados) |
| Dispositivos viejos (Android 5/6) | **Sí**: aplicar `plantilla/APK-DISPOSITIVOS-VIEJOS.md` del repo home (sección 8, Capacitor) en cada cambio y, al cerrar cada etapa, revisar si lo hecho deja algo nuevo para esa guía y, si corresponde, actualizarla (sección del tema + Historial) y subirla al repo home. Meta: un solo APK universal para el celular y las dos tablets, como ANote... |

## 2. Etapa actual
**Etapa 1c — Importar y exportar** (v0.0.4, 2026-11-27). Con esto se cierra la Etapa 1 (1a, 1b y 1c).
- Antes: v0.0.3 (Etapa 1b: menú de celda, Ficha, Mis planillas). El usuario todavía no informó cómo le fue con la v0.0.3.
- Hecho en la v0.0.4:
  - **Exportar** a Excel `.xlsx` (ExcelJS 4.4.0) con negrita, cursiva, subrayado, tachado, color de letra, relleno, fuente y tamaño, alineación, ajuste de texto, bordes, anchos de columna, altos de fila y formato de número. Los textos se convierten: números (`3,5` o `3.5`), porcentajes (`50%` → 0,5 con formato `0%`), fechas `dd/mm/aaaa [hh:mm]` y horas `hh:mm` → fechas de Excel, `VERDADERO`/`FALSO` → lógicos. Quedan como texto: ceros adelante (`00123`), con `+` adelante o más de 15 dígitos (teléfonos, CBU) y fechas imposibles (`31/02`).
  - **Exportar a CSV** en dos variantes: con `;` y coma decimal (Excel en español) y con `,` y punto decimal (Google Sheets y otros). UTF-8 con BOM (Excel abre bien acentos y ñ).
  - **Importar** `.xlsx`/`.xlsm` y `.csv`/`.tsv`/`.txt` (UTF-8 o windows-1252, separador detectado solo). Cada archivo (y cada hoja de un libro) queda como **planilla nueva**; nunca pisa una existente. Al terminar, un aviso lista lo que no se pudo traer tal cual: fórmulas (queda el último resultado), celdas combinadas (se separan), gráficos, tablas dinámicas, macros, imágenes, formato de "tabla", formato condicional, validación de datos, comentarios, hipervínculos (queda el texto), filas/columnas ocultas (se ven) e inmovilizadas, tramas y degradés (color liso), texto girado o con sangría, bordes diagonales. `.xls` viejo, `.ods` y `.numbers`: mensaje para guardarlo como `.xlsx`. Límite: 10.000 filas y columnas hasta la ZZ (con aviso); más de 60.000 celdas: aviso de que puede andar lento.
  - **Formato visible en la grilla** (lo importado): negrita, colores, alineación, bordes, fuente, anchos y altos. Todavía **no se edita** (Etapa 3). Se mueve con insertar/borrar filas y columnas y entra en Deshacer.
  - **Dónde:** botón **⋮** arriba a la derecha (archivo abierto: exportar en 3 formatos, Importar, Mis planillas); en **Mis planillas**, botón **Importar** arriba y exportar en el ⋮ de cada planilla.
  - **Android:** `@capacitor/filesystem` **7.0.1** + `@capacitor/share` 7.0.4; exportar abre "Guardar o enviar" (Drive, Archivos, WhatsApp…), como en ANote...; importar usa el selector de archivos del sistema. En la web, descarga.
  - Probado: ida y vuelta en Node con ExcelJS real (`pruebas/xlsx`), libros hechos con openpyxl y con LibreOffice, `.xls`/`.ods` (mensaje), exportados abiertos con openpyxl y LibreOffice (PDF); app en Chrome como celular (`pruebas/app`) con el paquete de prueba **y con la web real que trae el APK de la Release** (build de Vite con la ExcelJS de npm). APK: sin `lib/` (universal), `sdkVersion:'21'`, el `grep` de funciones nuevas da 0.
- En curso: el usuario prueba la v0.0.4 (sección 3, paso 1).

## 3. Próximos pasos
1. **Usuario:** instalar `planillas-v0.0.4.apk` (celular y, si puede, las dos tablets) y probar: ⋮ → Exportar a Excel → "Guardar o enviar" (por ejemplo a Drive) y abrirlo en Excel o Google Sheets; exportar CSV con `;` y abrirlo en Excel; Importar un `.xlsx` propio con formato (ver que se vea y leer el aviso) y un `.csv`; en Mis planillas, Importar y el ⋮ → Exportar. Si quedó pendiente, probar también lo de la v0.0.3 (menú de celda, Ficha, Mis planillas). En las tablets, ver que el selector de archivos muestre los `.xlsx` y `.csv`.
2. **Etapa 2 — Cuenta y nube:** login de ANote... (Google + correo con contraseña propia, 2FA recomendada, seguridad de la cuenta), sincronización entre dispositivos y bloque nuevo en las reglas (ver sección 5). Usuario: registrar la app Android `io.github.luchorcompartidos.planillas` en Firebase con la misma SHA-1/SHA-256 y bajar el `google-services.json` nuevo. Ojo: el formato (`styles`, `colW`, `rowH`) también tiene que sincronizarse por celda.
3. **Etapa 3 — Formato tipo Excel:** editar el formato que hoy solo se importa (negrita, colores, alineación, bordes, anchos/altos arrastrando), lo de las tablas de ANote... (selección de rangos, copiar/pegar, combinar, ordenar), formatos de número/fecha/moneda (mostrar `nf`), inmovilizar filas/columnas, varias hojas por archivo y tipos de columna para la Ficha. Dibujar solo lo visible si la grilla crece mucho (sección 5).
4. **Etapa 4 — Fórmulas básicas** (ver sección 4). Al insertar/borrar filas o columnas habrá que ajustar las referencias de las fórmulas (hoy `shift()` solo mueve celdas, formato y anchos/altos). Al importar, guardar también la fórmula (hoy queda solo el resultado).
5. **Etapa 5 — Windows** (ver sección 5).

## 4. Decisiones tomadas
- 2026-11-26 App nueva, exclusiva de planillas/archivos con estética tipo Excel, pensada primero para pantallas chicas. Repo `luchorcompartidos/planillas`; el nombre de la app se define después.
- 2026-11-26 Mismo stack que ANote... (Vite + Capacitor 7, un solo código para web y APK) — para reutilizar CI, parches de Android 5, login, estándar de versiones y trampas ya resueltas (sección "Trampas conocidas" del DESARROLLO.md de `notas`).
- 2026-11-26 Grilla propia con modelo de celdas, **no** el editor Tiptap de ANote... — rinde con muchas filas, permite fórmulas y fusionar cambios **por celda** entre dispositivos (Yjs, mismo mecanismo que ANote...). De ANote... se reutiliza la lógica y la interfaz de tablas (`seleccion.js`, barras, paneles, menú de celda, ideas de `editor.js` y `transfer.js`).
- 2026-11-26 Mismo proyecto Firebase **notas-pro-2026** (pedido del usuario, si no perjudica): mismas cuentas; datos en colecciones propias (`sheets/...`; lo personal en `users/{uid}/planillas...`); en las reglas solo se **agrega** un bloque, sin tocar el de ANote...
- 2026-11-26 Compatibilidad con Excel/Google Sheets: fidelidad total en lo que la app soporta; al importar, avisar lo que se pierde (gráficos, tablas dinámicas, macros, formato condicional complejo). Propuesta de biblioteca: **ExcelJS** (lee y escribe estilos; SheetJS Community no guarda estilos). Se confirma en la Etapa 1.
- 2026-11-26 Fórmulas: sí, acotadas. Motor propio chico: referencias A1 y rangos, `+ - * /`, `SUMA`, `PROMEDIO`, `MIN`, `MAX`, `CONTAR`, `SI`, `REDONDEAR`, `CONCATENAR`. Se exportan como fórmulas reales (Excel recalcula); al importar una no soportada se conserva el último valor con aviso.
- 2026-11-26 Dispositivos viejos: **Sí** (Android 5.0 en adelante), un solo APK universal.
- 2026-11-26 Primera Release: **Patch → v0.0.1** (Etapa 1).
- 2026-11-27 Etapa 1 dividida en **1a** (esqueleto + grilla básica, v0.0.1), **1b** (grilla completa, Ficha, archivos) y **1c** (importar/exportar) — para que cada chat consuma menos.
- 2026-11-27 Plugins de Capacitor en la v0.0.1: solo `app`, `keyboard` y `status-bar` (los de Firebase, archivos y compartir se suman en la etapa que los use). Sin plugin de Firebase no hace falta fijar `firebaseAuthVersion` todavía (se fija en 22.3.1 en la Etapa 2, como en ANote...).
- 2026-11-27 `deploy-pages`: paquete con nombre por intento (`github-pages-${{ github.run_attempt }}`, en `upload-pages-artifact` → `name` y en `deploy-pages` → `artifact_name`) y segundo intento automático a los 30 s (`continue-on-error` en el primero). Así *Re-run failed jobs* ya no choca con el paquete del intento anterior (v0.0.2).
- 2026-11-27 Ícono propio: hoja blanca con grilla sobre verde `#1E7B4F` (provisorio hasta elegir nombre y logo).
- 2026-11-27 Archivos en **IndexedDB** (base `planillas`, almacén `files`), uno por planilla; el modelo de celdas no cambió (`cells` con claves "A1"). Respaldo en localStorage si IndexedDB no está; copia sincrónica (`planillas-pendiente`) al salir, recuperada al abrir si es más nueva (v0.0.3).
- 2026-11-27 Vista Ficha: registros = filas 2 a la última con datos; campos = columnas A a la última con datos; nombres = fila 1. Sin tipos de campo todavía (Etapa 3). Borrar registro = borrar la fila (v0.0.3).
- 2026-11-27 Insertar/borrar en el medio: al borrar la grilla mantiene el tamaño (como Excel); deshacer solo la última operación grande, desde el aviso (v0.0.3).
- 2026-11-27 CI: reintento automático de `./gradlew` (3 intentos, 60 s) por el 429 de Maven; anotado en `ESTANDAR-VERSIONES.md` del repo home (v0.0.3).
- 2026-11-27 Importar/exportar con **ExcelJS 4.4.0** (confirmado: lee y escribe estilos). Se carga recién al usarla (`import()` dinámico, ~940 KB, fuera del precache del service worker: en la web, la primera exportación necesita conexión). `jszip` directo solo para el reintento de libros que ExcelJS no lee (v0.0.4).
- 2026-11-27 El formato se guarda en el archivo con claves cortas: `styles["A1"] = { b, i, u, s, fc, bg, fn, fs, ha, va, wr, bd: { t, r, b, l: { st, c } }, nf }`, `colW` (ancho en caracteres de Excel → px = ancho × 7 + 5) y `rowH` (alto en puntos → px = alto × 4/3). La fuente más usada del libro no se guarda en cada celda. Los valores siguen siendo texto en `cells` (v0.0.4).
- 2026-11-27 Importar siempre crea planillas nuevas (una por hoja, nombre "Libro - Hoja"; si el nombre existe, "(2)"…). Fórmulas: queda el último resultado guardado (las de openpyxl no tienen: quedan vacías). Combinadas: el contenido queda en la celda de arriba a la izquierda (v0.0.4).
- 2026-11-27 CSV: exportar en dos variantes (`;` con coma decimal / `,` con punto decimal), UTF-8 con BOM, fin de línea `\r\n`. Importar: separador detectado (`;` `,` tab `|`), UTF-8 o windows-1252 (v0.0.4).
- 2026-11-27 Libros que ExcelJS no puede leer (por ejemplo, de openpyxl con gráficos o comentarios: rutas absolutas en los `.rels`): se reintenta con una copia sin dibujos ni comentarios y con las rutas pasadas a relativas (v0.0.4).

## 5. Pendientes / dudas abiertas
- [ ] Nombre de la app (y logo).
- [ ] **Windows:** PWA instalable desde Edge/Chrome (lo más simple; el login anda igual que en la web) vs. `.exe` con Tauri o Electron (el login con Google dentro de una ventana propia necesita un arreglo aparte). Decidir en la Etapa 5.
- [ ] **Firebase compartido — no perjudicar a ANote...:** `directory/{uid}` (v0.4.0 de ANote...) guarda `platform` y `version` de ANote...; Planillas no debe pisarlos (campos propios o no escribir ahí). La administración de usuarios de ANote... (revocar sesiones, borrar) va a alcanzar también a Planillas: confirmar con el usuario si está bien. Cada cambio de reglas lo pega el usuario en la consola.
- [ ] Compartir planillas con otras personas (como las notas compartidas): ¿sí, y en qué etapa?
- [ ] Deshacer/rehacer general (cada edición de celda), no solo la última operación grande: ¿hace falta? Natural en la Etapa 2 con Yjs (`UndoManager`).
- [ ] Límite de filas/columnas razonable para el plan gratuito de Firebase y para las tablets. Hoy la grilla dibuja todas las celdas (50 × 12 al empezar; el cuadro de nombre y el importador llegan hasta la fila 10000 y la columna ZZ; al importar más de 60.000 celdas hay un aviso): con muchas filas hará falta dibujar solo lo visible (Etapa 3, o antes si el usuario nota lento un `.xlsx` grande en las tablets).
- [ ] Abrir un `.xlsx`/`.csv` desde otra app de Android ("Abrir con…" / compartir hacia Planillas): no está pedido; hoy se importa desde la app.
- [x] Maven Central devuelve 429 a veces al compilar el APK (pasó en la v0.0.2): reintento automático de `./gradlew` en `ci.yml` (v0.0.3). Contra: un error real de compilación tarda ~2 min más en avisar.
- [x] Arreglo de `deploy-pages` de la v0.0.2 llevado a `notas` (ANote... v0.4.1, 2026-11-27; anduvo a la primera) y anotado en `ESTANDAR-VERSIONES.md` del repo home.

## 6. Datos técnicos clave
- Archivos principales: `index.html` (estructura + aviso ES5), `src/main.js` (grilla, edición, formato en la grilla, menú de celda, Ficha, Mis planillas, importar/exportar, diálogos, versión), `src/transfer.js` (leer/escribir `.xlsx` y `.csv`, sin nada de Android), `src/refs.js` (referencias A1 y detección de números), `src/store.js` (IndexedDB + respaldo y copia pendiente), `src/styles.css`, `src/native.js` (botón atrás, barra de estado, teclado, `deliverFile`: descargar o "Guardar o enviar"), `src/version.js` (estándar de versiones), `vite.config.js` (service worker, `target: es2022`), `capacitor.config.json` (`appId` `io.github.luchorcompartidos.planillas`, nombre "Planillas"), `android-extra/` (`patch-android.py`, `java/PlanillasApp.java` + `CierreActivity.java`, `res/` con el ícono), `.github/workflows/ci.yml` y `reemplazar-version.yml`.
- Datos locales: IndexedDB `planillas` → `files` = `{ id, name, created, updated, rows, cols, cells: { "A1": "texto" }, styles, colW, rowH }` (los tres últimos desde la v0.0.4; ver sección 4). localStorage: `planillas-ultimo` (id abierto), `planillas-vista` (`tabla`/`ficha`), `planillas-pendiente` (copia al salir), `planillas-archivos-v1` (solo si no hay IndexedDB). El viejo `planillas-borrador-v1` (v0.0.1/v0.0.2) se migra a "Planilla 1" y se borra.
- Firma del APK: la misma clave de `notas` (Secrets copiados). SHA-1 que muestra la CI: `dd:ed:ad:96:04:5c:24:50:2f:ee:52:5a:4a:16:16:66:b2:4d:20:be` (comprobar en la Etapa 2 que sea la cargada en Firebase).
- Configuración / servicios: Firebase **notas-pro-2026** (la config web es la misma de ANote...; el dominio `luchorcompartidos.github.io` ya está autorizado).
- Cómo se publica: push a `main` → GitHub Actions compila la web (Pages) y el APK; los commits que solo cambian `.md` no compilan (`paths-ignore`).
- Cómo se prueba (desde la v0.0.4, con scripts en `pruebas/`, ver `pruebas/README.md`): `bash pruebas/xlsx/correr.sh pruebas/xlsx/ida-vuelta.mjs` (arma ExcelJS desde su repo de GitHub —no trae `dist`— y prueba `transfer.js` en Node), `python3 pruebas/xlsx/dificil.py` + `importar.mjs` (libros de openpyxl y LibreOffice), `bash pruebas/app/armar.sh` + `node pruebas/app/importar-exportar.mjs` (app en Chrome como celular). Para probar el build real de Vite: bajar el APK de la Release (`curl -sL https://github.com/luchorcompartidos/planillas/releases/download/vX.Y.Z/planillas-vX.Y.Z.apk` anda), descomprimirlo y copiar `assets/public` a `/tmp/app-prueba` (el servidor de `armar.sh` lo sirve igual). Antes de la v0.0.4: armar un paquete de prueba con `esbuild` (de `/opt/npm-tools`) cambiando los módulos de `@capacitor/*` por un archivo simulado, servirlo con un servidor chico de Node y manejarlo con `puppeteer` + `/usr/bin/google-chrome` (celular con toques y PC con teclado, con capturas de pantalla). Así se probaron la v0.0.1 y la v0.0.3 (en la v0.0.3: `puppeteer` se carga con `createRequire('/opt/npm-tools/')('puppeteer')`, y conviene bloquear `api.github.com` con *request interception*; esperar `#dialog-input` antes de escribir en un diálogo). Además, en el entorno de Claude no hay red para `npm install`, pero sí `git clone` desde GitHub, `esbuild`/`typescript` en `/opt/npm-tools` (y `bun`), LibreOffice (`soffice --headless`) y `openpyxl` de Python (verificado) para abrir los `.xlsx` exportados y mirarlos de verdad (como `pruebas/` del repo notas). ExcelJS no está en `/opt/npm-tools`: se baja con `git clone` de su repo de GitHub.
- Releases: según `ESTANDAR-VERSIONES.md` del repo home (`[major]` / `[minor]` / `[patch]` / `[skip release]` en el commit).
- Estado de la CI sin login: `curl -s https://api.github.com/repos/luchorcompartidos/planillas/actions/runs?per_page=3` y los logs de un job con `curl -sL https://api.github.com/repos/luchorcompartidos/planillas/actions/jobs/<id>/logs`. Relanzar un job no se puede desde el entorno de Claude: lo hace el usuario (*Re-run failed jobs*; con el arreglo de la v0.0.2 sirve también para la web). Más trampas conocidas en la sección "Trampas conocidas" del DESARROLLO.md de `notas`.

## 7. Historial (resumido)
- 2026-11-26 — Plan inicial armado (Etapa 0). Sin Release.
- v0.0.1 (2026-11-27) — Etapa 1a: esqueleto (web + APK universal, Android 5.0 o más) y grilla básica con borrador local. DESARROLLO.md pasa de `home/borradores/planillas/` a este repo. La web no llegó a publicarse (falla de `deploy-pages`).
- v0.0.2 (2026-11-27) — CI: `deploy-pages` con nombre de paquete por intento y reintento automático. Web publicada; Release creada relanzando el APK (429 de Maven). Instalada y abierta OK.
- v0.0.3 (2026-11-27) — Etapa 1b: menú de celda (insertar/borrar filas y columnas en el medio, con Deshacer), vista Ficha, Mis planillas en IndexedDB (nueva, abrir, renombrar, duplicar, borrar; migra el borrador). CI: reintento de Gradle por el 429 de Maven.
- v0.0.4 (2026-11-27) — Etapa 1c: exportar `.xlsx` (con formato) y `.csv` (`;` o `,`), importar `.xlsx`/`.csv` como planillas nuevas con aviso de lo que se pierde, formato importado visible en la grilla, menú ⋮ del archivo, "Guardar o enviar" en Android (`@capacitor/filesystem` 7.0.1 + `@capacitor/share`). Cierra la Etapa 1. CI y APK a la primera.

---
*Al cerrar cada sesión: actualizar secciones 1, 2, 3 y 7, y subir el archivo al repo. "Dispositivos viejos" es **Sí**: revisar también `plantilla/APK-DISPOSITIVOS-VIEJOS.md` (repo home) y actualizarla si corresponde.*
