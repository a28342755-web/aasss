package com.aster.localai;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends Activity {
    private WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private volatile HttpURLConnection activeConnection;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();
        buildWebView();
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void buildWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setTextZoom(100);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }
        });
        webView.addJavascriptInterface(new NativeBridge(), "AsterNative");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void evaluate(String javascript) {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(javascript, null);
            }
        });
    }

    private String normalizeBaseUrl(String value) {
        String base = value == null ? "" : value.trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base;
    }

    private String readError(HttpURLConnection connection) {
        try {
            InputStream stream = connection.getErrorStream();
            if (stream == null) return "HTTP " + connection.getResponseCode();
            BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
            return result.toString();
        } catch (Exception error) {
            return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        }
    }

    private final class NativeBridge {
        @JavascriptInterface
        public void sendChat(String rawRequest) {
            cancelled.set(false);
            executor.execute(() -> streamChat(rawRequest));
        }

        @JavascriptInterface
        public void cancelChat() {
            cancelled.set(true);
            HttpURLConnection connection = activeConnection;
            if (connection != null) connection.disconnect();
        }

        @JavascriptInterface
        public void checkHealth(String serverUrl) {
            executor.execute(() -> healthCheck(serverUrl));
        }
    }

    private void healthCheck(String serverUrl) {
        HttpURLConnection connection = null;
        try {
            String base = normalizeBaseUrl(serverUrl);
            if (base.isEmpty()) throw new IllegalArgumentException("Ollama 서버 주소가 비어 있습니다.");
            connection = (HttpURLConnection) new URL(base + "/api/tags").openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(6000);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Exception(readError(connection));

            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            JSONObject json = new JSONObject(body.toString());
            JSONArray sourceModels = json.optJSONArray("models");
            JSONArray names = new JSONArray();
            if (sourceModels != null) {
                for (int i = 0; i < sourceModels.length(); i++) {
                    String name = sourceModels.optJSONObject(i).optString("name", "");
                    if (!name.isEmpty()) names.put(name);
                }
            }
            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("models", names);
            evaluate("window.__asterHealthResult(" + JSONObject.quote(result.toString()) + ");");
        } catch (Exception error) {
            JSONObject result = new JSONObject();
            try {
                result.put("ok", false);
                result.put("error", error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
            } catch (Exception ignored) {}
            evaluate("window.__asterHealthResult(" + JSONObject.quote(result.toString()) + ");");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void streamChat(String rawRequest) {
        HttpURLConnection connection = null;
        try {
            JSONObject request = new JSONObject(rawRequest);
            String base = normalizeBaseUrl(request.optString("server_url", ""));
            if (base.isEmpty()) throw new IllegalArgumentException("Ollama 서버 주소를 입력하세요.");

            JSONObject payload = new JSONObject();
            payload.put("model", request.getString("model"));
            payload.put("stream", true);
            payload.put("think", false);

            JSONArray messages = new JSONArray();
            String systemPrompt = request.optString("system_prompt", "").trim();
            if (!systemPrompt.isEmpty()) {
                JSONObject system = new JSONObject();
                system.put("role", "system");
                system.put("content", systemPrompt);
                messages.put(system);
            }
            JSONArray sourceMessages = request.getJSONArray("messages");
            for (int i = 0; i < sourceMessages.length(); i++) {
                messages.put(sourceMessages.getJSONObject(i));
            }
            payload.put("messages", messages);

            JSONObject options = new JSONObject();
            options.put("temperature", request.optDouble("temperature", 0.6));
            options.put("num_predict", request.optInt("max_tokens", 2048));
            payload.put("options", options);

            connection = (HttpURLConnection) new URL(base + "/api/chat").openConnection();
            activeConnection = connection;
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(0);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/x-ndjson");

            try (BufferedWriter writer = new BufferedWriter(
                    new OutputStreamWriter(connection.getOutputStream(), StandardCharsets.UTF_8))) {
                writer.write(payload.toString());
            }

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new Exception("Ollama 오류: " + readError(connection));
            }

            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
            String line;
            while (!cancelled.get() && (line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                JSONObject event = new JSONObject(line);
                if (event.has("error")) throw new Exception(event.optString("error"));
                JSONObject message = event.optJSONObject("message");
                if (message != null) {
                    String content = message.optString("content", "");
                    if (!content.isEmpty()) {
                        evaluate("window.__asterOnChunk(" + JSONObject.quote(content) + ");");
                    }
                }
                if (event.optBoolean("done", false)) break;
            }

            evaluate("window.__asterOnDone(" + cancelled.get() + ");");
        } catch (Exception error) {
            if (cancelled.get()) {
                evaluate("window.__asterOnDone(true);");
            } else {
                String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
                evaluate("window.__asterOnError(" + JSONObject.quote(message) + ");");
            }
        } finally {
            activeConnection = null;
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(
                "window.__asterHandleBack ? window.__asterHandleBack() : false",
                handled -> {
                    if (!"true".equals(handled)) {
                        if (webView.canGoBack()) webView.goBack();
                        else MainActivity.super.onBackPressed();
                    }
                }
        );
    }

    @Override
    protected void onDestroy() {
        cancelled.set(true);
        if (activeConnection != null) activeConnection.disconnect();
        executor.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("AsterNative");
            webView.destroy();
        }
        super.onDestroy();
    }
}
