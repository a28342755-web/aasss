package com.aster.synth;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.media.AudioManager;
import android.os.Bundle;
import android.webkit.WebView;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private static final int BACKGROUND = 0xFF15141A; // --bg in styles.css
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC); // volume keys must adjust the synth even while it is silent

        webView = new WebView(this);
        webView.setBackgroundColor(BACKGROUND);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setTextZoom(100);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        root.setFitsSystemWindows(true); // Android 15+ is edge-to-edge: keep the pads clear of the system bars
        root.addView(webView);
        setContentView(root);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause(); // page becomes hidden; app.js silences the audio
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
