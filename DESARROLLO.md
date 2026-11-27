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
| Estado | Prototipo (Etapa 1a publicada) |
| Última versión (Release) | v0.0.1 — 2026-11-27 (la v0.0.2 se crea al relanzar el job `android`) |
| Se conecta con | Firebase, proyecto **notas-pro-2026** (el mismo de ANote..., mismas cuentas; datos separados) |
| Dispositivos viejos (Android 5/6) | **Sí**: aplicar `plantilla/APK-DISPOSITIVOS-VIEJOS.md` del repo home (sección 8, Capacitor) en cada cambio y, al cerrar cada etapa, revisar si lo hecho deja algo nuevo para esa guía y, si corresponde, actualizarla (sección del tema + Historial) y subirla al repo home. Meta: un solo APK universal para el celular y las dos tablets, como ANote... |

## 2. Etapa actual
**Etapa 1a — Esqueleto y grilla básica** (v0.0.1, 2026-11-27). La Etapa 1 se dividió en 1a, 1b y 1c para que cada chat salga más barato.
- Hecho: esqueleto copiado de `notas` (Vite + Capacitor 7, `ci.yml` con web + APK, mínimo Android 5.0, `aapt`, firma fija, tabla "¿Qué archivo bajar?", `reemplazar-version.yml`), `patch-android.py` (ícono propio, atrapador de cierres `PlanillasApp` + `CierreActivity`, arreglo de `@capacitor/status-bar` para Android 5), `version.js`, aviso ES5 de WebView vieja. Grilla básica: letras/números, encabezados fijos, tocar para seleccionar y otra vez para editar en la barra de fórmula, cuadro de nombre (escribir `B12` + Enter), teclado físico (flechas, Tab, Enter/F2, Supr, escribir reemplaza), "+ Fila", "+ Columna", "Borrar celda", números alineados a la derecha. Borrador único guardado en el dispositivo (localStorage; se guarda también al salir). Probada en Chrome headless (celular y PC).
- CI de la v0.0.1: APK compilado y firmado a la primera (sin bibliotecas que pidan más que API 21). La web falló en `deploy-pages` ("No artifacts named github-pages"), y al relanzarla con *Re-run failed jobs* volvió a fallar con "Multiple artifacts named github-pages" (el reintento sube un segundo paquete con el mismo nombre).
- v0.0.2 (arreglo de la CI): paquete de Pages con nombre por intento (`github-pages-<run_attempt>`) y segundo intento automático de `deploy-pages` a los 30 s. **La web se publicó bien.** El APK falló por el 429 pasajero de Maven Central, así que la Release v0.0.2 todavía no existe.
- En curso: el usuario relanza el job `android` y prueba el APK (sección 3, paso 1).

## 3. Próximos pasos
1. **Usuario:** en GitHub → Actions → run "CI" de la v0.0.2 (commit "CI: paquete de Pages…") → **Re-run failed jobs** (vuelve a correr solo `android` y crea la Release v0.0.2 con el APK; la web no se toca). Después, instalar `planillas-v0.0.2.apk` de la Release en el celular y en las dos tablets (Android 5.0 y 6.0.1) y probar: abre, se ve la grilla, editar, "+ Fila", cerrar y volver a abrir (el borrador queda).
2. **Etapa 1b** (estimado entre 20% y 30%): grilla completa (insertar/borrar filas y columnas en el medio, menú de celda), **vista Ficha** (un registro por pantalla, fila 1 = nombres de campo, anterior/siguiente, crear, modificar y ver; cambiar de vista quedando en el mismo registro), guardado en IndexedDB y **lista de archivos** (nuevo, abrir, renombrar, borrar; el borrador de la v0.0.1 pasa a ser el primer archivo). Si el 429 de Maven se repite, sumar a `ci.yml` un reintento automático de la compilación del APK (ver sección 5).
3. **Etapa 1c** (estimado entre 15% y 25%): importar y exportar `.xlsx` (con anchos, altos, negrita, colores, alineación y bordes; ExcelJS) y `.csv`, probado con LibreOffice y openpyxl. En el APK, `@capacitor/filesystem` fijado en **7.0.1** (la 7.1.x pide Android 6) y compartir/guardar como en ANote...
4. **Etapa 2 — Cuenta y nube:** login de ANote... (Google + correo con contraseña propia, 2FA recomendada, seguridad de la cuenta), sincronización entre dispositivos y bloque nuevo en las reglas (ver sección 5). Usuario: registrar la app Android `io.github.luchorcompartidos.planillas` en Firebase con la misma SHA-1/SHA-256 y bajar el `google-services.json` nuevo.
5. **Etapa 3 — Formato tipo Excel:** lo de las tablas de ANote... (selección de rangos, copiar/pegar, combinar, ordenar, anchos/altos, alineación) más formatos de número/fecha/moneda, inmovilizar filas/columnas, varias hojas por archivo y tipos de columna para la Ficha.
6. **Etapa 4 — Fórmulas básicas** (ver sección 4).
7. **Etapa 5 — Windows** (ver sección 5).

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

## 5. Pendientes / dudas abiertas
- [ ] Nombre de la app (y logo).
- [ ] **Windows:** PWA instalable desde Edge/Chrome (lo más simple; el login anda igual que en la web) vs. `.exe` con Tauri o Electron (el login con Google dentro de una ventana propia necesita un arreglo aparte). Decidir en la Etapa 5.
- [ ] **Firebase compartido — no perjudicar a ANote...:** `directory/{uid}` (v0.4.0 de ANote...) guarda `platform` y `version` de ANote...; Planillas no debe pisarlos (campos propios o no escribir ahí). La administración de usuarios de ANote... (revocar sesiones, borrar) va a alcanzar también a Planillas: confirmar con el usuario si está bien. Cada cambio de reglas lo pega el usuario en la consola.
- [ ] Compartir planillas con otras personas (como las notas compartidas): ¿sí, y en qué etapa?
- [ ] Límite de filas/columnas razonable para el plan gratuito de Firebase y para las tablets. Hoy la grilla dibuja todas las celdas (50 × 12 al empezar; el cuadro de nombre llega hasta la fila 10000 y la columna ZZ): con muchas filas hará falta dibujar solo lo visible (Etapa 1b o 3).
- [ ] Maven Central devuelve 429 a veces al compilar el APK (pasó en la v0.0.2): evaluar un reintento automático de `./gradlew` en `ci.yml` (por ahora se resuelve con *Re-run failed jobs*).
- [x] Arreglo de `deploy-pages` de la v0.0.2 llevado a `notas` (ANote... v0.4.1, 2026-11-27; anduvo a la primera) y anotado en `ESTANDAR-VERSIONES.md` del repo home.

## 6. Datos técnicos clave
- Archivos principales: `index.html` (estructura + aviso ES5), `src/main.js` (grilla, edición, versión), `src/styles.css`, `src/native.js` (botón atrás, barra de estado, teclado), `src/version.js` (estándar de versiones), `vite.config.js` (service worker, `target: es2022`), `capacitor.config.json` (`appId` `io.github.luchorcompartidos.planillas`, nombre "Planillas"), `android-extra/` (`patch-android.py`, `java/PlanillasApp.java` + `CierreActivity.java`, `res/` con el ícono), `.github/workflows/ci.yml` y `reemplazar-version.yml`.
- Borrador local: `localStorage` clave `planillas-borrador-v1` = `{ rows, cols, cells: { "A1": "texto" } }`.
- Firma del APK: la misma clave de `notas` (Secrets copiados). SHA-1 que muestra la CI: `dd:ed:ad:96:04:5c:24:50:2f:ee:52:5a:4a:16:16:66:b2:4d:20:be` (comprobar en la Etapa 2 que sea la cargada en Firebase).
- Configuración / servicios: Firebase **notas-pro-2026** (la config web es la misma de ANote...; el dominio `luchorcompartidos.github.io` ya está autorizado).
- Cómo se publica: push a `main` → GitHub Actions compila la web (Pages) y el APK; los commits que solo cambian `.md` no compilan (`paths-ignore`).
- Cómo se prueba: armar un paquete de prueba con `esbuild` (de `/opt/npm-tools`) cambiando los módulos de `@capacitor/*` por un archivo simulado, servirlo con un servidor chico de Node y manejarlo con `puppeteer` + `/usr/bin/google-chrome` (celular con toques y PC con teclado, con capturas de pantalla). Así se probó la v0.0.1. Además, en el entorno de Claude no hay red para `npm install`, pero sí `git clone` desde GitHub, `esbuild`/`typescript` en `/opt/npm-tools` (y `bun`), LibreOffice (`soffice --headless`) y `openpyxl` de Python (verificado) para abrir los `.xlsx` exportados y mirarlos de verdad (como `pruebas/` del repo notas). ExcelJS no está en `/opt/npm-tools`: se baja con `git clone` de su repo de GitHub.
- Releases: según `ESTANDAR-VERSIONES.md` del repo home (`[major]` / `[minor]` / `[patch]` / `[skip release]` en el commit).
- Estado de la CI sin login: `curl -s https://api.github.com/repos/luchorcompartidos/planillas/actions/runs?per_page=3` y los logs de un job con `curl -sL https://api.github.com/repos/luchorcompartidos/planillas/actions/jobs/<id>/logs`. Relanzar un job no se puede desde el entorno de Claude: lo hace el usuario (*Re-run failed jobs*; con el arreglo de la v0.0.2 sirve también para la web). Más trampas conocidas en la sección "Trampas conocidas" del DESARROLLO.md de `notas`.

## 7. Historial (resumido)
- 2026-11-26 — Plan inicial armado (Etapa 0). Sin Release.
- v0.0.1 (2026-11-27) — Etapa 1a: esqueleto (web + APK universal, Android 5.0 o más) y grilla básica con borrador local. DESARROLLO.md pasa de `home/borradores/planillas/` a este repo. La web no llegó a publicarse (falla de `deploy-pages`).
- v0.0.2 (2026-11-27) — CI: `deploy-pages` con nombre de paquete por intento y reintento automático. Web publicada; la Release espera que se relance el APK (429 de Maven).

---
*Al cerrar cada sesión: actualizar secciones 1, 2, 3 y 7, y subir el archivo al repo. "Dispositivos viejos" es **Sí**: revisar también `plantilla/APK-DISPOSITIVOS-VIEJOS.md` (repo home) y actualizarla si corresponde.*
