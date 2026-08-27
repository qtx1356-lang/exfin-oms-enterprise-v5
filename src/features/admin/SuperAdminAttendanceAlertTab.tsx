import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Send,
  Sparkles,
  Radio,
  Trash2
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';
import {
  getSuperAdminAlertConfig,
  saveSuperAdminAlertConfig,
  registerThisDeviceAsAlertRecipient,
  sendSuperAdminTestAlert,
  removeRecipientDevice,
  SuperAdminAlertClientConfig
} from '../../services/notification/superAdminFcmService';

export const SuperAdminAttendanceAlertTab: React.FC = () => {
  const { user: adminUser } = useAdminAuth();
  const { isSuperAdmin } = usePermission();
  const canEdit = isSuperAdmin();

  const [config, setConfig] = useState<SuperAdminAlertClientConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [testing, setTesting] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; messageId?: string } | null>(null);

  const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await getSuperAdminAlertConfig();
      setConfig(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load Super-Admin alert configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMaster = async () => {
    if (!config || !canEdit) return;
    const newEnabled = !config.enabled;
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await saveSuperAdminAlertConfig({ enabled: newEnabled });
      setConfig(updated);
      setSuccessMessage(`Attendance push alerts ${newEnabled ? 'ENABLED' : 'DISABLED'} for designated recipient device.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update alert state');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTrigger = async (key: 'notifyCheckIn' | 'notifyCheckOut' | 'notifyOfficeExit') => {
    if (!config || !canEdit) return;
    const newVal = !config[key];
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await saveSuperAdminAlertConfig({ [key]: newVal });
      setConfig(updated);
      setSuccessMessage('Notification trigger settings updated successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update trigger setting');
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterDevice = async () => {
    if (!canEdit) return;
    setRegistering(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTestResult(null);
    try {
      const result = await registerThisDeviceAsAlertRecipient();
      if (result.success && result.config) {
        setConfig(result.config);
        setSuccessMessage('This device was successfully registered as the designated Super-Admin attendance alert recipient!');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register this device for push notifications');
    } finally {
      setRegistering(false);
    }
  };

  const handleRemoveDevice = async () => {
    if (!canEdit) return;
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTestResult(null);
    try {
      const result = await removeRecipientDevice();
      if (result.success && result.config) {
        setConfig(result.config);
        setSuccessMessage('Recipient device registration removed successfully.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove recipient device');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestPush = async () => {
    if (!canEdit) return;
    setTesting(true);
    setTestResult(null);
    setErrorMessage(null);
    try {
      const res = await sendSuperAdminTestAlert(
        undefined,
        '⚡ EXFIN OMS — Super-Admin Test Alert',
        'Live attendance push alerts are active for this Super-Admin device.'
      );

      if (res.success) {
        setTestResult({
          success: true,
          message: 'Live test push alert delivered successfully to Super-Admin device!',
          messageId: res.messageId
        });
      } else {
        setTestResult({
          success: false,
          message: res.message || 'Test push notification could not be delivered.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to send test push alert.'
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center gap-3 bg-[#13072E]/90 border-purple-500/20 text-center">
        <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        <p className="text-sm text-purple-200">Loading Super-Admin attendance alert settings...</p>
      </Card>
    );
  }

  const isRegistered = !!(config?.webPushSubscription?.endpoint || (config?.recipientFcmToken && config.recipientFcmToken.trim().length > 0));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="p-6 bg-gradient-to-r from-[#190938] via-[#1F0E45] to-[#14062B] border-purple-500/30">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  Super-Admin Attendance Alert Device
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold uppercase tracking-wider">
                    Web Push • Instant Alerts
                  </span>
                </h2>
                <p className="text-xs text-purple-200/80 mt-0.5">
                  Instant real-time push notifications sent to ONE designated Super-Admin device on employee Check-In and Check-Out.
                </p>
              </div>
            </div>
          </div>

          {/* Connection Status Badge & Refresh */}
          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
              config?.enabled && isRegistered
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : !config?.enabled && isRegistered
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}>
              {config?.enabled && isRegistered ? (
                <>
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>ALERTS ACTIVE</span>
                </>
              ) : !config?.enabled && isRegistered ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>PAUSED (REGISTERED)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>DEVICE NOT REGISTERED</span>
                </>
              )}
            </div>

            <Button
              onClick={fetchConfig}
              variant="secondary"
              className="text-xs flex items-center gap-1.5 border-purple-500/30 hover:bg-purple-500/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Permission Warning if not Super-Admin */}
      {!canEdit && (
        <div className="bg-amber-950/60 border border-amber-500/30 text-amber-200 p-4 rounded-xl flex items-center gap-3 text-xs shadow-md">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="font-bold text-white">Super-Administrator Privilege Required</p>
            <p className="text-amber-200/90 mt-0.5">
              Only SUPER_ADMIN can modify the designated notification recipient device or alter alert triggers.
            </p>
          </div>
        </div>
      )}

      {/* Success / Error Banners */}
      {successMessage && (
        <div className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 p-4 rounded-xl flex items-center gap-3 text-xs shadow-md">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-white">Success</p>
            <p className="text-emerald-200/90 mt-0.5">{successMessage}</p>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-purple-300 hover:text-white">&times;</button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950/60 border border-rose-500/30 text-rose-200 p-4 rounded-xl flex items-center gap-3 text-xs shadow-md">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-white">Error</p>
            <p className="text-rose-200/90 mt-0.5">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-purple-300 hover:text-white">&times;</button>
        </div>
      )}

      {/* Grid: Master Controls & Designated Recipient Device */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col (2 span): Master Controls & Triggers */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 bg-[#170B33]/90 border-purple-500/20 space-y-5">
            <div className="flex items-center justify-between border-b border-purple-500/10 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  Master Alert Switch
                </h3>
                <p className="text-xs text-purple-200/70 mt-0.5">
                  Globally enable or pause real-time push alerts to the designated Super-Admin device.
                </p>
              </div>

              <button
                disabled={!canEdit || saving}
                onClick={handleToggleMaster}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  config?.enabled ? 'bg-emerald-500' : 'bg-gray-600'
                } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config?.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Notification Triggers */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
                Event Notification Triggers
              </h4>

              {/* Trigger 1: Check-In */}
              <div 
                onClick={() => canEdit && handleToggleTrigger('notifyCheckIn')}
                className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between ${
                  config?.notifyCheckIn 
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200' 
                    : 'bg-purple-950/20 border-purple-500/10 text-purple-300/60'
                } ${canEdit ? 'cursor-pointer hover:border-purple-400/40' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🟢</span>
                  <div>
                    <p className="text-xs font-bold text-white">Employee Check-In Alert</p>
                    <p className="text-[11px] text-purple-200/70">
                      Auto Check-In, Manual Check-In, WFH, Client Visits, Outdoor Work.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!!config?.notifyCheckIn}
                  onChange={() => {}}
                  disabled={!canEdit}
                  className="rounded border-purple-500/30 text-emerald-500 focus:ring-emerald-400 h-4 w-4"
                />
              </div>

              {/* Trigger 2: Check-Out */}
              <div 
                onClick={() => canEdit && handleToggleTrigger('notifyCheckOut')}
                className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between ${
                  config?.notifyCheckOut 
                    ? 'bg-rose-950/20 border-rose-500/30 text-rose-200' 
                    : 'bg-purple-950/20 border-purple-500/10 text-purple-300/60'
                } ${canEdit ? 'cursor-pointer hover:border-purple-400/40' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🔴</span>
                  <div>
                    <p className="text-xs font-bold text-white">Employee Check-Out Alert</p>
                    <p className="text-[11px] text-purple-200/70">
                      Authoritative checkout time, working duration, finalization status.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!!config?.notifyCheckOut}
                  onChange={() => {}}
                  disabled={!canEdit}
                  className="rounded border-purple-500/30 text-rose-500 focus:ring-rose-400 h-4 w-4"
                />
              </div>

              {/* Trigger 3: 25m Office Geofence Exit */}
              <div 
                onClick={() => canEdit && handleToggleTrigger('notifyOfficeExit')}
                className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between ${
                  config?.notifyOfficeExit 
                    ? 'bg-amber-950/20 border-amber-500/30 text-amber-200' 
                    : 'bg-purple-950/20 border-purple-500/10 text-purple-300/60'
                } ${canEdit ? 'cursor-pointer hover:border-purple-400/40' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">⚠️</span>
                  <div>
                    <p className="text-xs font-bold text-white">Office 25m Geofence Exit Candidate</p>
                    <p className="text-[11px] text-purple-200/70">
                      Immediate alert when an employee steps outside the 25-meter office boundary.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!!config?.notifyOfficeExit}
                  onChange={() => {}}
                  disabled={!canEdit}
                  className="rounded border-purple-500/30 text-amber-500 focus:ring-amber-400 h-4 w-4"
                />
              </div>
            </div>
          </Card>

          {/* Browser / Device Push Registration Section */}
          <Card className="p-5 bg-[#170B33]/90 border-purple-500/20 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-purple-400" />
                Recipient Device Registration
              </h3>
              <p className="text-xs text-purple-200/70 mt-1">
                Register the current Android browser to receive EXFIN attendance alerts.
              </p>
            </div>

            {/* Status Indicator */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-purple-300">Status:</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-xl border ${
                isRegistered
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
              }`}>
                {isRegistered ? '● DEVICE REGISTERED' : '● DEVICE NOT REGISTERED'}
              </span>
            </div>

            {/* If registered, show details */}
            {isRegistered && (
              <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-500/10 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-purple-300/70">Recipient:</span>
                  <span className="font-bold text-white">{config?.deviceModel || 'This Android Browser'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-purple-300/70">Push Connection:</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                    Connected
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-purple-300/70">Registered Email:</span>
                  <span className="font-medium text-purple-200">{config?.recipientEmail || adminUser?.email || 'Super Admin'}</span>
                </div>
                {config?.updatedAt && (
                  <div className="flex justify-between items-center pt-1 border-t border-purple-500/10 text-[11px]">
                    <span className="text-purple-300/60">Registered On:</span>
                    <span className="text-purple-300/90">{new Date(config.updatedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              {!isRegistered ? (
                <Button
                  onClick={handleRegisterDevice}
                  disabled={!canEdit || registering}
                  variant="primary"
                  className="w-full sm:w-auto text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 py-2.5 px-5 rounded-xl shadow-lg"
                >
                  {registering ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Registering Browser...</span>
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-4 h-4" />
                      <span>Register This Device</span>
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleRegisterDevice}
                    disabled={!canEdit || registering}
                    variant="primary"
                    className="text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 py-2.5 px-4 rounded-xl shadow-lg"
                  >
                    {registering ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Re-registering...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Re-register This Device</span>
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleSendTestPush}
                    disabled={!canEdit || testing}
                    variant="secondary"
                    className="text-xs flex items-center justify-center gap-2 border-purple-500/30 hover:bg-purple-500/20 py-2.5 px-4 rounded-xl"
                  >
                    {testing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                        <span>Sending Test Push...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 text-purple-300" />
                        <span>Send Test Push Alert</span>
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleRemoveDevice}
                    disabled={!canEdit || saving}
                    variant="secondary"
                    className="text-xs flex items-center justify-center gap-2 border-rose-500/30 hover:bg-rose-950/40 text-rose-300 py-2.5 px-4 rounded-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Remove This Device</span>
                  </Button>
                </>
              )}
            </div>

            {/* Test result message */}
            {testResult && (
              <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success 
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200' 
                  : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold">{testResult.message}</p>
                  {testResult.messageId && (
                    <p className="text-[10px] opacity-75 mt-0.5">Push Delivery ID: {testResult.messageId}</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Col: Designated Recipient Status & System Architecture Overview */}
        <div className="space-y-6">
          <Card className="p-5 bg-[#170B33]/90 border-purple-500/20 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-purple-400" />
              Designated Recipient Status
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/10 space-y-2">
                <div className="flex justify-between">
                  <span className="text-purple-300/70">Recipient Role:</span>
                  <span className="font-bold text-white">SUPER_ADMIN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/70">Recipient Name:</span>
                  <span className="font-medium text-purple-200">{config?.recipientName || 'Not Set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/70">Recipient Email:</span>
                  <span className="font-medium text-purple-200 truncate max-w-[140px]">{config?.recipientEmail || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/70">Device Platform:</span>
                  <span className="font-medium text-emerald-300 uppercase">{config?.devicePlatform || 'web'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/70">Device Model:</span>
                  <span className="font-medium text-purple-200 truncate max-w-[140px]">{config?.deviceModel || 'Android Browser'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/70">Status:</span>
                  <span className={`font-bold ${isRegistered ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isRegistered ? 'Registered & Bound' : 'Device Not Registered'}
                  </span>
                </div>
                {config?.updatedAt && (
                  <div className="flex justify-between pt-1 border-t border-purple-500/10 text-[10px]">
                    <span className="text-purple-300/60">Last Updated:</span>
                    <span className="text-purple-300/90">{new Date(config.updatedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Architecture Highlights Card */}
          <Card className="p-5 bg-gradient-to-b from-[#190938] to-[#120526] border-purple-500/20 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Architecture Guarantees
            </h4>
            
            <ul className="space-y-2 text-[11px] text-purple-200/80">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span><strong>Web Push Standard:</strong> Native browser push notifications via W3C Push API and VAPID.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span><strong>Single Recipient Constraint:</strong> Notifications are routed strictly to this 1 designated Super-Admin device; never dispatched to general employees.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span><strong>Non-Blocking & Offline Resilient:</strong> Alert delivery operates in an auxiliary background channel. Attendance recording never waits for or depends on push delivery.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span><strong>Authoritative Timestamp:</strong> Check-out push alerts preserve the actual native 25m geofence exit time rather than the app-open time.</span>
              </li>
            </ul>
          </Card>
        </div>

      </div>
    </div>
  );
};
