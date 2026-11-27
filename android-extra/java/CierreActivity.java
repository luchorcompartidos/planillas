package io.github.luchorcompartidos.planillas;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Pantalla que muestra el error de un cierre (ver PlanillasApp), con Copiar / Enviar… / Cerrar.
 * Corre en el proceso ":cierre" y usa solo vistas de Android (sin Capacitor ni AndroidX),
 * para funcionar aunque lo que falló sea justamente eso.
 */
public class CierreActivity extends Activity {
    static final String EXTRA_TEXTO = "texto";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String t = getIntent() != null ? getIntent().getStringExtra(EXTRA_TEXTO) : null;
        final String texto = t != null ? t : "(sin detalle)";
        int pad = (int) (16 * getResources().getDisplayMetrics().density);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(pad, pad, pad, pad);

        TextView titulo = new TextView(this);
        titulo.setText("Planillas se cerró por un error");
        titulo.setTextSize(20);
        titulo.setTypeface(Typeface.DEFAULT_BOLD);
        raiz.addView(titulo);

        TextView ayuda = new TextView(this);
        ayuda.setText("Tocá «Copiar» o «Enviar…» y pasale este texto a Claude para corregirlo.");
        ayuda.setPadding(0, pad / 2, 0, pad / 2);
        raiz.addView(ayuda);

        LinearLayout botones = new LinearLayout(this);
        botones.setOrientation(LinearLayout.HORIZONTAL);
        botones.addView(boton("Copiar", new View.OnClickListener() {
            @Override public void onClick(View v) {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Error de Planillas", texto));
                Toast.makeText(CierreActivity.this, "Copiado", Toast.LENGTH_SHORT).show();
            }
        }));
        botones.addView(boton("Enviar…", new View.OnClickListener() {
            @Override public void onClick(View v) {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, "Error de Planillas");
                i.putExtra(Intent.EXTRA_TEXT, texto);
                startActivity(Intent.createChooser(i, "Enviar el error con…"));
            }
        }));
        botones.addView(boton("Cerrar", new View.OnClickListener() {
            @Override public void onClick(View v) { finish(); }
        }));
        raiz.addView(botones);

        TextView detalle = new TextView(this);
        detalle.setText(texto);
        detalle.setTextSize(12);
        detalle.setTypeface(Typeface.MONOSPACE);
        detalle.setTextIsSelectable(true);
        detalle.setPadding(0, pad / 2, 0, 0);
        ScrollView sv = new ScrollView(this);
        sv.addView(detalle);
        raiz.addView(sv, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(raiz);
    }

    private Button boton(String texto, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(texto);
        b.setAllCaps(false);
        b.setOnClickListener(l);
        return b;
    }
}
