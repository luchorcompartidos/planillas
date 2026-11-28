package io.github.luchorcompartidos.planillas;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Reemplaza la MainActivity que genera Capacitor (patch-android.py copia esta carpeta encima), como en ANote...
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio: leer y escribir el portapapeles del sistema (copiar y pegar celdas)
        registerPlugin(PortapapelesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
