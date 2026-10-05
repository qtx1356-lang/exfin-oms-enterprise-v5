# Proguard & R8 Optimization and Keep Rules for EXFIN OMS

# Preserve Capacitor core and plugin annotations & reflection
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keepclasseswithmembers class * {
    @com.getcapacitor.annotation.CapacitorPlugin <methods>;
}
-keepclasseswithmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
-keepclasseswithmembers class * {
    @com.getcapacitor.annotation.Permission <fields>;
}

# Preserve Native Plugins, Receivers, Services & Activities
-keep class com.exfin.oms.MainActivity { *; }
-keep class com.exfin.oms.GreetingTtsPlugin { *; }
-keep class com.exfin.oms.geofence.UpdatePlugin { *; }
-keep class com.exfin.oms.geofence.GeofencePlugin { *; }
-keep class com.exfin.oms.geofence.OfficeLocationService { *; }
-keep class com.exfin.oms.geofence.OfficeGeofenceHelper { *; }
-keep class com.exfin.oms.geofence.GeofenceBroadcastReceiver { *; }
-keep class com.exfin.oms.geofence.BootReceiver { *; }
-keep class com.exfin.oms.BuildConfig {
    public static final int VERSION_CODE;
    public static final java.lang.String VERSION_NAME;
}

# Preserve AndroidX FileProvider for secure APK updates
-keep class androidx.core.content.FileProvider { *; }

# Preserve Google Play Services Location & Geofencing
-keep class com.google.android.gms.location.** { *; }
-keep class com.google.android.gms.common.** { *; }
-keep class com.google.android.gms.tasks.** { *; }

# Preserve Firebase Cloud Messaging & Notification Plugins
-keep class com.google.firebase.** { *; }
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }
-keep class com.capacitorjs.plugins.localnotifications.** { *; }

# General safety
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-dontwarn com.google.firebase.**
-dontwarn com.getcapacitor.**
-dontwarn androidx.**

