package com.exfin.oms.geofence;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
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

import java.io.File;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "ExfinUpdate")
public class UpdatePlugin extends Plugin {
    public static final String TAG = "UpdatePlugin";
    private long activeDownloadId = -1;
    private BroadcastReceiver downloadReceiver = null;
    private ScheduledExecutorService progressPoller = null;
    private PluginCall activeDownloadCall = null;

    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        try {
            Context context = getContext();
            int versionCode = com.exfin.oms.BuildConfig.VERSION_CODE;
            String versionName = com.exfin.oms.BuildConfig.VERSION_NAME;
            String packageName = context.getPackageName();

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
            Log.e(TAG, "Failed to get installed version: " + e.getMessage(), e);
            call.reject("Failed to get installed version: " + e.getMessage());
        }
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
            cleanupActiveDownload();
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
        String updateUrl = call.getString("updateUrl");
        if (updateUrl == null || updateUrl.trim().isEmpty()) {
            call.reject("Invalid update URL provided");
            return;
        }

        // Security: Enforce HTTPS for APK downloads
        if (!updateUrl.toLowerCase().startsWith("https://")) {
            call.reject("Security Violation: Only HTTPS update URLs are permitted");
            return;
        }

        // Clean up any ongoing download prior to starting a fresh download
        cleanupActiveDownload();
        activeDownloadCall = call;

        try {
            Context context = getContext();
            String fileName = "ExfinOMS-Update.apk";
            File destinationFile = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
            if (destinationFile.exists()) {
                destinationFile.delete();
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(updateUrl));
            request.setTitle("EXFIN OMS Update");
            request.setDescription("Downloading latest application update...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationUri(Uri.fromFile(destinationFile));
            request.setMimeType("application/vnd.android.package-archive");

            DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (downloadManager == null) {
                call.reject("DownloadManager service not available");
                return;
            }

            activeDownloadId = downloadManager.enqueue(request);

            // Register broadcast receiver for download completion
            downloadReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == activeDownloadId) {
                        stopProgressPoller();
                        DownloadManager.Query query = new DownloadManager.Query();
                        query.setFilterById(activeDownloadId);
                        Cursor cursor = downloadManager.query(query);
                        boolean downloadSuccess = false;
                        int failureReason = -1;

                        if (cursor != null && cursor.moveToFirst()) {
                            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                            if (statusIndex >= 0) {
                                int status = cursor.getInt(statusIndex);
                                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                                    downloadSuccess = true;
                                } else if (status == DownloadManager.STATUS_FAILED) {
                                    int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                                    failureReason = reasonIndex >= 0 ? cursor.getInt(reasonIndex) : -1;
                                }
                            }
                            cursor.close();
                        }

                        if (downloadSuccess && destinationFile.exists() && destinationFile.length() > 0) {
                            Log.i(TAG, "Download completed successfully (" + destinationFile.length() + " bytes). Initiating APK installation...");

                            JSObject completeObj = new JSObject();
                            completeObj.put("status", "DOWNLOADED");
                            completeObj.put("progress", 100);
                            completeObj.put("fileSize", destinationFile.length());
                            notifyListeners("updateDownloadProgress", completeObj, true);

                            boolean launched = installApk(ctx, destinationFile);
                            if (activeDownloadCall != null) {
                                JSObject res = new JSObject();
                                res.put("success", true);
                                res.put("installerLaunched", launched);
                                activeDownloadCall.resolve(res);
                                activeDownloadCall = null;
                            }
                        } else {
                            Log.e(TAG, "Download failed or downloaded file is empty. Reason code: " + failureReason);
                            JSObject failObj = new JSObject();
                            failObj.put("status", "FAILED");
                            failObj.put("progress", 0);
                            failObj.put("error", "Download failed or corrupted APK file (code " + failureReason + ")");
                            notifyListeners("updateDownloadProgress", failObj, true);

                            if (activeDownloadCall != null) {
                                activeDownloadCall.reject("Download failed (reason code: " + failureReason + ")");
                                activeDownloadCall = null;
                            }
                        }

                        try {
                            ctx.unregisterReceiver(this);
                            downloadReceiver = null;
                        } catch (Exception ignored) {}
                    }
                }
            };

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED);
            } else {
                context.registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            }

            // Initial progress notification (0%)
            JSObject progressObj = new JSObject();
            progressObj.put("status", "DOWNLOADING");
            progressObj.put("progress", 0);
            notifyListeners("updateDownloadProgress", progressObj, true);

            // Start background progress poller every 300ms
            startProgressPoller(downloadManager, destinationFile);

        } catch (Exception e) {
            Log.e(TAG, "Failed to start APK download: " + e.getMessage(), e);
            cleanupActiveDownload();
            call.reject("Failed to start APK download: " + e.getMessage());
        }
    }

    private void startProgressPoller(DownloadManager downloadManager, File destinationFile) {
        stopProgressPoller();
        progressPoller = Executors.newSingleThreadScheduledExecutor();
        progressPoller.scheduleAtFixedRate(() -> {
            try {
                if (activeDownloadId <= 0) return;

                DownloadManager.Query q = new DownloadManager.Query();
                q.setFilterById(activeDownloadId);
                Cursor cursor = downloadManager.query(q);

                if (cursor != null && cursor.moveToFirst()) {
                    int bytesDownloadedIdx = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                    int bytesTotalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                    int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);

                    if (bytesDownloadedIdx >= 0 && bytesTotalIdx >= 0 && statusIdx >= 0) {
                        long bytesDownloaded = cursor.getLong(bytesDownloadedIdx);
                        long bytesTotal = cursor.getLong(bytesTotalIdx);
                        int status = cursor.getInt(statusIdx);

                        if (status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PAUSED || status == DownloadManager.STATUS_PENDING) {
                            int progress = (bytesTotal > 0) ? (int) ((bytesDownloaded * 100) / bytesTotal) : 0;
                            JSObject progressObj = new JSObject();
                            progressObj.put("status", "DOWNLOADING");
                            progressObj.put("progress", Math.min(99, Math.max(0, progress)));
                            progressObj.put("bytesDownloaded", bytesDownloaded);
                            progressObj.put("bytesTotal", bytesTotal);
                            notifyListeners("updateDownloadProgress", progressObj, true);
                        }
                    }
                    cursor.close();
                }
            } catch (Exception e) {
                Log.w(TAG, "Error checking download progress: " + e.getMessage());
            }
        }, 150, 300, TimeUnit.MILLISECONDS);
    }

    private void stopProgressPoller() {
        if (progressPoller != null && !progressPoller.isShutdown()) {
            try {
                progressPoller.shutdownNow();
            } catch (Exception ignored) {}
            progressPoller = null;
        }
    }

    private void cleanupActiveDownload() {
        stopProgressPoller();
        if (downloadReceiver != null) {
            try {
                getContext().unregisterReceiver(downloadReceiver);
            } catch (Exception ignored) {}
            downloadReceiver = null;
        }
        activeDownloadId = -1;
        activeDownloadCall = null;
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
        cleanupActiveDownload();
    }
}
