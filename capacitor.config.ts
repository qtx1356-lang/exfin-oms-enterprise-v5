const config = {
  appId: 'com.exfin.oms',
  appName: 'Office Management System',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    LocalNotifications: {
      smallIcon: "ic_stat_onesignal_default",
      iconColor: "#6366F1",
      sound: "notification.wav"
    }
  },
  backgroundColor: "#0F1025"
};

export default config;
