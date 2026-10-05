package com.exfin.oms.geofence;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@CapacitorPlugin(name = "ExfinUpdate")
public class UpdatePlugin extends Plugin {
    public static final String TAG = "UpdatePlugin";
    private static final int BUFFER_SIZE = 64 * 1024; // 64 KB streaming buffer
    private static final int CONNECT_TIMEOUT_MS = 30000; // 30 seconds
    private static final int READ_TIMEOUT_MS = 60000; // 60 seconds
    private static final int MAX_REDIRECTS = 10;

    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();
    private Future<?> activeDownloadFuture = null;
    private volatile boolean isCancelled = false;
    private PluginCall activeDownloadCall = null;

    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        try {
            Context context = getContext();
            int versionCode = com.exfin.oms.BuildConfig.VERSION_CODE;
            String versionName = com.exfin.oms.BuildConfig.VERSION_NAME;
            String packageName = context.getPackageName();

            Log.i(TAG, "[APP UPDATE DEBUG] Native installed version received: versionCode=" + versionCode + ", versionName=" + versionName);
            Log.i(TAG, "[APP UPDATE DEBUG] Installed versionCode: " + versionCode);
            Log.i(TAG, "[APP UPDATE DEBUG] Installed versionName: " + versionName);

            boolean canInstall = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                canInstall = context.getPackageManager().canRequestPackageInstalls();
            }

            JSObject ret = new JSObject();
            ret.put("versionCode", versionCode);
            ret.put("versionName", versionName);
            ret.put("packageName", packageName);
            ret.put("canInstallUnknownApps", canInstall);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "[APP UPDATE DEBUG] Failed to get installed version: " + e.getMessage(), e);
            call.reject("Failed to get installed version: " + e.getMessage());
        }
    }

    @PluginMethod
    public void fetchRemoteManifest(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || urlString.trim().isEmpty()) {
            call.reject("URL is required");
            return;
        }

        downloadExecutor.submit(() -> {
            HttpURLConnection connection = null;
            InputStream inputStream = null;
            try {
                String currentUrl = urlString;
                int redirectCount = 0;
                while (redirectCount < MAX_REDIRECTS) {
                    URL url = new URL(currentUrl);
                    if (!"https".equalsIgnoreCase(url.getProtocol())) {
                        throw new SecurityException("Only HTTPS permitted");
                    }
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setConnectTimeout(10000);
                    connection.setReadTimeout(15000);
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestProperty("User-Agent", "EXFIN-OMS-Updater/1.0 (Android)");
                    connection.setRequestProperty("Accept", "application/json, */*");
                    connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
                    connection.setRequestProperty("Pragma", "no-cache");
                    connection.connect();

                    int responseCode = connection.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                        responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                        responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                        responseCode == 307 ||
                        responseCode == 308) {

                        String location = connection.getHeaderField("Location");
                        connection.disconnect();
                        connection = null;
                        if (location == null || location.trim().isEmpty()) {
                            throw new IllegalStateException("Redirect missing Location header");
                        }
                        URL redirectUrl = new URL(url, location);
                        currentUrl = redirectUrl.toString();
                        redirectCount++;
                        continue;
                    }

                    if (responseCode != HttpURLConnection.HTTP_OK) {
                        throw new IllegalStateException("HTTP error " + responseCode);
                    }
                    break;
                }

                if (connection == null) {
                    throw new IllegalStateException("Failed to connect");
                }

                inputStream = new BufferedInputStream(connection.getInputStream(), 8192);
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = inputStream.read(buf)) != -1) {
                    baos.write(buf, 0, n);
                }
                String content = baos.toString("UTF-8");
                Log.i(TAG, "[APP UPDATE DEBUG] Remote HTTP status: 200");
                org.json.JSONObject json = new org.json.JSONObject(content);
                if (json.has("versionCode")) {
                    Log.i(TAG, "[APP UPDATE DEBUG] Remote versionCode: " + json.optInt("versionCode"));
                }
                if (json.has("versionName")) {
                    Log.i(TAG, "[APP UPDATE DEBUG] Remote versionName: " + json.optString("versionName"));
                }

                JSObject ret = JSObject.fromJSONObject(json);
                ret.put("rawContent", content);
                ret.put("httpStatus", 200);
                call.resolve(ret);

            } catch (Exception e) {
                Log.w(TAG, "[APP UPDATE DEBUG] Native manifest fetch failed: " + e.getMessage());
                call.reject("Failed to fetch manifest: " + e.getMessage());
            } finally {
                if (inputStream != null) {
                    try { inputStream.close(); } catch (Exception ignored) {}
                }
                if (connection != null) {
                    try { connection.disconnect(); } catch (Exception ignored) {}
                }
            }
        });
    }

    @PluginMethod
    public void canInstallUnknownApps(PluginCall call) {
        try {
            Context context = getContext();
            boolean canInstall = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                canInstall = context.getPackageManager().canRequestPackageInstalls();
            }
            JSObject ret = new JSObject();
            ret.put("canInstall", canInstall);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to check unknown app install permission: " + e.getMessage(), e);
            call.reject("Failed to check install permission: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openInstallUnknownAppsSettings(PluginCall call) {
        try {
            Context context = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                call.resolve(new JSObject().put("opened", true));
            } else {
                call.resolve(new JSObject().put("opened", false));
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to open install unknown apps settings: " + e.getMessage(), e);
            call.reject("Failed to open settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelUpdateDownload(PluginCall call) {
        try {
            cancelActiveDownload();
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to cancel update download: " + e.getMessage(), e);
            call.reject("Failed to cancel download: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstallUpdate(PluginCall call) {
        final String updateUrl = call.getString("updateUrl");
        if (updateUrl == null || updateUrl.trim().isEmpty()) {
            call.reject("Invalid update URL provided");
            return;
        }

        // Security: Require initial HTTPS
        if (!updateUrl.toLowerCase().startsWith("https://")) {
            call.reject("Security Violation: Only HTTPS update URLs are permitted");
            return;
        }

        cancelActiveDownload();
        activeDownloadCall = call;
        isCancelled = false;

        // Emit initial 0% progress
        JSObject initialProgress = new JSObject();
        initialProgress.put("status", "DOWNLOADING");
        initialProgress.put("progress", 0);
        initialProgress.put("bytesDownloaded", 0);
        initialProgress.put("bytesTotal", 0);
        notifyListeners("updateDownloadProgress", initialProgress, true);

        activeDownloadFuture = downloadExecutor.submit(() -> performNativeStreamingDownload(updateUrl));
    }

    private void performNativeStreamingDownload(String sourceUrl) {
        Context context = getContext();
        File downloadsDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (downloadsDir == null) {
            downloadsDir = context.getFilesDir();
        }

        File partFile = new File(downloadsDir, "ExfinOMS-Update.apk.part");
        File finalApkFile = new File(downloadsDir, "ExfinOMS-Update.apk");

        // Clean up any existing or stale part/apk files
        if (partFile.exists()) {
            partFile.delete();
        }
        if (finalApkFile.exists()) {
            finalApkFile.delete();
        }

        HttpURLConnection connection = null;
        InputStream inputStream = null;
        OutputStream outputStream = null;
        long totalBytesRead = 0;
        long expectedTotalBytes = -1;

        try {
            String currentUrl = sourceUrl;
            int redirectCount = 0;

            // Follow HTTP / HTTPS redirects up to MAX_REDIRECTS
            while (redirectCount < MAX_REDIRECTS) {
                if (isCancelled) {
                    throw new InterruptedException("Download cancelled by user");
                }

                URL url = new URL(currentUrl);
                if (!"https".equalsIgnoreCase(url.getProtocol())) {
                    throw new SecurityException("Security Violation: Insecure redirect to non-HTTPS URL: " + currentUrl);
                }

                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setInstanceFollowRedirects(false); // Handle redirects manually to enforce HTTPS
                connection.setRequestProperty("User-Agent", "EXFIN-OMS-Updater/1.0 (Android)");
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive, */*");
                connection.connect();

                int responseCode = connection.getResponseCode();

                // Check for redirect response codes (301, 302, 303, 307, 308)
                if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                    responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                    responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                    responseCode == 307 ||
                    responseCode == 308) {

                    String locationHeader = connection.getHeaderField("Location");
                    connection.disconnect();
                    connection = null;

                    if (locationHeader == null || locationHeader.trim().isEmpty()) {
                        throw new IllegalStateException("Redirect response (" + responseCode + ") missing Location header");
                    }

                    // Resolve relative redirect URLs if any
                    URL redirectUrl = new URL(url, locationHeader);
                    currentUrl = redirectUrl.toString();

                    if (!"https".equalsIgnoreCase(redirectUrl.getProtocol())) {
                        throw new SecurityException("Security Violation: Redirect target is not HTTPS: " + currentUrl);
                    }

                    redirectCount++;
                    Log.i(TAG, "Following redirect (" + redirectCount + ") to: " + currentUrl);
                    continue;
                }

                if (responseCode != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("HTTP error " + responseCode + ": " + connection.getResponseMessage());
                }

                // HTTP 200 OK reached
                break;
            }

            if (connection == null) {
                throw new IllegalStateException("Failed to establish HTTP connection after " + redirectCount + " redirects");
            }

            expectedTotalBytes = connection.getContentLengthLong();
            Log.i(TAG, "Starting streaming download. Expected total bytes: " + expectedTotalBytes);

            inputStream = new BufferedInputStream(connection.getInputStream(), BUFFER_SIZE);
            outputStream = new FileOutputStream(partFile);

            byte[] buffer = new byte[BUFFER_SIZE];
            int bytesRead;
            long lastProgressReportTime = 0;
            int lastReportedPercent = -1;

            while ((bytesRead = inputStream.read(buffer)) != -1) {
                if (isCancelled || Thread.currentThread().isInterrupted()) {
                    throw new InterruptedException("Download cancelled by user");
                }

                outputStream.write(buffer, 0, bytesRead);
                totalBytesRead += bytesRead;

                long now = System.currentTimeMillis();
                int currentPercent = 0;
                if (expectedTotalBytes > 0) {
                    currentPercent = (int) Math.floor((totalBytesRead * 100.0) / expectedTotalBytes);
                    currentPercent = Math.min(99, Math.max(0, currentPercent));
                }

                // Throttle progress events to max once every 150ms or on percentage change
                if (now - lastProgressReportTime > 150 || currentPercent != lastReportedPercent) {
                    lastProgressReportTime = now;
                    lastReportedPercent = currentPercent;

                    JSObject progressObj = new JSObject();
                    progressObj.put("status", "DOWNLOADING");
                    progressObj.put("progress", currentPercent);
                    progressObj.put("bytesDownloaded", totalBytesRead);
                    progressObj.put("bytesTotal", expectedTotalBytes > 0 ? expectedTotalBytes : 0);
                    notifyListeners("updateDownloadProgress", progressObj, true);
                }
            }

            outputStream.flush();
            outputStream.close();
            outputStream = null;

            inputStream.close();
            inputStream = null;

            if (connection != null) {
                connection.disconnect();
                connection = null;
            }

            // Verify completed part file
            if (!partFile.exists() || partFile.length() == 0) {
                throw new IllegalStateException("Downloaded APK part file is missing or empty");
            }

            if (expectedTotalBytes > 0 && totalBytesRead < expectedTotalBytes) {
                throw new IllegalStateException("Incomplete download: received " + totalBytesRead + " of " + expectedTotalBytes + " bytes");
            }

            // Atomic rename from .part to .apk
            if (!partFile.renameTo(finalApkFile)) {
                // Fallback copy if rename fails
                throw new IllegalStateException("Failed to rename .part file to final APK");
            }

            if (!finalApkFile.exists() || finalApkFile.length() == 0) {
                throw new IllegalStateException("Final APK file validation failed after rename");
            }

            Log.i(TAG, "Download finished successfully: " + finalApkFile.getAbsolutePath() + " (" + finalApkFile.length() + " bytes)");

            // Emit DOWNLOADED event with 100% progress
            JSObject completeObj = new JSObject();
            completeObj.put("status", "DOWNLOADED");
            completeObj.put("progress", 100);
            completeObj.put("bytesDownloaded", finalApkFile.length());
            completeObj.put("bytesTotal", finalApkFile.length());
            completeObj.put("fileSize", finalApkFile.length());
            notifyListeners("updateDownloadProgress", completeObj, true);

            // Launch native Android installer via FileProvider
            boolean installerLaunched = installApk(context, finalApkFile);

            if (activeDownloadCall != null) {
                JSObject res = new JSObject();
                res.put("success", true);
                res.put("installerLaunched", installerLaunched);
                res.put("fileSize", finalApkFile.length());
                activeDownloadCall.resolve(res);
                activeDownloadCall = null;
            }

        } catch (InterruptedException e) {
            Log.w(TAG, "Download was cancelled");
            cleanupFiles(partFile);

            JSObject cancelObj = new JSObject();
            cancelObj.put("status", "FAILED");
            cancelObj.put("progress", 0);
            cancelObj.put("error", "Download was cancelled");
            notifyListeners("updateDownloadProgress", cancelObj, true);

            if (activeDownloadCall != null) {
                activeDownloadCall.reject("Download was cancelled");
                activeDownloadCall = null;
            }

        } catch (Exception e) {
            Log.e(TAG, "Download failed: " + e.getMessage(), e);
            cleanupFiles(partFile);

            JSObject failObj = new JSObject();
            failObj.put("status", "FAILED");
            failObj.put("progress", 0);
            failObj.put("bytesDownloaded", totalBytesRead);
            failObj.put("bytesTotal", expectedTotalBytes > 0 ? expectedTotalBytes : 0);
            failObj.put("error", e.getMessage() != null ? e.getMessage() : "Unknown download error");
            notifyListeners("updateDownloadProgress", failObj, true);

            if (activeDownloadCall != null) {
                activeDownloadCall.reject("Update download failed: " + e.getMessage());
                activeDownloadCall = null;
            }

        } finally {
            try {
                if (outputStream != null) outputStream.close();
            } catch (Exception ignored) {}
            try {
                if (inputStream != null) inputStream.close();
            } catch (Exception ignored) {}
            try {
                if (connection != null) connection.disconnect();
            } catch (Exception ignored) {}
        }
    }

    private void cancelActiveDownload() {
        isCancelled = true;
        if (activeDownloadFuture != null && !activeDownloadFuture.isDone()) {
            activeDownloadFuture.cancel(true);
            activeDownloadFuture = null;
        }
        if (activeDownloadCall != null) {
            try {
                activeDownloadCall.reject("Download cancelled");
            } catch (Exception ignored) {}
            activeDownloadCall = null;
        }
    }

    private void cleanupFiles(File partFile) {
        try {
            if (partFile != null && partFile.exists()) {
                partFile.delete();
            }
        } catch (Exception ignored) {}
    }

    private boolean installApk(Context context, File apkFile) {
        try {
            if (apkFile == null || !apkFile.exists() || apkFile.length() == 0) {
                Log.e(TAG, "Cannot launch installer: APK file does not exist or is empty");
                return false;
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri apkUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                apkUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apkFile);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                apkUri = Uri.fromFile(apkFile);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch APK installer: " + e.getMessage(), e);
            return false;
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        cancelActiveDownload();
        try {
            downloadExecutor.shutdownNow();
        } catch (Exception ignored) {}
    }
}
