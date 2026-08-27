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
  Save,
  Send,
  Sparkles,
  Key,
  Radio,
  Clock,
  Layers,
  HelpCircle,
  Copy,
  Check,
  Info
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';
import {
  getSuperAdminAlertConfig,
  saveSuperAdminAlertConfig,
  registerThisDeviceAsAlertRecipient,
  sendSuperAdminTestAlert,
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

  const [manualToken, setManualToken] = useState('');
  const [deviceModelInput, setDeviceModelInput] = useState('');

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; messageId?: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await getSuperAdminAlertConfig();
      setConfig(data);
      if (data) {
        setManualToken(data.recipientFcmToken || '');
        setDeviceModelInput(data.deviceModel || '');
      }
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
      setSuccessMessage(`Attendance push alerts ${newEnabled ? 'ENABLED' : 'DISABLED'} for Super-Admin device.`);
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
        setManualToken(result.config.recipientFcmToken);
        setDeviceModelInput(result.config.deviceModel || '');
        setSuccessMessage('This device was successfully registered as the designated Super-Admin attendance alert recipient!');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register this device for push notifications');
    } finally {
      setRegistering(false);
    }
  };

  const handleSaveManualSettings = async () => {
    if (!config || !canEdit) return;
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await saveSuperAdminAlertConfig({
        recipientFcmToken: manualToken.trim(),
        deviceModel: deviceModelInput.trim(),
        enabled: manualToken.trim() ? config.enabled : false,
      });
      setConfig(updated);
      setSuccessMessage('Super-Admin recipient device token updated successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save recipient configuration');
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
      const targetToken = manualToken.trim() || config?.recipientFcmToken;
      if (!targetToken) {
        throw new Error('No FCM recipient token configured. Please register this device or enter a token first.');
      }

      const res = await sendSuperAdminTestAlert(
        targetToken,
        '⚡ EXFIN OMS — Super-Admin Test Alert',
        'Live FCM attendance notifications are active for this Super-Admin device.'
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

  const handleCopyToken = () => {
    if (!config?.recipientFcmToken) return;
    navigator.clipboard.writeText(config.recipientFcmToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  if (loading) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center gap-3 bg-[#13072E]/90 border-purple-500/20 text-center">
        <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        <p className="text-sm text-purple-200">Loading Super-Admin attendance alert settings...</p>
      </Card>
    );
  }

  const isConnected = !!(config?.recipientFcmToken && config.recipientFcmToken.trim().length > 0) || !!config?.webPushSubscription;

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
                    Free • FCM Push
                  </span>
                </h2>
                <p className="text-xs text-purple-200/80 mt-0.5">
                  Instant real-time push notifications sent to ONE designated Super-Admin Android device on employee Check-In and Check-Out.
                </p>
              </div>
            </div>
          </div>

          {/* Connection Status Badge & Refresh */}
          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
              config?.enabled && isConnected
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : !config?.enabled && isConnected
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}>
              {config?.enabled && isConnected ? (
                <>
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>ALERTS ACTIVE</span>
                </>
              ) : !config?.enabled && isConnected ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>PAUSED (TOKEN READY)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>DEVICE NOT LINKED</span>
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

          {/* Quick Registration & Token Management */}
          <Card className="p-5 bg-[#170B33]/90 border-purple-500/20 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-400" />
              Recipient Device Registration
            </h3>
            <p className="text-xs text-purple-200/70">
              Link the current Android device or configure the FCM registration token manually.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                onClick={handleRegisterDevice}
                disabled={!canEdit || registering}
                variant="primary"
                className="text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 py-2.5 px-4 rounded-xl shadow-lg"
              >
                {registering ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Registering Device...</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4" />
                    <span>Register This Device as Recipient</span>
                  </>
                )}
              </Button>

              <Button
                onClick={handleSendTestPush}
                disabled={!canEdit || testing || !isConnected}
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
                    <Send className="w-4 h-4 text-purple-300" />
                    <span>Send Live Test Push Alert</span>
                  </>
                )}
              </Button>
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
                    <p className="text-[10px] opacity-75 mt-0.5">FCM Message ID: {testResult.messageId}</p>
                  )}
                </div>
              </div>
            )}

            {/* Manual Token Settings Collapse */}
            <div className="pt-3 border-t border-purple-500/10 space-y-3">
              <label className="text-xs font-semibold text-purple-300 flex items-center justify-between">
                <span>FCM Device Registration Token</span>
                {config?.recipientFcmToken && (
                  <button
                    onClick={handleCopyToken}
                    className="text-[11px] text-purple-400 hover:text-white flex items-center gap-1 font-normal"
                  >
                    {copiedToken ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedToken ? 'Copied' : 'Copy Token'}</span>
                  </button>
                )}
              </label>

              <textarea
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                disabled={!canEdit}
                placeholder="e.g. f8e9d2... (FCM token auto-populated when you register this device)"
                rows={2}
                className="w-full bg-[#13072E] border border-purple-500/20 rounded-xl p-2.5 text-xs text-purple-100 placeholder-purple-400/40 focus:outline-none focus:border-purple-400 font-mono"
              />

              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="w-full sm:w-1/2">
                  <input
                    type="text"
                    value={deviceModelInput}
                    onChange={(e) => setDeviceModelInput(e.target.value)}
                    disabled={!canEdit}
                    placeholder="Device Model (e.g. Samsung Galaxy SM-G991B)"
                    className="w-full bg-[#13072E] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-purple-100 placeholder-purple-400/40 focus:outline-none focus:border-purple-400"
                  />
                </div>

                <Button
                  onClick={handleSaveManualSettings}
                  disabled={!canEdit || saving}
                  variant="secondary"
                  className="w-full sm:w-auto text-xs flex items-center justify-center gap-1.5 border-purple-500/30 hover:bg-purple-500/20"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Token Changes</span>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Col: Recipient Status & System Architecture Overview */}
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
                  <span className="font-medium text-emerald-300 uppercase">{config?.devicePlatform || 'android'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/70">Device Model:</span>
                  <span className="font-medium text-purple-200 truncate max-w-[140px]">{config?.deviceModel || 'Android Device'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/70">Token Status:</span>
                  <span className={`font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isConnected ? 'Registered & Bound' : 'Missing Token'}
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
                <span><strong>100% Free:</strong> Uses native Google Firebase Cloud Messaging with zero third-party subscription or provider costs.</span>
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
