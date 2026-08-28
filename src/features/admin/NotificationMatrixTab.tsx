import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Settings, CheckCircle2, Save, ShieldAlert, Mail, MessageSquare, Bell, Smartphone, RefreshCw, Send } from 'lucide-react';
import { 
  EventNotificationConfig, 
  getAdminNotificationMatrix, 
  saveAdminNotificationMatrix 
} from '../../services/notification/adminNotificationConfig';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';

export const NotificationMatrixTab: React.FC = () => {
  const { user: adminUser } = useAdminAuth();
  const { isSuperAdmin, isAdmin } = usePermission();

  const [matrix, setMatrix] = useState<EventNotificationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadMatrix();
  }, []);

  const loadMatrix = async () => {
    setLoading(true);
    try {
      const data = await getAdminNotificationMatrix();
      setMatrix(data);
    } catch (err) {
      console.error('Failed to load matrix:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (eventType: string, channel: 'inApp' | 'email' | 'sms' | 'push' | 'whatsapp') => {
    setMatrix((prev) =>
      prev.map((item) => {
        if (item.eventType !== eventType) return item;

        // In-App is always mandatory
        if (channel === 'inApp') return item;

        // FCM Attendance Push is completely removed and permanently disabled
        if (item.category === 'ATTENDANCE' && channel === 'push') return item;

        // Mandatory administrative/security rules cannot disable email or SMS if marked mandatory
        if (item.isMandatory && (channel === 'email' || channel === 'sms') && item[channel]) {
          // retain
        }

        return {
          ...item,
          [channel]: !item[channel],
        };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await saveAdminNotificationMatrix(matrix, {
        name: adminUser?.name || 'Administrator',
        role: isSuperAdmin() ? 'SUPER_ADMIN' : 'ADMIN',
        employeeCode: adminUser?.loginId,
      });
      setSuccessMessage('Notification delivery channels updated and audit log recorded.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update notification configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 bg-[#250F4C] border border-purple-500/20 text-center">
        <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mx-auto mb-2" />
        <p className="text-xs text-purple-300 font-bold">Loading Notification Channel Configuration...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="p-5 bg-gradient-to-br from-[#2D1B5A] to-[#211044] border border-purple-500/30 rounded-2xl flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4 text-purple-400" /> Notification Channel Configuration
          </h3>
          <p className="text-xs text-purple-300/80 mt-0.5">
            Configure delivery channels (In-App, Email, SMS, Android Push, WhatsApp) per event type. In-App is the single source of truth.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save Changes</span>
        </Button>
      </Card>

      {successMessage && (
        <div className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 p-4 rounded-xl flex items-center gap-3 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="font-bold">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950/60 border border-rose-500/30 text-rose-200 p-4 rounded-xl text-xs">
          <p className="font-bold">{errorMessage}</p>
        </div>
      )}

      {/* Matrix Table */}
      <Card className="p-6 bg-[#250F4C] border border-purple-500/20 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs text-purple-200">
          <thead>
            <tr className="border-b border-purple-500/20 text-[#A78BFA] uppercase tracking-wider font-extrabold">
              <th className="pb-3 px-3">Notification Event</th>
              <th className="pb-3 px-3">Category</th>
              <th className="pb-3 px-3 text-center">
                <span className="inline-flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> In-App (Primary)</span>
              </th>
              <th className="pb-3 px-3 text-center">
                <span className="inline-flex items-center gap-1 text-emerald-400"><Send className="w-3.5 h-3.5" /> WhatsApp</span>
              </th>
              <th className="pb-3 px-3 text-center">
                <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Email (Secondary)</span>
              </th>
              <th className="pb-3 px-3 text-center">
                <span className="inline-flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> SMS (Critical)</span>
              </th>
              <th className="pb-3 px-3 text-center">
                <span className="inline-flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> Push (Optional)</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-500/10">
            {matrix.map((item) => (
              <tr key={item.eventType} className="hover:bg-purple-900/20 transition-colors">
                <td className="py-3.5 px-3">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.isMandatory && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                        <ShieldAlert className="w-2.5 h-2.5" /> Mandatory
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-purple-400 font-mono">{item.eventType}</span>
                </td>

                <td className="py-3.5 px-3">
                  <span className="text-[10px] uppercase font-bold text-purple-300 bg-purple-900/40 px-2 py-1 rounded-md border border-purple-500/20">
                    {item.category}
                  </span>
                </td>

                {/* IN-APP (Mandatory ON) */}
                <td className="py-3.5 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    className="w-4 h-4 rounded border-purple-500/40 text-purple-600 focus:ring-purple-500 cursor-not-allowed opacity-90"
                    title="In-App is always enabled as the single source of truth"
                  />
                </td>

                {/* WHATSAPP */}
                <td className="py-3.5 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={item.whatsapp ?? false}
                    onChange={() => handleToggle(item.eventType, 'whatsapp')}
                    className="w-4 h-4 rounded border-emerald-500/40 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                  />
                </td>

                {/* EMAIL */}
                <td className="py-3.5 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={item.email}
                    onChange={() => handleToggle(item.eventType, 'email')}
                    className="w-4 h-4 rounded border-purple-500/40 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </td>

                {/* SMS */}
                <td className="py-3.5 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={item.sms}
                    onChange={() => handleToggle(item.eventType, 'sms')}
                    className="w-4 h-4 rounded border-purple-500/40 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </td>

                {/* PUSH */}
                <td className="py-3.5 px-3 text-center">
                  {item.category === 'ATTENDANCE' ? (
                    <span className="text-[10px] text-purple-400/50 font-mono italic" title="FCM Attendance Push has been removed">
                      Disabled (FCM Removed)
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={item.push}
                      onChange={() => handleToggle(item.eventType, 'push')}
                      className="w-4 h-4 rounded border-purple-500/40 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
