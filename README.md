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
