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
      iconColor: "#D4AF37",
      sound: "notification.wav"
    }
  },
  backgroundColor: "#080808"
};

export default config;
