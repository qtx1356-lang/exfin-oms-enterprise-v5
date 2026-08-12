const config = {
  appId: 'com.exfin.oms',
  appName: 'EXFIN OMS',
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
      iconColor: "#7C3AED",
      sound: "notification.wav"
    }
  }
};

export default config;
