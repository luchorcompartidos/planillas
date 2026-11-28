"""Ajusta el proyecto Android generado por Capacitor (se ejecuta en GitHub Actions).
- Ícono propio
- Atrapador de cierres (PlanillasApp + CierreActivity), copiado de ANote...
- Android 5.0: arreglo de @capacitor/status-bar (getRootWindowInsets es de Android 6)
- MainActivity propia que registra el plugin Portapapeles (copiar y pegar celdas, v0.0.8), como en ANote...
Referencia: android-extra/patch-android.py del repo luchorcompartidos/notas y
plantilla/APK-DISPOSITIVOS-VIEJOS.md (sección 8) del repo luchorcompartidos/home.
"""
import os, glob, shutil

BASE = os.path.dirname(os.path.abspath(__file__))
APP = 'android/app/src/main'
PKG_DIR = f'{APP}/java/io/github/luchorcompartidos/planillas'

# 1. Recursos (ícono). Se borran los foreground PNG de Capacitor: el ícono adaptativo usa un vector propio.
for path in glob.glob(f'{APP}/res/mipmap-*/ic_launcher_foreground.png'):
    os.remove(path)
shutil.copytree(f'{BASE}/res', f'{APP}/res', dirs_exist_ok=True)

# 2. Código Java (incluye MainActivity.java: reemplaza la que genera Capacitor)
os.makedirs(PKG_DIR, exist_ok=True)
for name in os.listdir(f'{BASE}/java'):
    shutil.copy(f'{BASE}/java/{name}', f'{PKG_DIR}/{name}')

# 3. Manifest: atrapador de cierres. Muestra el error en vez de "Se ha detenido la aplicación".
m_path = f'{APP}/AndroidManifest.xml'
m = open(m_path, encoding='utf-8').read()
if '.PlanillasApp' not in m:
    assert 'android:name=' not in m.split('<application', 1)[1].split('>', 1)[0], 'El <application> ya tiene android:name'
    m = m.replace('<application', '<application\n        android:name=".PlanillasApp"', 1)
cierre = '''
        <activity android:name=".CierreActivity" android:process=":cierre" android:exported="false"
            android:excludeFromRecents="true" android:theme="@android:style/Theme.Material.Light" />
'''
if 'CierreActivity' not in m:
    m = m.replace('</application>', cierre + '    </application>', 1)
open(m_path, 'w', encoding='utf-8').write(m)

# 4. Android 5.0 (API 21): @capacitor/status-bar 7 llama a View.getRootWindowInsets() (API 23) sin control
# al arrancar y la app se cierra con NoSuchMethodError (caso ANote... v0.2.5-v0.2.6). Se protege con SDK_INT
# y en Android 5 se toma el alto de la barra del recurso "status_bar_height". Android 6+ queda igual.
SB = 'node_modules/@capacitor/status-bar/android/src/main/java/com/capacitorjs/plugins/statusbar/StatusBar.java'
sb = open(SB, encoding='utf-8').read()
viejo = 'WindowInsets insets = activity.getWindow().getDecorView().getRootWindowInsets();'
nuevo = '''if (Build.VERSION.SDK_INT < 23) { // Planillas: Android 5 no tiene getRootWindowInsets()
            int resId = activity.getResources().getIdentifier("status_bar_height", "dimen", "android");
            return resId > 0 ? (int) (activity.getResources().getDimensionPixelSize(resId) / metrics.density) : 0;
        }
        ''' + viejo
if 'Planillas: Android 5' not in sb:
    assert sb.count(viejo) == 1, 'StatusBar.java cambió: revisar el arreglo de getRootWindowInsets para Android 5'
    sb = sb.replace(viejo, nuevo, 1)
    open(SB, 'w', encoding='utf-8').write(sb)
assert 'Planillas: Android 5' in sb

assert '.PlanillasApp' in m and 'CierreActivity' in m, 'No se pudo agregar el atrapador de cierres al manifest'
ma = open(f'{PKG_DIR}/MainActivity.java', encoding='utf-8').read()
assert 'registerPlugin(PortapapelesPlugin.class)' in ma, 'MainActivity sin el plugin Portapapeles'
print('Proyecto Android ajustado: ícono, atrapador de cierres, portapapeles y status-bar para Android 5')
