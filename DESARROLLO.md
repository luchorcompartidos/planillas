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
| Estado | Idea (plan armado) |
| Última versión (Release) | — (la primera será **v0.0.1, Patch**) |
| Se conecta con | Firebase, proyecto **notas-pro-2026** (el mismo de ANote..., mismas cuentas; datos separados) |
| Dispositivos viejos (Android 5/6) | **Sí**: aplicar `plantilla/APK-DISPOSITIVOS-VIEJOS.md` del repo home (sección 8, Capacitor) en cada cambio y, al cerrar cada etapa, revisar si lo hecho deja algo nuevo para esa guía y, si corresponde, actualizarla (sección del tema + Historial) y subirla al repo home. Meta: un solo APK universal para el celular y las dos tablets, como ANote... |

## 2. Etapa actual
**Etapa 0 — Plan y preparación** (2026-11-26)
- Objetivo: dejar definido el enfoque, las etapas y lo que se reutiliza de ANote...
- Hecho: plan por etapas (sección 3), decisiones (sección 4) y este archivo.
- En curso: el usuario tiene que crear el repo y darle acceso a Claude (Claude no puede crear repos: el `gh` del entorno no tiene sesión).

## 3. Próximos pasos
1. **Usuario — crear el repo:** GitHub → New repository → `planillas`, **público**, con README. Después, darle acceso a la app de Claude para GitHub (igual que con `notas`) y en Settings → Pages → Source elegir **GitHub Actions**.
2. **Usuario — Secrets de firma:** cargar en `planillas` (Settings → Secrets and variables → Actions) los mismos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` y `ANDROID_KEY_ALIAS` de `notas`. Así la SHA-1/SHA-256 es la misma que ya está en Firebase.
3. **Etapa 1 — v0.0.1 (Patch), prueba de concepto sin cuenta:**
   - Esqueleto copiado de `notas`: Vite + Capacitor 7, `ci.yml` (versión por marca, Pages, APK con mínimo Android 5.0, `aapt`, tabla "¿Qué archivo bajar?"), `patch-android.py` (status-bar, Cordova, atrapador de cierres), `version.js` (estándar de versiones), aviso ES5 de WebView vieja, `target` compatible con Chromium 94.
   - Grilla propia: celdas con letras/números, desplazamiento con encabezados fijos, tocar para seleccionar y editar en una barra de fórmula, agregar/insertar/borrar filas y columnas.
   - **Vista Ficha**: un registro por pantalla (fila 1 = nombres de campo), anterior/siguiente, crear, modificar y ver; cambiar de vista en cualquier momento, quedando en el mismo registro.
   - Guardado local (IndexedDB) y lista de archivos.
   - Importar y exportar `.xlsx` (con anchos, altos, negrita, colores, alineación y bordes) y `.csv`.
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

## 5. Pendientes / dudas abiertas
- [ ] Nombre de la app (y logo).
- [ ] **Windows:** PWA instalable desde Edge/Chrome (lo más simple; el login anda igual que en la web) vs. `.exe` con Tauri o Electron (el login con Google dentro de una ventana propia necesita un arreglo aparte). Decidir en la Etapa 5.
- [ ] **Firebase compartido — no perjudicar a ANote...:** `directory/{uid}` (v0.4.0 de ANote...) guarda `platform` y `version` de ANote...; Planillas no debe pisarlos (campos propios o no escribir ahí). La administración de usuarios de ANote... (revocar sesiones, borrar) va a alcanzar también a Planillas: confirmar con el usuario si está bien. Cada cambio de reglas lo pega el usuario en la consola.
- [ ] Compartir planillas con otras personas (como las notas compartidas): ¿sí, y en qué etapa?
- [ ] Límite de filas/columnas razonable para el plan gratuito de Firebase y para las tablets.

## 6. Datos técnicos clave
- Archivos principales: (a crear en la Etapa 1) copiados/adaptados de `notas`: `src/main.js`, `src/firebase.js`, `src/version.js`, `src/native.js`, `android-extra/`, `.github/workflows/ci.yml`, `capacitor.config.json` (`appId` propuesto: `io.github.luchorcompartidos.planillas`).
- Configuración / servicios: Firebase **notas-pro-2026** (la config web es la misma de ANote...; el dominio `luchorcompartidos.github.io` ya está autorizado).
- Cómo se publica: push a `main` → GitHub Actions compila la web (Pages) y el APK; los commits que solo cambian `.md` no compilan (`paths-ignore`).
- Cómo se prueba: en el entorno de Claude no hay red para `npm install`, pero sí `git clone` desde GitHub, `esbuild`/`typescript` en `/opt/npm-tools` (y `bun`), LibreOffice (`soffice --headless`) y `openpyxl` de Python (verificado) para abrir los `.xlsx` exportados y mirarlos de verdad (como `pruebas/` del repo notas). ExcelJS no está en `/opt/npm-tools`: se baja con `git clone` de su repo de GitHub.
- Releases: según `ESTANDAR-VERSIONES.md` del repo home (`[major]` / `[minor]` / `[patch]` / `[skip release]` en el commit).

## 7. Historial (resumido)
- 2026-11-26 — Plan inicial armado (Etapa 0). Sin Release.

---
*Al cerrar cada sesión: actualizar secciones 1, 2, 3 y 7, y subir el archivo al repo. "Dispositivos viejos" es **Sí**: revisar también `plantilla/APK-DISPOSITIVOS-VIEJOS.md` (repo home) y actualizarla si corresponde.*
