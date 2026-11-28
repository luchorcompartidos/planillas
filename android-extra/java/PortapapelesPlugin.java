package io.github.luchorcompartidos.planillas;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Portapapeles del sistema para copiar y pegar celdas de la grilla (copiado de ANote...).
 * La WebView no deja leer el portapapeles desde JavaScript (navigator.clipboard.readText falla sin permiso),
 * así que se lee y se escribe desde acá. ClipboardManager existe desde Android 3, sirve también en Android 5.
 */
@CapacitorPlugin(name = "Portapapeles")
public class PortapapelesPlugin extends Plugin {

    private ClipboardManager cm() {
        return (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
    }

    @PluginMethod
    public void escribir(PluginCall call) {
        String texto = call.getString("texto", "");
        getActivity().runOnUiThread(() -> {
            try {
                cm().setPrimaryClip(ClipData.newPlainText("Planillas", texto));
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo copiar: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void leer(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                JSObject o = new JSObject();
                ClipboardManager m = cm();
                ClipData clip = m != null ? m.getPrimaryClip() : null;
                String texto = null;
                if (clip != null && clip.getItemCount() > 0) {
                    CharSequence cs = clip.getItemAt(0).coerceToText(getContext());
                    texto = cs != null ? cs.toString() : null;
                }
                o.put("texto", texto != null ? texto : "");
                o.put("vacio", texto == null || texto.isEmpty());
                call.resolve(o);
            } catch (Exception e) {
                call.reject("No se pudo leer el portapapeles: " + e.getMessage());
            }
        });
    }
}
