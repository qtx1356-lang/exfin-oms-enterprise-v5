import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';
import { auth, getActiveAuth } from '../../services/firebase/config';
import { API_BASE_URL } from '../../utils/apiConfig';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  Mail, 
  Settings, 
  Send, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Play, 
  ShieldAlert,
  Calendar,
  History,
  Check,
  X,
  AlertCircle
} from 'lucide-react';

interface DailyReportConfig {
  enabled: boolean;
  adminEmail?: string; // fallback
  adminEmails: string[];
  sendTime: string;
  includeAttendance: boolean;
  includeLeaves: boolean;
  includeExpenses: boolean;
  includeOtherDailyActivity: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

interface ReportHistoryItem {
  id: string;
  reportDate: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'PARTIALLY_SENT' | 'FAILED' | 'NOT_CONFIGURED';
  startedAt: string;
  completedAt?: string;
  recipientCount?: number;
  recipients?: string[];
  recipient: string;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export function DailyAdminReportTab() {
  const { user, role: adminRole, loading: authLoading } = useAdminAuth();
  const { isSuperAdmin: checkIsSuperAdmin, currentRole, loading: permLoading } = usePermission();

  const isAuthLoading = authLoading || permLoading;
  const isSuperAdmin = adminRole === 'SUPER_ADMIN' || currentRole === 'SUPER_ADMIN' || (typeof checkIsSuperAdmin === 'function' && checkIsSuperAdmin());

  const [config, setConfig] = useState<DailyReportConfig | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Custom manual trigger state
  const [manualDate, setManualDate] = useState('');
  const [manualTriggerLoading, setManualTriggerLoading] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);

  // Status banners
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New email input states
  const [newEmail, setNewEmail] = useState('');
  const [emailInputError, setEmailInputError] = useState('');

  // Diagnostic states
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [selectedHour, setSelectedHour] = useState('07');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');

  // Helper to parse 24h string to 12h parts
  const to12HourFormat = (time24: string): { hour: string; minute: string; period: 'AM' | 'PM' } => {
    if (!time24) return { hour: '07', minute: '00', period: 'AM' };
    try {
      const trimmed = time24.trim().toUpperCase();
      const match = trimmed.match(/^(\d+):(\d+)\s*(AM|PM)?$/);
      if (!match) {
        return { hour: '07', minute: '00', period: 'AM' };
      }
      
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      let period: 'AM' | 'PM' = match[3] as 'AM' | 'PM' || 'AM';
      
      if (!match[3]) {
        if (hours >= 12) {
          period = 'PM';
          if (hours > 12) hours -= 12;
        } else {
          period = 'AM';
          if (hours === 0) hours = 12;
        }
      } else {
        if (hours > 12) {
          hours = hours % 12 || 12;
        }
      }
      
      return {
        hour: String(hours).padStart(2, '0'),
        minute: String(minutes).padStart(2, '0'),
        period
      };
    } catch (e) {
      return { hour: '07', minute: '00', period: 'AM' };
    }
  };

  // Helper to convert 12h components back to 24h string
  const to24HourFormat = (hour: string, minute: string, period: 'AM' | 'PM'): string => {
    let hours = parseInt(hour, 10);
    if (isNaN(hours)) hours = 7;
    const mins = parseInt(minute, 10);
    const minStr = String(isNaN(mins) ? 0 : mins).padStart(2, '0');
    
    if (period === 'PM' && hours < 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${String(hours).padStart(2, '0')}:${minStr}`;
  };

  // Helper to reliably get Firebase Auth token
  const getAuthToken = async (): Promise<string | null> => {
    if (user) {
      try {
        return await user.getIdToken();
      } catch (e) {
        console.warn('Failed to get token from admin user:', e);
      }
    }
    const activeAuth = getActiveAuth?.() || auth?.concrete || auth;
    if (activeAuth?.currentUser) {
      try {
        return await activeAuth.currentUser.getIdToken();
      } catch (e) {
        console.warn('Failed to get token from activeAuth.currentUser:', e);
      }
    }
    return null;
  };

  const handleEmailInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewEmail(e.target.value);
    if (emailInputError) {
      setEmailInputError('');
    }
  };

  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    const trimmed = newEmail.trim();
    if (!trimmed) {
      setEmailInputError('Email address cannot be empty.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailInputError('Please enter a valid email address.');
      return;
    }

    const currentEmails = config.adminEmails || [];
    if (currentEmails.length >= 20) {
      setEmailInputError('Maximum of 20 recipients allowed.');
      return;
    }

    const lower = trimmed.toLowerCase();
    if (currentEmails.some(email => email.toLowerCase() === lower)) {
      setEmailInputError('This email address is already added.');
      return;
    }

    // Add it to state
    setConfig({
      ...config,
      adminEmails: [...currentEmails, trimmed]
    });
    setNewEmail('');
    setEmailInputError('');
  };

  const handleRemoveRecipient = (emailToRemove: string) => {
    if (!config) return;
    const currentEmails = config.adminEmails || [];
    setConfig({
      ...config,
      adminEmails: currentEmails.filter(email => email !== emailToRemove)
    });
  };

  // Helper to safely fetch and parse JSON
  const safeFetchJson = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options);
    const contentType = res.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Expected JSON but received ${contentType || 'unknown format'} (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || `Request failed with HTTP ${res.status}`);
    }
    return data;
  };

  // Load configuration & history
  const loadData = async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication token is unavailable. Please sign in again.');
      }
      const headers: HeadersInit = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      // Fetch config
      const configData = await safeFetchJson(API_BASE_URL + `/api/admin/daily-report/config?t=${Date.now()}`, { headers });
      if (configData.success) {
        setConfig(configData.config);
        const { hour, minute, period } = to12HourFormat(configData.config.sendTime);
        setSelectedHour(hour);
        setSelectedMinute(minute);
        setSelectedPeriod(period);
      } else {
        throw new Error(configData.error || 'Failed to fetch config');
      }

      // Fetch diagnostics
      try {
        const diagData = await safeFetchJson(API_BASE_URL + `/api/admin/daily-report/diagnostics?t=${Date.now()}`, { headers });
        if (diagData.success) {
          setDiagnostics(diagData.diagnostics);
        }
      } catch (e) {
        console.warn('Could not fetch report diagnostics:', e);
      }

      // Fetch history
      const historyData = await safeFetchJson(API_BASE_URL + `/api/admin/daily-report/history?t=${Date.now()}`, { headers });
      if (historyData.success) {
        setHistory(historyData.history || []);
      }
    } catch (err: any) {
      console.error('Error loading report admin data:', err);
      setStatusMsg({ type: 'error', text: err.message || 'Failed to load administration data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      if (isSuperAdmin) {
        loadData();
      } else {
        setLoading(false);
      }
    }
  }, [isAuthLoading, isSuperAdmin]);

  // Save config handler
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !config) return;

    if (!config.adminEmails || config.adminEmails.length === 0) {
      setStatusMsg({ type: 'error', text: 'At least one email recipient is required before saving configuration.' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication token is unavailable. Please sign in again.');
      }

      const updatedSendTime = to24HourFormat(selectedHour, selectedMinute, selectedPeriod);
      const updatedConfig = {
        ...config,
        sendTime: updatedSendTime
      };

      const data = await safeFetchJson(API_BASE_URL + '/api/admin/daily-report/config', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
      });
      if (data.success) {
        setConfig(data.config);
        const parsed = to12HourFormat(data.config.sendTime);
        setSelectedHour(parsed.hour);
        setSelectedMinute(parsed.minute);
        setSelectedPeriod(parsed.period);
        setStatusMsg({ type: 'success', text: 'Daily Admin Report configuration saved successfully.' });
        loadData(); // Reload to refresh logs and diagnostics
      } else {
        throw new Error(data.error || `Failed to save config`);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save configuration.' });
    } finally {
      setSaving(false);
    }
  };

  // Dispatch Test Email
  const handleSendTestEmail = async () => {
    if (!isSuperAdmin) return;
    setTestEmailLoading(true);
    setStatusMsg(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication token is unavailable. Please sign in again.');
      }

      const data = await safeFetchJson(API_BASE_URL + '/api/admin/daily-report/send-test', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (data.success) {
        setStatusMsg({ type: 'success', text: data.message || 'Test report email dispatched successfully.' });
      } else {
        throw new Error(data.error || `Test email delivery failed`);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to send test email.' });
    } finally {
      setTestEmailLoading(false);
    }
  };

  // Dispatch Manual Report
  const handleSendManualReport = async () => {
    if (!isSuperAdmin) return;
    setManualTriggerLoading(true);
    setStatusMsg(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication token is unavailable. Please sign in again.');
      }

      const data = await safeFetchJson(API_BASE_URL + '/api/admin/daily-report/send-yesterday', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: manualDate || undefined }),
      });
      if (data.success) {
        setStatusMsg({ 
          type: 'success', 
          text: `Previous Day Report sent successfully for ${data.reportDate} to ${data.recipientCount || (data.recipients?.length || 0)} recipient(s). (MessageId: ${data.messageId || 'simulated'}).` 
        });
        loadData(); // reload log history
      } else {
        const stageInfo = data.stage ? `[Stage: ${data.stage}] ` : '';
        throw new Error(`${stageInfo}${data.error || 'Previous Day Report failed'}`);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to generate manual report.' });
    } finally {
      setManualTriggerLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3 bg-[#1D093F] border border-purple-500/10 rounded-2xl min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        <p className="text-purple-300 text-xs">Authenticating Super-Admin privileges...</p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-8 bg-[#250F4C] border border-purple-500/20 rounded-2xl text-center space-y-4 max-w-xl mx-auto my-12 shadow-xl">
        <div className="w-12 h-12 bg-rose-500/20 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-black uppercase tracking-wider text-white">Super-Admin Access Required</h2>
        <p className="text-xs text-purple-300/80 leading-relaxed">
          The Daily Admin Email Report module contains executive operational briefing data and recipient delivery configurations. This module is restricted exclusively to Super-Administrators.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3 bg-[#1D093F] border border-purple-500/10 rounded-2xl min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        <p className="text-purple-300 text-xs">Fetching report engine state...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Alert Banner */}
      {statusMsg && (
        <div className={`p-4 rounded-xl flex items-start gap-3 border ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-200' 
            : 'bg-rose-950/60 border-rose-500/30 text-rose-200'
        } text-xs shadow-md`}>
          {statusMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-bold text-white">
              {statusMsg.type === 'success' ? 'Action Successful' : 'Notice / Error'}
            </p>
            <p className="opacity-90 mt-0.5">{statusMsg.text}</p>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-white hover:opacity-75 font-bold">×</button>
        </div>
      )}

      {/* Intro Panel */}
      <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 rounded-xl border border-purple-500/30">
            <Mail className="w-6 h-6 text-purple-300" />
          </div>
          <div>
            <h2 className="text-base font-black uppercase tracking-wider">DAILY ADMIN EMAIL REPORT</h2>
            <p className="text-purple-300/80 text-xs mt-0.5 max-w-xl">
              Consolidated automated morning briefing of daily operations, attendance modes, unresolved checkouts, active leaves, and expense claims dispatched to executive administrators.
            </p>
          </div>
        </div>
        <Button onClick={loadData} variant="secondary" className="text-xs shrink-0 flex items-center gap-1.5 border border-purple-500/20">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </Card>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Configuration settings (Form) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white">
            <div className="flex items-center justify-between mb-4 border-b border-purple-500/20 pb-3">
              <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4 text-purple-400" /> Report Configuration
              </h3>
              {config && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-purple-300">Status:</span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    config.enabled 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}>
                    {config.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
              )}
            </div>

            {!isSuperAdmin && (
              <div className="mb-4 p-3 bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs rounded-xl flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>Standard Administrator access only. Configuration is in read-only mode. Super-Admin credentials are required to update settings.</span>
              </div>
            )}

            {config && (
              <form onSubmit={handleSaveConfig} className="space-y-5">
                {/* Status Toggle Switch */}
                <div className="flex items-center justify-between p-4 bg-[#1D093F]/80 rounded-xl border border-purple-500/20">
                  <div>
                    <label className="text-xs font-black block text-white uppercase tracking-wider">Automated Daily Delivery Status</label>
                    <span className="text-purple-300/70 text-xs">Enable or disable automatic morning email dispatch to configured recipients.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!isSuperAdmin}
                      onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all flex items-center gap-1.5 ${
                        config.enabled 
                          ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      } ${!isSuperAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {config.enabled ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      {config.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                </div>

                {/* Admin Email Recipients */}
                <div className="p-4 bg-[#1D093F]/60 rounded-xl border border-purple-500/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-purple-200 uppercase tracking-wider block">
                      ADMIN EMAIL RECIPIENTS
                    </label>
                    <span className="text-[10px] font-mono text-purple-300/70">
                      ({config.adminEmails?.length || 0}/20) • Maximum 20 recipients.
                    </span>
                  </div>
                  
                  {/* Chips of existing recipients */}
                  <div className="min-h-[48px] p-2.5 bg-[#14062B] border border-purple-500/20 rounded-xl">
                    {(!config.adminEmails || config.adminEmails.length === 0) ? (
                      <p className="text-purple-300/40 text-xs italic py-1">
                        No email recipients configured. Please enter an email below and click ADD.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {config.adminEmails.map((email) => (
                          <span 
                            key={email}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#250F4C] border border-purple-500/40 rounded-lg text-xs text-white font-medium shadow-sm hover:border-purple-400 transition-colors"
                          >
                            <Mail className="w-3 h-3 text-purple-300" />
                            <span>{email}</span>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRecipient(email)}
                                className="text-purple-300 hover:text-rose-400 ml-1 p-0.5 rounded transition-colors"
                                title="Remove recipient"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {isSuperAdmin && (
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-2">
                        <input 
                          type="email"
                          placeholder="Enter email address... (e.g. admin@example.com)"
                          value={newEmail}
                          onChange={handleEmailInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddRecipient(e);
                            }
                          }}
                          className="flex-1 bg-[#14062B] border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-white placeholder-purple-400/40 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                        />
                        <Button 
                          type="button"
                          onClick={handleAddRecipient}
                          variant="secondary"
                          className="text-xs font-black uppercase tracking-wider border border-purple-500/30 bg-purple-600/30 hover:bg-purple-600/50 text-white px-5 py-2.5"
                        >
                          ADD
                        </Button>
                      </div>
                      {emailInputError && (
                        <div className="p-2.5 bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs rounded-xl flex items-center gap-1.5 animate-fadeIn">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>{emailInputError}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Schedule details */}
                <div className="p-4 bg-[#1D093F]/60 rounded-xl border border-purple-500/10 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-purple-200 uppercase tracking-wider block mb-2">
                      Send Time (12-Hour Format)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedHour}
                        disabled={!isSuperAdmin}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedHour(val);
                          const newT = to24HourFormat(val, selectedMinute, selectedPeriod);
                          setConfig({ ...config, sendTime: newT });
                        }}
                        className="bg-[#14062B] border border-purple-500/30 rounded-xl px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 disabled:opacity-50"
                      >
                        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <span className="text-purple-300 font-bold font-mono">:</span>
                      <select
                        value={selectedMinute}
                        disabled={!isSuperAdmin}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedMinute(val);
                          const newT = to24HourFormat(selectedHour, val, selectedPeriod);
                          setConfig({ ...config, sendTime: newT });
                        }}
                        className="bg-[#14062B] border border-purple-500/30 rounded-xl px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 disabled:opacity-50"
                      >
                        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={selectedPeriod}
                        disabled={!isSuperAdmin}
                        onChange={(e) => {
                          const val = e.target.value as 'AM' | 'PM';
                          setSelectedPeriod(val);
                          const newT = to24HourFormat(selectedHour, selectedMinute, val);
                          setConfig({ ...config, sendTime: newT });
                        }}
                        className="bg-[#14062B] border border-purple-500/30 rounded-xl px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 disabled:opacity-50"
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                      <span className="text-[10px] text-purple-300/50 font-mono ml-1">
                        (Stored: {config.sendTime})
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-black text-purple-200 uppercase tracking-wider block mb-2">
                      Timezone
                    </label>
                    <input 
                      type="text"
                      disabled
                      value="Asia/Kolkata (IST +05:30)"
                      className="w-full bg-[#14062B]/60 border border-purple-500/20 rounded-xl px-4 py-2 text-xs text-purple-300 font-mono cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Report Contents */}
                <div className="p-4 bg-[#1D093F]/60 rounded-xl border border-purple-500/10 space-y-2">
                  <label className="text-xs font-black text-purple-200 uppercase tracking-wider block mb-2">
                    Report Contents
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 p-3 bg-[#14062B] border border-purple-500/20 rounded-xl cursor-pointer hover:border-purple-400/50 transition-colors">
                      <input 
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={config.includeAttendance}
                        onChange={(e) => setConfig({ ...config, includeAttendance: e.target.checked })}
                        className="w-4 h-4 rounded border-purple-500/40 bg-[#14062B] text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <div className="text-xs">
                        <span className="font-bold block text-white">Attendance</span>
                        <span className="text-purple-300/60 text-[10px]">Present, Absent, Late arrivals, WFH, Client & Outdoor visits</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-[#14062B] border border-purple-500/20 rounded-xl cursor-pointer hover:border-purple-400/50 transition-colors">
                      <input 
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={config.includeLeaves}
                        onChange={(e) => setConfig({ ...config, includeLeaves: e.target.checked })}
                        className="w-4 h-4 rounded border-purple-500/40 bg-[#14062B] text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <div className="text-xs">
                        <span className="font-bold block text-white">Leaves</span>
                        <span className="text-purple-300/60 text-[10px]">Active leaves, approved absences, and leave types</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-[#14062B] border border-purple-500/20 rounded-xl cursor-pointer hover:border-purple-400/50 transition-colors">
                      <input 
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={config.includeExpenses}
                        onChange={(e) => setConfig({ ...config, includeExpenses: e.target.checked })}
                        className="w-4 h-4 rounded border-purple-500/40 bg-[#14062B] text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <div className="text-xs">
                        <span className="font-bold block text-white">Expenses</span>
                        <span className="text-purple-300/60 text-[10px]">Claims submitted on date with total rupee summation</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-[#14062B] border border-purple-500/20 rounded-xl cursor-pointer hover:border-purple-400/50 transition-colors">
                      <input 
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={config.includeOtherDailyActivity}
                        onChange={(e) => setConfig({ ...config, includeOtherDailyActivity: e.target.checked })}
                        className="w-4 h-4 rounded border-purple-500/40 bg-[#14062B] text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <div className="text-xs">
                        <span className="font-bold block text-white">Other Daily Activity</span>
                        <span className="text-purple-300/60 text-[10px]">Work Planner activities and system operations logs</span>
                      </div>
                    </label>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="pt-2 flex items-center justify-end">
                    <Button 
                      type="submit" 
                      disabled={saving}
                      className="text-xs bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-wider flex items-center gap-2 px-6 py-2.5 rounded-xl shadow-lg shadow-purple-600/30"
                    >
                      {saving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          SAVING SETTINGS...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          SAVE SETTINGS
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </form>
            )}
          </Card>
        </div>

        {/* Right Side: Manual Operations & Test Dispatch */}
        <div className="space-y-6">
          {diagnostics && (
            <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white space-y-4">
              <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-purple-500/20 pb-2.5">
                <Settings className="w-4 h-4 text-purple-400" /> SCHEDULER DIAGNOSTICS
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-300">Automatic Daily Report</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    diagnostics.enabled 
                      ? 'bg-emerald-500/20 text-emerald-300' 
                      : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {diagnostics.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-300">Scheduled Time</span>
                  <span className="font-mono text-white font-bold">{diagnostics.configuredTime}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-300">Timezone</span>
                  <span className="font-mono text-purple-200">{diagnostics.timezone}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-300">Server Clock (Kolkata)</span>
                  <span className="font-mono text-purple-200">{diagnostics.currentTimeInTimezone}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-300 font-medium">Scheduler Mode</span>
                  <span className="text-amber-300 font-mono font-bold">GITHUB ACTIONS</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-300 font-medium">Endpoint Status</span>
                  <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    READY
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-300 font-medium">Last Scheduler Tick</span>
                  <span className="text-white font-mono text-[11px] font-bold">{diagnostics.lastSchedulerTick || 'NEVER CALLED'}</span>
                </div>

                <div className="border-t border-purple-500/10 my-1 pt-2 space-y-2">
                  <div className="text-xs">
                    <span className="text-purple-300/60 block text-[10px] uppercase font-black">Next Scheduled Execution:</span>
                    <span className="font-mono text-purple-200 text-xs block mt-0.5">{diagnostics.nextRun}</span>
                  </div>

                  <div className="text-xs pt-1">
                    <span className="text-purple-300/60 block text-[10px] uppercase font-black">Last Execution Run:</span>
                    <span className="font-mono text-purple-200 text-xs block mt-0.5">{diagnostics.lastRun}</span>
                  </div>

                  <div className="text-xs pt-1 flex justify-between items-center">
                    <span className="text-purple-300/60 text-[10px] uppercase font-black">Last Run Status:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      diagnostics.lastStatus === 'SENT' || diagnostics.lastStatus === 'SUCCESS'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : diagnostics.lastStatus === 'FAILED'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : diagnostics.lastStatus === 'SENDING'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                        : 'bg-slate-700 text-slate-300'
                    }`}>
                      {diagnostics.lastStatus}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white space-y-4">
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" /> On-Demand Actions
            </h3>
            
            <p className="text-purple-300/70 text-[11px] leading-relaxed">
              Trigger test verification emails to validate SMTP/Resend delivery or generate yesterday's full operations report on-demand.
            </p>

            <div className="space-y-4 pt-2">
              {/* Send Test Email Button */}
              <div className="p-4 bg-[#1D093F]/80 border border-purple-500/20 rounded-xl space-y-2">
                <span className="text-xs font-black uppercase tracking-wider block text-white">Send Test Email</span>
                <span className="text-[10px] text-purple-300/70 block">Dispatches a test verification message to all configured recipients to verify delivery pipeline.</span>
                <Button
                  onClick={handleSendTestEmail}
                  disabled={testEmailLoading || !isSuperAdmin || !config?.adminEmails || config.adminEmails.length === 0}
                  variant="secondary"
                  className="w-full text-xs text-center flex items-center justify-center gap-1.5 border border-purple-500/30 bg-purple-600/20 hover:bg-purple-600/40 text-white font-black uppercase tracking-wider py-2.5 rounded-xl disabled:opacity-50"
                >
                  {testEmailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-amber-400" />}
                  SEND TEST EMAIL
                </Button>
              </div>

              {/* Send Yesterday's Report Now Button */}
              <div className="p-4 bg-[#1D093F]/80 border border-purple-500/20 rounded-xl space-y-3">
                <span className="text-xs font-black uppercase tracking-wider block text-white">Send Yesterday's Report Now</span>
                <span className="text-[10px] text-purple-300/70 block">Generates the consolidated report for yesterday (or a custom date) and sends it immediately to all recipients.</span>
                <div>
                  <label className="text-[10px] text-purple-300/60 block mb-1">Optional Specific Date (YYYY-MM-DD):</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-300/50" />
                    <input 
                      type="text"
                      placeholder="e.g. 2026-08-27 (leave blank for yesterday)"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="w-full bg-[#14062B] border border-purple-500/30 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-purple-400/30 focus:outline-none focus:border-purple-400 font-mono"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSendManualReport}
                  disabled={manualTriggerLoading || !isSuperAdmin || !config?.adminEmails || config.adminEmails.length === 0}
                  className="w-full text-xs text-center flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  {manualTriggerLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  SEND YESTERDAY'S REPORT NOW
                </Button>
              </div>
            </div>
          </Card>
        </div>

      </div>

      {/* History Log Table */}
      <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white">
        <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-purple-400" /> Daily Report History
        </h3>

        {history.length === 0 ? (
          <div className="text-center py-8 text-purple-300/40 text-xs">
            No execution or manual delivery history logs found in the database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-purple-500/20 text-purple-300 font-black uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Recipients</th>
                  <th className="py-2.5 px-4">Sent At</th>
                  <th className="py-2.5 px-4">Log / Message ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 px-4 font-bold text-white flex items-center gap-2 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      {item.reportDate}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        item.status === 'SENT' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : item.status === 'SENDING'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-purple-300/80">
                      {item.recipients && item.recipients.length > 0 ? (
                        <div>
                          <div className="font-medium truncate max-w-[160px]" title={item.recipients.join(', ')}>
                            {item.recipients[0]}
                          </div>
                          {item.recipients.length > 1 && (
                            <span className="text-[10px] text-purple-300 font-bold bg-purple-500/20 px-2 py-0.5 rounded-full mt-0.5 inline-block">
                              +{item.recipients.length - 1} more ({item.recipients.length} total)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="truncate block max-w-[160px]" title={item.recipient || '-'}>
                          {item.recipient || '-'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-purple-300/70 font-mono text-[10px] whitespace-nowrap">
                      {item.completedAt ? new Date(item.completedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : (item.startedAt ? new Date(item.startedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-')}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-[11px]">
                      {item.status === 'FAILED' ? (
                        <span className="text-rose-400 flex items-center gap-1 font-medium" title={item.error}>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {item.error || 'Unknown Error'}
                        </span>
                      ) : (
                        <span className="text-purple-300/60 font-mono">
                          {item.messageId} {item.simulated ? '(Simulated)' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
