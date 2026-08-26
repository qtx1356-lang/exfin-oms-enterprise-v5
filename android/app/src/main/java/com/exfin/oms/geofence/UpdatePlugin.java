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
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "ExfinUpdate")
public class UpdatePlugin extends Plugin {
    public static final String TAG = "UpdatePlugin";
    private long activeDownloadId = -1;
    private BroadcastReceiver downloadReceiver = null;

    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        try {
            Context context = getContext();
            int versionCode = com.exfin.oms.BuildConfig.VERSION_CODE;
            String versionName = com.exfin.oms.BuildConfig.VERSION_NAME;
            String packageName = context.getPackageName();

            JSObject ret = new JSObject();
            ret.put("versionCode", versionCode);
            ret.put("versionName", versionName);
            ret.put("packageName", packageName);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to get installed version: " + e.getMessage(), e);
            call.reject("Failed to get installed version: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstallUpdate(PluginCall call) {
        String updateUrl = call.getString("updateUrl");
        if (updateUrl == null || updateUrl.trim().isEmpty()) {
            call.reject("Invalid update URL provided");
            return;
        }

        try {
            Context context = getContext();
            String fileName = "ExfinOMS-Update.apk";
            File destinationFile = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
            if (destinationFile.exists()) {
                destinationFile.delete();
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(updateUrl));
            request.setTitle("Exfin OMS Update");
            request.setDescription("Downloading latest application update...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationUri(Uri.fromFile(destinationFile));
            request.allowScanningByMediaScanner();

            DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (downloadManager == null) {
                call.reject("DownloadManager service not available");
                return;
            }

            activeDownloadId = downloadManager.enqueue(request);

            // Register broadcast receiver for download completion
            if (downloadReceiver != null) {
                try {
                    context.unregisterReceiver(downloadReceiver);
                } catch (Exception ignored) {}
            }

            downloadReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == activeDownloadId) {
                        DownloadManager.Query query = new DownloadManager.Query();
                        query.setFilterById(activeDownloadId);
                        Cursor cursor = downloadManager.query(query);
                        if (cursor != null && cursor.moveToFirst()) {
                            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                            if (statusIndex >= 0) {
                                int status = cursor.getInt(statusIndex);
                                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                                    Log.i(TAG, "Download completed successfully. Initiating APK installation...");
                                    installApk(ctx, destinationFile);
                                    call.resolve(new JSObject().put("success", true));
                                } else if (status == DownloadManager.STATUS_FAILED) {
                                    int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                                    int reason = reasonIndex >= 0 ? cursor.getInt(reasonIndex) : -1;
                                    Log.e(TAG, "Download failed with reason: " + reason);
                                    call.reject("Download failed (reason code: " + reason + ")");
                                }
                            }
                            cursor.close();
                        }
                        try {
                            ctx.unregisterReceiver(this);
                        } catch (Exception ignored) {}
                    }
                }
            };

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED);
            } else {
                context.registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            }

            // Also send initial progress acknowledgment
            JSObject progressObj = new JSObject();
            progressObj.put("status", "DOWNLOADING");
            notifyListeners("updateDownloadProgress", progressObj, true);

        } catch (Exception e) {
            Log.e(TAG, "Failed to start APK download: " + e.getMessage(), e);
            call.reject("Failed to start APK download: " + e.getMessage());
        }
    }

    private void installApk(Context context, File apkFile) {
        try {
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
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch APK installer: " + e.getMessage(), e);
        }
    }
}
