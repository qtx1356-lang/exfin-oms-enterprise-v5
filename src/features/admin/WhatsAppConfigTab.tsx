import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ShieldCheck, 
  ShieldAlert, 
  Save, 
  Plus, 
  Trash2, 
  Sparkles, 
  FileText, 
  Smartphone, 
  Layers, 
  Settings2,
  RotateCcw
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';
import {
  getWhatsAppAdminConfig,
  saveWhatsAppAdminConfig,
  sendTestWhatsAppMessage,
  WhatsAppClientConfig
} from '../../services/notification/whatsappService';

const AVAILABLE_VARIABLES = [
  { key: 'employeeName', label: 'Employee Name' },
  { key: 'employeeCode', label: 'Employee Code' },
  { key: 'attendanceType', label: 'Mode (OFFICE/WFH)' },
  { key: 'checkInTime', label: 'Check-In Time' },
  { key: 'checkOutTime', label: 'Check-Out Time' },
  { key: 'workingHours', label: 'Working Hours' },
  { key: 'distance', label: 'Distance (m)' },
  { key: 'townCity', label: 'Location/City' },
  { key: 'wfhReason', label: 'WFH Reason' },
  { key: 'workPlan', label: 'Work Plan' },
  { key: 'clientName', label: 'Client Name' },
  { key: 'clientLocation', label: 'Client Location' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'outdoorType', label: 'Outdoor Type' },
  { key: 'description', label: 'Description' },
  { key: 'eventTime', label: 'Event Time' },
];

const TEMPLATE_EVENTS: Array<{ type: string; label: string }> = [
  { type: 'AUTO_CHECK_IN', label: 'Automatic Check-In' },
  { type: 'MANUAL_CHECK_IN', label: 'Manual Check-In' },
  { type: 'CHECK_OUT', label: 'Check-Out Confirmation' },
  { type: 'WFH', label: 'Work From Home (WFH)' },
  { type: 'CLIENT_VISIT', label: 'Client Visit' },
  { type: 'OUTDOOR_WORK', label: 'Outdoor Work' },
  { type: 'LATE_CHECK_IN', label: 'Late Check-In Alert' },
  { type: 'OUTSIDE_OFFICE', label: 'Outside Office / Exit Alert' },
  { type: 'MISSING_CHECKOUT_REMINDER', label: 'Missing Checkout Reminder' },
];

export const WhatsAppConfigTab: React.FC = () => {
  const { user: adminUser } = useAdminAuth();
  const { isSuperAdmin } = usePermission();
  const canEdit = isSuperAdmin();

  const [config, setConfig] = useState<WhatsAppClientConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New recipient input
  const [newRecipient, setNewRecipient] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);

  // Selected template editor state
  const [selectedEventType, setSelectedEventType] = useState<string>('AUTO_CHECK_IN');

  // Test message state
  const [testRecipient, setTestRecipient] = useState('');
  const [testCustomMessage, setTestCustomMessage] = useState('EXFIN OMS WhatsApp Connection Test Successful.');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const data = await getWhatsAppAdminConfig();
      setConfig(data);
      if (data.adminRecipients && data.adminRecipients.length > 0 && !testRecipient) {
        setTestRecipient(data.adminRecipients[0]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleGlobal = () => {
    if (!canEdit || !config) return;
    setConfig({
      ...config,
      globalEnabled: !config.globalEnabled
    });
  };

  const handleRoutingChange = (mode: 'ADMIN_ONLY' | 'EMPLOYEE_ONLY' | 'BOTH') => {
    if (!canEdit || !config) return;
    setConfig({
      ...config,
      recipientMode: mode
    });
  };

  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !config) return;
    setRecipientError(null);

    const cleaned = newRecipient.replace(/[^0-9+]/g, '');
    if (!cleaned || cleaned.length < 10) {
      setRecipientError('Please enter a valid mobile number (at least 10 digits with country code).');
      return;
    }

    if (config.adminRecipients.includes(cleaned)) {
      setRecipientError('This number is already in the recipient list.');
      return;
    }

    setConfig({
      ...config,
      adminRecipients: [...config.adminRecipients, cleaned]
    });
    setNewRecipient('');
  };

  const handleRemoveRecipient = (phone: string) => {
    if (!canEdit || !config) return;
    setConfig({
      ...config,
      adminRecipients: config.adminRecipients.filter((p) => p !== phone)
    });
  };

  const handleTemplateChange = (val: string) => {
    if (!canEdit || !config) return;
    setConfig({
      ...config,
      templates: {
        ...config.templates,
        [selectedEventType]: val
      }
    });
  };

  const handleInsertVariable = (variableKey: string) => {
    if (!canEdit || !config) return;
    const currentTemplate = config.templates[selectedEventType] || '';
    const updated = `${currentTemplate} {{${variableKey}}}`;
    handleTemplateChange(updated);
  };

  const handleSave = async () => {
    if (!canEdit || !config) return;
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const updated = await saveWhatsAppAdminConfig({
        globalEnabled: config.globalEnabled,
        recipientMode: config.recipientMode,
        adminRecipients: config.adminRecipients,
        templates: config.templates,
        metaTemplates: config.metaTemplates
      });
      setConfig(updated);
      setSuccessMessage('WhatsApp notification configuration and Meta templates saved successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleMetaTemplateToggle = (eventType: string) => {
    if (!canEdit || !config) return;
    const currentMeta = config.metaTemplates || {};
    const existing = currentMeta[eventType] || { enabled: true, templateName: `exfin_attendance_${eventType.toLowerCase()}`, languageCode: 'en' };
    setConfig({
      ...config,
      metaTemplates: {
        ...currentMeta,
        [eventType]: {
          ...existing,
          enabled: !existing.enabled
        }
      }
    });
  };

  const handleMetaTemplateNameChange = (eventType: string, val: string) => {
    if (!canEdit || !config) return;
    const currentMeta = config.metaTemplates || {};
    const existing = currentMeta[eventType] || { enabled: true, templateName: `exfin_attendance_${eventType.toLowerCase()}`, languageCode: 'en' };
    setConfig({
      ...config,
      metaTemplates: {
        ...currentMeta,
        [eventType]: {
          ...existing,
          templateName: val.trim().toLowerCase().replace(/\s+/g, '_')
        }
      }
    });
  };

  const handleMetaTemplateLangChange = (eventType: string, val: string) => {
    if (!canEdit || !config) return;
    const currentMeta = config.metaTemplates || {};
    const existing = currentMeta[eventType] || { enabled: true, templateName: `exfin_attendance_${eventType.toLowerCase()}`, languageCode: 'en' };
    setConfig({
      ...config,
      metaTemplates: {
        ...currentMeta,
        [eventType]: {
          ...existing,
          languageCode: val.trim().toLowerCase() || 'en'
        }
      }
    });
  };

  const [testMode, setTestMode] = useState<'text' | 'template'>('text');

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) {
      setTestResult({ success: false, message: 'Please enter a test recipient mobile number.' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const activeMeta = config?.metaTemplates?.[selectedEventType] || {
        enabled: true,
        templateName: `exfin_attendance_${selectedEventType.toLowerCase()}`,
        languageCode: 'en'
      };

      const res = await sendTestWhatsAppMessage(
        testRecipient.trim(),
        testCustomMessage.trim(),
        testMode === 'template' ? {
          type: 'template',
          templateName: activeMeta.templateName,
          languageCode: activeMeta.languageCode
        } : {
          type: 'text'
        }
      );
      setTestResult({
        success: true,
        message: res.message || 'Test message sent successfully!'
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to send test message'
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 bg-[#250F4C] border border-purple-500/20 text-center">
        <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mx-auto mb-2" />
        <p className="text-xs text-purple-300 font-bold">Loading WhatsApp Configuration...</p>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card className="p-8 bg-[#250F4C] border border-purple-500/20 text-center">
        <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
        <p className="text-sm font-bold text-white mb-2">WhatsApp Configuration Unavailable</p>
        <p className="text-xs text-purple-300 mb-4">{errorMessage || 'Unable to connect to WhatsApp backend service'}</p>
        <Button onClick={fetchConfig} className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2 rounded-xl">
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role permission warning if not Super-Admin */}
      {!canEdit && (
        <div className="bg-amber-950/60 border border-amber-500/30 text-amber-200 p-4 rounded-xl flex items-center gap-3 text-xs">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="font-bold">
            Read-Only Access: Only Super-Administrators have permission to modify WhatsApp API settings, recipient routing, and message templates.
          </p>
        </div>
      )}

      {/* Header & Status Card */}
      <Card className="p-6 bg-gradient-to-br from-[#2D1B5A] to-[#211044] border border-purple-500/30 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  WhatsApp Real-Time Notifications
                </h3>
                <p className="text-xs text-purple-300/80 mt-0.5">
                  Automated instant attendance alerts powered by Meta WhatsApp Cloud API
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Badge */}
            {config.configured ? (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black px-3 py-1.5 rounded-full">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                API Connected ({config.apiVersion})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black px-3 py-1.5 rounded-full">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                Credentials Pending in Server .env
              </span>
            )}

            {canEdit && (
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save All Settings</span>
              </Button>
            )}
          </div>
        </div>

        {/* Masked Credentials Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-4 border-t border-purple-500/20 text-xs">
          <div className="bg-purple-950/40 p-3 rounded-xl border border-purple-500/10">
            <span className="text-purple-400 block text-[10px] uppercase font-bold">Phone Number ID</span>
            <span className="font-mono text-purple-100 font-bold">{config.maskedPhoneNumberId || 'Not Configured'}</span>
          </div>
          <div className="bg-purple-950/40 p-3 rounded-xl border border-purple-500/10">
            <span className="text-purple-400 block text-[10px] uppercase font-bold">WABA ID</span>
            <span className="font-mono text-purple-100 font-bold">{config.maskedWabaId || 'Not Configured'}</span>
          </div>
          <div className="bg-purple-950/40 p-3 rounded-xl border border-purple-500/10">
            <span className="text-purple-400 block text-[10px] uppercase font-bold">Last Updated</span>
            <span className="text-purple-200 font-bold">{config.updatedAt ? new Date(config.updatedAt).toLocaleString('en-IN') : 'Default'}</span>
          </div>
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Global Controls & Recipient Management */}
        <div className="space-y-6 lg:col-span-1">
          {/* Master Channel Toggle Card */}
          <Card className="p-5 bg-[#250F4C] border border-purple-500/20 rounded-2xl space-y-4">
            <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-purple-400" /> Channel Master Controls
            </h4>

            <div className="flex items-center justify-between p-3 bg-purple-950/40 rounded-xl border border-purple-500/20">
              <div>
                <p className="text-xs font-bold text-white">Global WhatsApp Alerts</p>
                <p className="text-[11px] text-purple-300/70">Enable or mute all automated messages</p>
              </div>
              <button
                type="button"
                disabled={!canEdit}
                onClick={handleToggleGlobal}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  config.globalEnabled ? 'bg-emerald-500' : 'bg-gray-700'
                } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    config.globalEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Recipient Routing Mode */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-purple-200 uppercase tracking-wider block">
                Notification Recipient Routing
              </label>
              <div className="space-y-2">
                {[
                  { id: 'BOTH', title: 'Both (Employee & Admins)', desc: 'Sends alert to employee and admin recipient list' },
                  { id: 'ADMIN_ONLY', title: 'Admin / HR List Only', desc: 'Sends alert only to admin recipient numbers' },
                  { id: 'EMPLOYEE_ONLY', title: 'Employee Only', desc: 'Sends alert directly to the employee' },
                ].map((mode) => (
                  <label
                    key={mode.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      config.recipientMode === mode.id
                        ? 'bg-purple-900/40 border-purple-500 text-white'
                        : 'bg-purple-950/20 border-purple-500/10 text-purple-300 hover:border-purple-500/30'
                    } ${!canEdit ? 'pointer-events-none' : ''}`}
                  >
                    <input
                      type="radio"
                      name="recipientMode"
                      checked={config.recipientMode === mode.id}
                      onChange={() => handleRoutingChange(mode.id as any)}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <p className="text-xs font-bold">{mode.title}</p>
                      <p className="text-[10px] text-purple-400">{mode.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </Card>

          {/* Admin / HR Recipient Phone Numbers Card */}
          <Card className="p-5 bg-[#250F4C] border border-purple-500/20 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-purple-400" /> Admin/HR Recipients ({config.adminRecipients.length})
              </h4>
            </div>
            <p className="text-[11px] text-purple-300/80">
              Authorized admin numbers receiving real-time attendance alerts (include country code, e.g. +919876543210).
            </p>

            {canEdit && (
              <form onSubmit={handleAddRecipient} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="flex-1 bg-purple-950/60 border border-purple-500/30 text-white rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none placeholder-purple-400/50"
                  />
                  <Button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </Button>
                </div>
                {recipientError && <p className="text-[11px] text-rose-400 font-medium">{recipientError}</p>}
              </form>
            )}

            {/* Recipient List */}
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {config.adminRecipients.length === 0 ? (
                <div className="p-3 bg-purple-950/20 border border-dashed border-purple-500/20 rounded-xl text-center text-xs text-purple-400">
                  No admin numbers configured.
                </div>
              ) : (
                config.adminRecipients.map((phone) => (
                  <div
                    key={phone}
                    className="flex items-center justify-between p-2.5 bg-purple-950/40 border border-purple-500/20 rounded-xl text-xs"
                  >
                    <span className="font-mono text-purple-200 font-bold">{phone}</span>
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveRecipient(phone)}
                        className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-950/40 rounded transition"
                        title="Remove Number"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Test WhatsApp Dispatch Card */}
          <Card className="p-5 bg-gradient-to-br from-[#1C1236] to-[#250F4C] border border-emerald-500/30 rounded-2xl space-y-4">
            <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" /> Live WhatsApp Test Dispatch
            </h4>
            <p className="text-[11px] text-purple-300/80">
              Verify Meta WhatsApp Cloud API credentials by sending a live test notification.
            </p>

            <form onSubmit={handleSendTest} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">
                  Test Dispatch Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTestMode('template')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                      testMode === 'template'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-950/60 text-purple-300 hover:text-white border border-purple-500/20'
                    }`}
                  >
                    Meta Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestMode('text')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                      testMode === 'text'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-950/60 text-purple-300 hover:text-white border border-purple-500/20'
                    }`}
                  >
                    Custom Text Body
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">
                  Recipient Phone Number
                </label>
                <input
                  type="tel"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="+919876543210"
                  className="w-full bg-purple-950/60 border border-purple-500/30 text-white rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {testMode === 'template' ? (
                <div className="p-2.5 bg-purple-950/60 rounded-xl border border-purple-500/20 text-[11px] text-purple-200">
                  <p className="font-semibold text-emerald-300">Template to Test:</p>
                  <p className="font-mono text-xs text-white mt-0.5">
                    {config.metaTemplates?.[selectedEventType]?.templateName || `exfin_attendance_${selectedEventType.toLowerCase()}`}
                  </p>
                  <p className="text-[10px] text-purple-300/70 mt-1">
                    Language: {config.metaTemplates?.[selectedEventType]?.languageCode || 'en'} (from currently selected event)
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">
                    Custom Test Message
                  </label>
                  <textarea
                    rows={2}
                    value={testCustomMessage}
                    onChange={(e) => setTestCustomMessage(e.target.value)}
                    className="w-full bg-purple-950/60 border border-purple-500/30 text-white rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                  />
                </div>
              )}

              <Button
                type="submit"
                disabled={testing || !config.configured}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-2 shadow-lg"
              >
                {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{testing ? 'Sending WhatsApp...' : `Send ${testMode === 'template' ? 'Template' : 'Text'} Test`}</span>
              </Button>
            </form>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  testResult.success
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                }`}
              >
                <p className="font-bold">{testResult.success ? 'Success!' : 'Dispatch Error'}</p>
                <p className="text-[11px] mt-0.5">{testResult.message}</p>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Template Management */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 rounded-2xl space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" /> Attendance Message Template Editor
              </h4>
              <span className="text-[11px] text-purple-300/70">
                Customizable placeholders render dynamically at dispatch time
              </span>
            </div>

            {/* Event Type Selectors */}
            <div className="flex flex-wrap gap-1.5 p-1.5 bg-purple-950/60 rounded-xl border border-purple-500/20">
              {TEMPLATE_EVENTS.map((evt) => (
                <button
                  key={evt.type}
                  type="button"
                  onClick={() => setSelectedEventType(evt.type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedEventType === evt.type
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-purple-300 hover:text-white hover:bg-purple-900/40'
                  }`}
                >
                  {evt.label}
                </button>
              ))}
            </div>

            {/* Meta Template Configuration Sub-panel */}
            <div className="p-4 bg-purple-950/70 border border-purple-500/30 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white uppercase tracking-wider">
                    Meta Template Mapping for {TEMPLATE_EVENTS.find((e) => e.type === selectedEventType)?.label}
                  </p>
                  <p className="text-[11px] text-purple-300/70">
                    Business-initiated notifications require pre-approved templates in Meta WhatsApp Manager
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-purple-300">
                    {(config.metaTemplates?.[selectedEventType]?.enabled ?? true) ? 'Active' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleMetaTemplateToggle(selectedEventType)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      (config.metaTemplates?.[selectedEventType]?.enabled ?? true) ? 'bg-emerald-500' : 'bg-gray-700'
                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        (config.metaTemplates?.[selectedEventType]?.enabled ?? true) ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">
                    Meta Approved Template Name
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={config.metaTemplates?.[selectedEventType]?.templateName || `exfin_attendance_${selectedEventType.toLowerCase()}`}
                    onChange={(e) => handleMetaTemplateNameChange(selectedEventType, e.target.value)}
                    placeholder="e.g. exfin_attendance_checkin"
                    className="w-full bg-purple-900/40 border border-purple-500/30 text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">
                    Language Code
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={config.metaTemplates?.[selectedEventType]?.languageCode || 'en'}
                    onChange={(e) => handleMetaTemplateLangChange(selectedEventType, e.target.value)}
                    placeholder="e.g. en or en_US"
                    className="w-full bg-purple-900/40 border border-purple-500/30 text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Dynamic Variable Chips */}
            <div>
              <label className="text-[10px] uppercase font-bold text-purple-300 block mb-2">
                Insert Placeholder Variables (Click to Add)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleInsertVariable(v.key)}
                    className="text-[11px] bg-purple-900/40 hover:bg-purple-800 text-purple-200 border border-purple-500/30 px-2.5 py-1 rounded-md font-mono transition"
                  >
                    + &#123;&#123;{v.key}&#125;&#125;
                  </button>
                ))}
              </div>
            </div>

            {/* Template Text Area */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-white uppercase tracking-wider">
                  Fallback / Preview Body for {TEMPLATE_EVENTS.find((e) => e.type === selectedEventType)?.label}
                </label>
              </div>
              <textarea
                rows={6}
                disabled={!canEdit}
                value={config.templates[selectedEventType] || ''}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full font-mono text-xs bg-purple-950/80 border border-purple-500/30 text-emerald-300 rounded-xl p-3.5 focus:ring-2 focus:ring-purple-500 focus:outline-none leading-relaxed"
                placeholder="Type your WhatsApp notification message template here..."
              />
            </div>

            {/* Preview Box */}
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/20 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">
                WhatsApp Live Preview Example
              </span>
              <pre className="font-sans text-xs text-purple-100 whitespace-pre-wrap leading-relaxed">
                {(config.templates[selectedEventType] || '')
                  .replace(/\{\{employeeName\}\}/g, 'Rohit Sharma')
                  .replace(/\{\{employeeCode\}\}/g, 'EMP-104')
                  .replace(/\{\{attendanceType\}\}/g, 'OFFICE')
                  .replace(/\{\{checkInTime\}\}/g, '09:30 AM')
                  .replace(/\{\{checkOutTime\}\}/g, '06:30 PM')
                  .replace(/\{\{workingHours\}\}/g, '9h 00m')
                  .replace(/\{\{distance\}\}/g, '12')
                  .replace(/\{\{townCity\}\}/g, 'Raniganj HQ')
                  .replace(/\{\{wfhReason\}\}/g, 'Medical consultation')
                  .replace(/\{\{workPlan\}\}/g, 'Sprint bug triage')
                  .replace(/\{\{clientName\}\}/g, 'Acme Corp')
                  .replace(/\{\{clientLocation\}\}/g, 'Kolkata Sector V')
                  .replace(/\{\{purpose\}\}/g, 'ERP System Training')
                  .replace(/\{\{outdoorType\}\}/g, 'Site Visit')
                  .replace(/\{\{description\}\}/g, 'Client server deployment')
                  .replace(/\{\{eventTime\}\}/g, '09:30 AM')
                  .replace(/\{\{customMessage\}\}/g, 'System update alert')}
              </pre>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
