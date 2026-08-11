import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import {
  getNotificationSettings,
  updateNotificationSettings,
  NotificationSettings,
} from '../../services/notification/notificationSettings';
import { requestOSNotificationPermission } from '../../services/notification/pushNotificationService';

export const NotificationSettingsCard: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings>(
    getNotificationSettings()
  );
  const [permissionStatus, setPermissionStatus] = useState<
    'granted' | 'denied' | 'default'
  >(
    typeof window !== 'undefined' && 'Notification' in window
      ? (Notification.permission as any)
      : 'default'
  );

  const [requestingPerm, setRequestingPerm] = useState(false);

  useEffect(() => {
    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        setSettings(e.detail);
      }
    };
    window.addEventListener(
      'exfin_notif_settings_changed',
      handleSettingsChange
    );
    return () =>
      window.removeEventListener(
        'exfin_notif_settings_changed',
        handleSettingsChange
      );
  }, []);

  const handleToggle = (key: keyof NotificationSettings) => {
    const updated = updateNotificationSettings({ [key]: !settings[key] });
    setSettings(updated);
  };

  const handleGrantPermission = async () => {
    setRequestingPerm(true);
    try {
      const granted = await requestOSNotificationPermission();
      setPermissionStatus(granted ? 'granted' : 'denied');
      if (granted) {
        updateNotificationSettings({ pushEnabled: true });
      }
    } catch (e) {
      console.warn('Error requesting permission:', e);
    } finally {
      setRequestingPerm(false);
    }
  };

  return (
    <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
      <div className="flex justify-between items-center border-b border-purple-500/10 pb-3">
        <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#A78BFA]" /> Push & Sound Preferences
        </h2>
        <span className="text-[10px] text-purple-300/60 font-semibold">
          Real-Time Controls
        </span>
      </div>

      {/* Permission Request Banner if default or denied */}
      {permissionStatus !== 'granted' && (
        <div className="p-3 bg-[#211044] border border-amber-500/30 rounded-xl space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-amber-200">
                Enable Android Device Notifications
              </p>
              <p className="text-purple-200/80 text-[11px] mt-0.5">
                Allow notifications so EXFIN OMS can alert you immediately about
                important tasks, leave updates, and team messages.
              </p>
            </div>
          </div>
          <button
            onClick={handleGrantPermission}
            disabled={requestingPerm}
            className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition-colors shadow-md"
          >
            {requestingPerm ? 'Requesting Permission...' : 'Allow OS Push Notifications'}
          </button>
        </div>
      )}

      {/* Device OS Permission Status Badge */}
      <div className="flex items-center justify-between bg-[#211044] p-3 rounded-xl border border-purple-500/10">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold text-white">Device Push Permission</span>
        </div>
        <span
          className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border ${
            permissionStatus === 'granted'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          }`}
        >
          {permissionStatus === 'granted' ? 'GRANTED' : 'ACTION REQUIRED'}
        </span>
      </div>

      {/* Master Push Switch */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between bg-[#211044] p-3 rounded-xl border border-purple-500/10">
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
        <div className="flex items-center justify-between bg-[#211044] p-3 rounded-xl border border-purple-500/10">
          <div className="flex items-center gap-2">
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
            <div>
              <p className="text-xs font-bold text-white">Notification Sound</p>
              <p className="text-[10px] text-purple-300/70">
                Play clean audio chime for new alerts
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

        {/* Vibration Toggle */}
        <div className="flex items-center justify-between bg-[#211044] p-3 rounded-xl border border-purple-500/10">
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

      {/* Category Toggles */}
      <div className="pt-2 border-t border-purple-500/10 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-purple-300">
          Notification Categories
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
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

          <div className="flex items-center justify-between bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
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

          <div className="flex items-center justify-between bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
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

          <div className="flex items-center justify-between bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
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
        </div>
      </div>
    </Card>
  );
};
