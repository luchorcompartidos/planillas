package io.github.luchorcompartidos.planillas;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import java.io.FileInputStream;

/**
 * Atrapador de cierres: si la app se cae por un error de Java (incluso al arrancar,
 * antes de que cargue la web), en vez del aviso genérico "Se ha detenido la aplicación"
 * abre CierreActivity (en un proceso aparte) con el error para copiarlo o enviarlo.
 * Si no hay cierres, no hace nada.
 */
public class PlanillasApp extends Application {

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        // En el proceso de la pantalla de cierre no se instala (evita un bucle)
        if (processName().endsWith(":cierre")) return;
        final Thread.UncaughtExceptionHandler previo = Thread.getDefaultUncaughtExceptionHandler();
        final Context ctx = base;
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread hilo, Throwable error) {
                try {
                    String texto = informe(ctx, hilo, error);
                    Log.e("Planillas", texto);
                    Intent i = new Intent(ctx, CierreActivity.class);
                    i.putExtra(CierreActivity.EXTRA_TEXTO, texto);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                    ctx.startActivity(i);
                    android.os.Process.killProcess(android.os.Process.myPid());
                    System.exit(10);
                } catch (Throwable t) {
                    if (previo != null) previo.uncaughtException(hilo, error);
                }
            }
        });
    }

    static String informe(Context ctx, Thread hilo, Throwable error) {
        StringBuilder sb = new StringBuilder();
        sb.append("Planillas se cerró por un error\n");
        String version = "?";
        try {
            version = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (Throwable ignored) { }
        sb.append("Versión: ").append(version).append('\n');
        sb.append("Android: ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
        sb.append("Equipo: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n');
        sb.append("ABI: ").append(Build.CPU_ABI).append('\n');
        sb.append("Hilo: ").append(hilo != null ? hilo.getName() : "?").append("\n\n");
        String traza = Log.getStackTraceString(error);
        if (traza.length() > 40000) traza = traza.substring(0, 40000) + "\n…(recortado)";
        sb.append(traza);
        return sb.toString();
    }

    private static String processName() {
        FileInputStream in = null;
        try {
            in = new FileInputStream("/proc/self/cmdline");
            byte[] b = new byte[256];
            int n = in.read(b);
            int len = 0;
            while (len < n && b[len] != 0) len++;
            return new String(b, 0, Math.max(len, 0), "UTF-8");
        } catch (Throwable t) {
            return "";
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignored) { }
        }
    }
}
