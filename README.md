# Planillas

Planillas tipo Excel pensadas primero para el celular: web + Android (Capacitor, un solo código) y, más adelante, Windows.

- Web: https://luchorcompartidos.github.io/planillas/
- APK: en [Releases](https://github.com/luchorcompartidos/planillas/releases) (un solo APK universal, Android 5.0 o más).
- Estado y plan: [DESARROLLO.md](DESARROLLO.md).

| Versión | Contenido |
|---|---|
| v0.0.1 | Etapa 1a: esqueleto (Vite + Capacitor 7, CI con web y APK, mínimo Android 5.0) y grilla básica con borrador local |
| v0.0.2 | CI: la web se publica con un nombre de paquete por intento y reintenta sola si GitHub falla (la v0.0.1 no llegó a publicarse) |
| v0.0.3 | Etapa 1b: menú de celda (insertar/borrar filas y columnas, con Deshacer), vista Ficha (un registro por pantalla) y Mis planillas (varios archivos guardados en el dispositivo) |
| v0.0.4 | Etapa 1c: importar y exportar Excel (.xlsx, con formato: negrita, colores, alineación, bordes, anchos y altos) y CSV; en Android, "Guardar o enviar" |
| v0.0.5 | Etapa 1d-1a: vista Reporte (tabla presentable con franjas, encabezado destacado, primera columna fija, total y tema oscuro/claro) y selector Grilla / Reporte / Ficha; cada planilla recuerda su vista y las importadas abren en Reporte |
| v0.0.6 | Etapa 1d-1b: en el Reporte, etiquetas de color automáticas, buscador, filtros rápidos (chips) y ordenar tocando el título; el total y la cantidad siguen a lo filtrado |
| v0.0.7 | Etapa 1d-2: en el Reporte, agrupar con subtotales y grupos plegables, y **Configurar vista** (tema, densidad, franjas, encabezado, acento, columnas visibles y su orden, etiquetas y sus colores, buscador, filtros, orden, grupos y total con suma/promedio/cantidad/mínimo/máximo, resumen arriba), guardada en cada planilla; pestañas en orden Reporte / Ficha / Grilla y planillas nuevas en Reporte |
| v0.0.8 | Etapa 1e: escribir en la celda misma, ancho de columnas y alto de filas (arrastrando o desde el menú), elegir rangos, copiar/cortar/pegar (también con Excel y Sheets) y editar desde el Reporte |
| v0.0.9 | Etapa 2a: cuenta opcional con correo y contraseña (la misma de ANote...): iniciar sesión, crear cuenta con verificación del correo, olvidé mi contraseña, nombre visible, cambiar la contraseña y cerrar sesión. Las planillas siguen guardadas en el dispositivo (la nube llega en la 2b) |
| v0.0.10 | Etapa 2b-1: con la sesión iniciada, las planillas se guardan en la nube (Firestore) y se ven en todos tus dispositivos, también sin conexión (los cambios se suben al volver). La primera vez pregunta si subir las planillas del dispositivo; Mis planillas separa "En tu cuenta" y "Solo en este dispositivo" (⋮ → Subir a mi cuenta); al cerrar sesión se quitan del dispositivo las de la cuenta. Reglas nuevas: `firestore-planillas.rules` |
