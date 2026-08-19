package com.exfin.oms;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;
import com.exfin.oms.geofence.GeofencePlugin;
import com.exfin.oms.geofence.OfficeGeofenceHelper;

public class MainActivity extends BridgeActivity {
    private static final String OFFLINE_HTML = "<!DOCTYPE html>" +
            "<html lang=\"en\"><head><meta charset=\"UTF-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\">" +
            "<title>You're offline</title>" +
            "<style>" +
            "body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0f172a; color: #f8fafc; text-align: center; padding: 24px; box-sizing: border-box; }" +
            ".card { background-color: #1e293b; border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 20px; padding: 32px 24px; max-width: 360px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }" +
            ".icon { font-size: 44px; margin-bottom: 16px; }" +
            "h1 { font-size: 20px; margin: 0 0 10px; font-weight: 700; color: #ffffff; }" +
            "p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin: 0 0 24px; }" +
            ".btn { background-color: #7c3aed; color: #ffffff; border: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; }" +
            ".btn:active { background-color: #6d28d9; }" +
            "</style></head><body>" +
            "<div class=\"card\">" +
            "<div class=\"icon\">📡</div>" +
            "<h1>You're offline</h1>" +
            "<p>Check your internet connection and try again.</p>" +
            "<button class=\"btn\" onclick=\"window.location.reload()\">Retry</button>" +
            "</div></body></html>";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GeofencePlugin.class);
        super.onCreate(savedInstanceState);

        // Ensure native office geofence is active
        OfficeGeofenceHelper.registerOfficeGeofence(this);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebViewClient originalClient = getBridge().getWebViewClient();

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request != null && request.isForMainFrame()) {
                        view.loadDataWithBaseURL(null, OFFLINE_HTML, "text/html", "UTF-8", null);
                    } else if (originalClient != null) {
                        originalClient.onReceivedError(view, request, error);
                    }
                }

                @Override
                public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                    view.loadDataWithBaseURL(null, OFFLINE_HTML, "text/html", "UTF-8", null);
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (originalClient != null) {
                        return originalClient.shouldOverrideUrlLoading(view, request);
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-verify registration on resume
        OfficeGeofenceHelper.registerOfficeGeofence(this);
    }
}
