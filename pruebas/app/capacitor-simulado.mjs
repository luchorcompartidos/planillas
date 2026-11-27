// Reemplaza los módulos de @capacitor/* en la prueba (la app corre como web).
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
const nada = () => Promise.resolve();
export const App = { addListener: nada, minimizeApp: nada, exitApp: nada };
export const Keyboard = { addListener: nada };
export const StatusBar = { setOverlaysWebView: nada, setStyle: nada, setBackgroundColor: nada };
export const Style = { Dark: 'DARK', Light: 'LIGHT' };
export const Filesystem = { writeFile: nada };
export const Directory = { Cache: 'CACHE' };
export const Share = { share: nada };
