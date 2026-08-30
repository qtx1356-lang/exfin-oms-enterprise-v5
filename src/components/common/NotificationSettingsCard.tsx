import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '../ui/Card';
import {
  Bell,
  Volume2,
  VolumeX,
  Vibrate,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  FileText,
  Calendar,
  Users,
  Send,
  ExternalLink,
  Loader2,
  Info,
  XCircle,
} from 'lucide-react';
import { db } from '../../services/firebase/config';
import { doc, updateDoc } from 'firebase/firestore';
import {
  getNotificationSettings,
  updateNotificationSettings,
  NotificationSettings,
} from '../../services/notification/notificationSettings';
import {
  checkOSNotificationPermission,
  requestOSNotificationPermission,
  openAppNotificationSettings,
  sendLocalTestNotification,
  OSNotificationPermissionState,
} from '../../services/notification/pushNotificationService';

export const NotificationSettingsCard: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings>(
    getNotificationSettings()
  );
  const [permState, setPermState] =
    useState<OSNotificationPermissionState>('prompt');
  const [requestingPerm, setRequestingPerm] = useState(false);
  const [testingNotif, setTestingNotif] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Check real-time Android / OS Notification Permission
  const refreshPermissionState = useCallback(async () => {
    const state = await checkOSNotificationPermission();
    setPermState(state);
    if (state === 'granted') {
      updateNotificationSettings({ pushEnabled: true });
    }
  }, []);

  useEffect(() => {
    refreshPermissionState();

    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        setSettings(e.detail);
      }
    };

    // Refresh state when app becomes visible or focused (e.g. returning from Android Settings)
    const handleFocus = () => {
      refreshPermissionState();
    };

    window.addEventListener(
      'exfin_notif_settings_changed',
      handleSettingsChange
    );
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener(
        'exfin_notif_settings_changed',
        handleSettingsChange
      );
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [refreshPermissionState]);

  const handleToggle = async (key: keyof NotificationSettings) => {
    const updated = updateNotificationSettings({ [key]: !settings[key] });
    setSettings(updated);

    if (key === 'whatsappOptIn') {
      try {
        const regId = localStorage.getItem('registrationId');
        if (regId && db) {
          const regRef = doc(db, 'registrations', regId);
          await updateDoc(regRef, {
            whatsappConsent: updated.whatsappOptIn ? 'YES' : 'NO',
            whatsappConsentUpdatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn('Failed to sync WhatsApp opt-in preference to cloud profile:', err);
      }
    }
  };

  // Request Android / OS Permission from button
  const handleGrantPermission = async () => {
    if (requestingPerm) return;
    setRequestingPerm(true);
    setTestResult(null);

    try {
      const resultState = await requestOSNotificationPermission();
      setPermState(resultState);

      if (resultState === 'granted') {
        updateNotificationSettings({ pushEnabled: true });
        setSettings(getNotificationSettings());
      }
    } catch (e) {
      console.warn('Error requesting OS notification permission:', e);
      setPermState('denied');
    } finally {
      setRequestingPerm(false);
    }
  };

  // Open Android Application Notification Settings
  const handleOpenSettings = async () => {
    await openAppNotificationSettings();
  };

  // Send Local Test Notification
  const handleSendTestNotification = async () => {
    if (testingNotif) return;
    setTestingNotif(true);
    setTestResult(null);

    try {
      const res = await sendLocalTestNotification();
      setTestResult(res);
      if (!res.success && permState !== 'granted') {
        refreshPermissionState();
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to deliver test notification.',
      });
    } finally {
      setTestingNotif(false);
    }
  };

  return (
    <Card className="p-5 glass-card border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-purple-500/10 pb-3">
        <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
          <Bell className="w-4 h-4 text-[var(--primary-light)]" /> Push & Sound Preferences
        </h2>
        <span className="text-[10px] text-purple-300/60 font-semibold">
          Real-Time Controls
        </span>
      </div>

      {/* DYNAMIC PERMISSION BANNER */}
      {permState === 'granted' ? (
        /* GRANTED STATE */
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-emerald-200">
                ✓ Android Notifications Enabled
              </p>
              <p className="text-purple-200/80 text-[11px] mt-0.5">
                Office Management System notifications are allowed and real-time push alerts are
                active on this device.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              disabled
              className="flex-1 py-2 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-extrabold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-default"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Notifications Enabled ✓
            </button>

            <button
              onClick={handleOpenSettings}
              className="px-3 py-2 bg-purple-900/50 hover:bg-purple-800/60 text-purple-200 border border-purple-500/30 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shrink-0"
              title="Open Android Settings"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      ) : permState === 'denied' ? (
        /* DENIED / OPTIONAL DISABLED STATE */
        <div className="p-3 bg-purple-900/20 border border-purple-500/20 rounded-xl space-y-2">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-white">
                Android Push Notifications (Optional)
              </p>
              <p className="text-purple-200/80 text-[11px] mt-0.5">
                Android device push alerts are currently disabled. In-App and Email notifications remain fully active.
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenSettings}
            className="w-full py-2 bg-purple-800/50 hover:bg-purple-700/60 text-purple-200 font-bold text-xs rounded-lg transition-colors border border-purple-500/30 flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Android Notification Settings
          </button>
        </div>
      ) : (
        /* PROMPT / OPTIONAL STATE */
        <div className="p-3 glass-inner-tile border border-purple-500/30 rounded-xl space-y-2">
          <div className="flex items-start gap-2">
            <Smartphone className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-purple-200">
                Enable Android Device Push Alerts (Optional)
              </p>
              <p className="text-purple-200/80 text-[11px] mt-0.5">
                Allow Android device push notifications for instant heads-up alerts.
              </p>
            </div>
          </div>
          <button
            onClick={handleGrantPermission}
            disabled={requestingPerm}
            className="w-full py-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold text-xs rounded-lg transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {requestingPerm ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Requesting Permission...
              </>
            ) : (
              'Allow OS Push Notifications'
            )}
          </button>
        </div>
      )}

      {/* DEVICE OS PERMISSION STATUS BADGE */}
      <div className="flex items-center justify-between glass-inner-tile p-3 rounded-xl border border-purple-500/10">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold text-white">Device Push Permission</span>
        </div>
        <span
          className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border ${
            permState === 'granted'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
          }`}
        >
          {permState === 'granted'
            ? 'ENABLED ✓'
            : 'DISABLED (OPTIONAL)'}
        </span>
      </div>

      {/* TEST PUSH NOTIFICATION BUTTON */}
      <div className="glass-inner-tile p-3 rounded-xl border border-purple-500/10 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-white">Test Notification System</p>
            <p className="text-[10px] text-purple-300/70">
              Verify local notification chime & OS alert delivery
            </p>
          </div>
          <button
            onClick={handleSendTestNotification}
            disabled={testingNotif}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold text-xs rounded-lg transition-all shadow flex items-center gap-1.5 disabled:opacity-50"
          >
            {testingNotif ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Send Test Notification
          </button>
        </div>

        {/* Feedback Message */}
        {testResult && (
          <div
            className={`p-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5 ${
              testResult.success
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      {/* MASTER CONTROLS */}
      <div className="space-y-3 pt-1">
        {/* Push Notifications Switch */}
        <div className="flex items-center justify-between glass-inner-tile p-3 rounded-xl border border-purple-500/10">
          <div>
            <p className="text-xs font-bold text-white">Push Notifications</p>
            <p className="text-[10px] text-purple-300/70">
              Receive alerts when app is minimized or closed
            </p>
          </div>
          <button
            onClick={() => handleToggle('pushEnabled')}
            className={`w-12 h-6 rounded-full transition-colors p-0.5 relative cursor-pointer ${
              settings.pushEnabled ? 'bg-purple-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                settings.pushEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Sound Toggle */}
        <div className="space-y-1">
          <div className="flex items-center justify-between glass-inner-tile p-3 rounded-xl border border-purple-500/10">
            <div className="flex items-center gap-2">
              {settings.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
              <div>
                <p className="text-xs font-bold text-white">Notification Sound</p>
                <p className="text-[10px] text-purple-300/70">
                  Play audio chime for new alerts
                </p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('soundEnabled')}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 relative cursor-pointer ${
                settings.soundEnabled ? 'bg-purple-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.soundEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Clarification Explanation */}
          <div className="px-2 pt-0.5 flex items-start gap-1.5 text-[10px] text-purple-300/60 leading-tight">
            <Info className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
            <span>
              OS permission allows Android to show alert popups. Notification Sound
              controls app audio chime preferences. System channel settings
              in Android Settings may also control sound.
            </span>
          </div>
        </div>

        {/* Vibration Toggle */}
        <div className="flex items-center justify-between glass-inner-tile p-3 rounded-xl border border-purple-500/10">
          <div className="flex items-center gap-2">
            <Vibrate className="w-4 h-4 text-purple-400" />
            <div>
              <p className="text-xs font-bold text-white">Haptic Vibration</p>
              <p className="text-[10px] text-purple-300/70">
                Vibrate device on high-priority notifications
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggle('vibrationEnabled')}
            className={`w-12 h-6 rounded-full transition-colors p-0.5 relative cursor-pointer ${
              settings.vibrationEnabled ? 'bg-purple-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                settings.vibrationEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* CATEGORY TOGGLES */}
      <div className="pt-2 border-t border-purple-500/10 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-purple-300">
          Notification Categories
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between glass-inner-tile p-2.5 rounded-xl border border-purple-500/10">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-bold text-white">Task Assignments</span>
            </div>
            <input
              type="checkbox"
              checked={settings.taskNotifs}
              onChange={() => handleToggle('taskNotifs')}
              className="accent-purple-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between glass-inner-tile p-2.5 rounded-xl border border-purple-500/10">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-orange-400" />
              <span className="font-bold text-white">Leave Updates</span>
            </div>
            <input
              type="checkbox"
              checked={settings.leaveNotifs}
              onChange={() => handleToggle('leaveNotifs')}
              className="accent-purple-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between glass-inner-tile p-2.5 rounded-xl border border-purple-500/10">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-pink-400" />
              <span className="font-bold text-white">Team & Admin</span>
            </div>
            <input
              type="checkbox"
              checked={settings.teamNotifs}
              onChange={() => handleToggle('teamNotifs')}
              className="accent-purple-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between glass-inner-tile p-2.5 rounded-xl border border-purple-500/10">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-bold text-white">Attendance</span>
            </div>
            <input
              type="checkbox"
              checked={settings.attendanceNotifs}
              onChange={() => handleToggle('attendanceNotifs')}
              className="accent-purple-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between glass-inner-tile p-2.5 rounded-xl border border-emerald-500/20 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <div>
                <span className="font-bold text-white">WhatsApp Attendance Alerts</span>
                <p className="text-[10px] text-purple-300/70">Receive real-time check-in and checkout slips on WhatsApp</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.whatsappOptIn}
              onChange={() => handleToggle('whatsappOptIn')}
              className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    </Card>
  );
};
