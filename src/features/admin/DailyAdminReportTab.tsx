import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
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
  adminEmail: string;
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
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  recipient: string;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export function DailyAdminReportTab() {
  const { adminToken, adminUser } = useAdminAuth();
  const isSuperAdmin = adminUser?.role === 'SUPER_ADMIN';

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

  // Load configuration & history
  const loadData = async () => {
    setLoading(true);
    try {
      const headers: HeadersInit = {
        'Authorization': `Bearer ${adminToken}`,
      };

      // Fetch config
      const configRes = await fetch('/api/admin/daily-report/config', { headers });
      const configData = await configRes.json();
      if (configData.success) {
        setConfig(configData.config);
      } else {
        throw new Error(configData.error || 'Failed to fetch config');
      }

      // Fetch history
      const historyRes = await fetch('/api/admin/daily-report/history', { headers });
      const historyData = await historyRes.json();
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
    if (adminToken) {
      loadData();
    }
  }, [adminToken]);

  // Save config handler
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !config) return;

    setSaving(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/admin/daily-report/config', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setStatusMsg({ type: 'success', text: 'Daily Admin Report configuration saved successfully.' });
        loadData(); // Reload to refresh logs
      } else {
        throw new Error(data.error || 'Failed to save config');
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
      const res = await fetch('/api/admin/daily-report/send-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: data.message || 'Test report email dispatched successfully.' });
      } else {
        throw new Error(data.error || 'Test email delivery failed.');
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
      const res = await fetch('/api/admin/daily-report/send-yesterday', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: manualDate || undefined }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMsg({ 
          type: 'success', 
          text: `Daily operations report generated and sent to admin for ${data.reportDate} (MessageId: ${data.messageId || 'simulated'}).` 
        });
        loadData(); // reload log history
      } else {
        throw new Error(data.error || 'Manual report generation failed.');
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to generate manual report.' });
    } finally {
      setManualTriggerLoading(false);
    }
  };

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
            <h2 className="text-base font-black uppercase tracking-wider">Daily Admin Email Reports</h2>
            <p className="text-purple-300/80 text-xs mt-0.5 max-w-xl">
              Consolidates daily operations, including attendance types, unresolved checkouts, leave calendars, and expense claims. Dispatched automatically via scheduler.
            </p>
          </div>
        </div>
        <Button onClick={loadData} variant="secondary" className="text-xs shrink-0 flex items-center gap-1.5 border border-purple-500/20">
          <RefreshCw className="w-3.5 h-3.5" />
          Reload
        </Button>
      </Card>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Configuration settings (Form) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white">
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-purple-400" /> Report Generation Settings
            </h3>

            {!isSuperAdmin && (
              <div className="mb-4 p-3 bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs rounded-xl flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>Standard Administrator access only. Configuration is in read-only mode. Super-Admin credentials are required to update settings.</span>
              </div>
            )}

            {config && (
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-[#1D093F]/60 rounded-xl border border-purple-500/10">
                  <div>
                    <label className="text-xs font-bold block text-white">Automated Daily Delivery</label>
                    <span className="text-purple-300/60 text-xs">Enable scheduler to generate and deliver the previous day's report daily.</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={config.enabled}
                      disabled={!isSuperAdmin}
                      onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                      className="sr-only peer"
                      id="daily-report-enabled"
                    />
                    <label 
                      htmlFor="daily-report-enabled"
                      className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out relative cursor-pointer ${
                        config.enabled ? 'bg-purple-500' : 'bg-slate-700'
                      } ${!isSuperAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ease-in-out shadow-md ${
                        config.enabled ? 'transform translate-x-5' : ''
                      }`} />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-extrabold text-purple-200 uppercase tracking-wider block mb-1">Recipient Admin Email *</label>
                    <input 
                      type="email"
                      required
                      placeholder="admin@exfin.in"
                      disabled={!isSuperAdmin}
                      value={config.adminEmail}
                      onChange={(e) => setConfig({ ...config, adminEmail: e.target.value })}
                      className="w-full bg-[#1A0736] border border-purple-500/30 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-extrabold text-purple-200 uppercase tracking-wider block mb-1">Automated Delivery Target Time</label>
                    <input 
                      type="text"
                      placeholder="07:00 AM"
                      disabled={!isSuperAdmin}
                      value={config.sendTime}
                      onChange={(e) => setConfig({ ...config, sendTime: e.target.value })}
                      className="w-full bg-[#1A0736] border border-purple-500/30 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-purple-300/50 mt-1 block">Specify in Asia/Kolkata timezone context (e.g. 07:00 AM)</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="text-xs font-extrabold text-purple-200 uppercase tracking-wider block mb-2">Report Content Inclusions</label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 p-3 bg-[#1A0736]/40 border border-purple-500/10 rounded-xl cursor-pointer hover:bg-[#1A0736]/60 transition-colors">
                      <input 
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={config.includeAttendance}
                        onChange={(e) => setConfig({ ...config, includeAttendance: e.target.checked })}
                        className="rounded border-purple-500/30 bg-[#1A0736] text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <div className="text-xs">
                        <span className="font-bold block">1. Attendance Details</span>
                        <span className="text-purple-300/60 text-[10px]">Present, Absent, Late lists, WFH reasons, and locations.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-[#1A0736]/40 border border-purple-500/10 rounded-xl cursor-pointer hover:bg-[#1A0736]/60 transition-colors">
                      <input 
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={config.includeLeaves}
                        onChange={(e) => setConfig({ ...config, includeLeaves: e.target.checked })}
                        className="rounded border-purple-500/30 bg-[#1A0736] text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <div className="text-xs">
                        <span className="font-bold block">2. Active Leaves</span>
                        <span className="text-purple-300/60 text-[10px]">Employees absent on approved leaves and balance deductions.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-[#1A0736]/40 border border-purple-500/10 rounded-xl cursor-pointer hover:bg-[#1A0736]/60 transition-colors">
                      <input 
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={config.includeExpenses}
                        onChange={(e) => setConfig({ ...config, includeExpenses: e.target.checked })}
                        className="rounded border-purple-500/30 bg-[#1A0736] text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <div className="text-xs">
                        <span className="font-bold block">3. Expense Claims</span>
                        <span className="text-purple-300/60 text-[10px]">Claims filed on report date formatted neatly with rupee sum.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-[#1A0736]/40 border border-purple-500/10 rounded-xl cursor-pointer hover:bg-[#1A0736]/60 transition-colors">
                      <input 
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={config.includeOtherDailyActivity}
                        onChange={(e) => setConfig({ ...config, includeOtherDailyActivity: e.target.checked })}
                        className="rounded border-purple-500/30 bg-[#1A0736] text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <div className="text-xs">
                        <span className="font-bold block">4. Other Operational Data</span>
                        <span className="text-purple-300/60 text-[10px]">Work Planner updates and created system events.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="pt-4 flex items-center justify-end">
                    <Button 
                      type="submit" 
                      disabled={saving}
                      className="text-xs bg-purple-600 hover:bg-purple-500 text-white font-extrabold flex items-center gap-2 px-6"
                    >
                      {saving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Save Report Settings
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
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white space-y-4">
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" /> On-Demand Trigger Engine
            </h3>
            
            <p className="text-purple-300/70 text-[11px] leading-relaxed">
              Verify report structure instantly or manually regenerate the report for any historical calendar day. All manual dispatches are securely logged.
            </p>

            <div className="space-y-4 pt-2">
              {/* Test Email */}
              <div className="p-3 bg-[#1A0736]/40 border border-purple-500/10 rounded-xl space-y-2">
                <span className="text-xs font-bold block text-purple-200">Test Server Connection</span>
                <span className="text-[10px] text-purple-300/60 block">Sends a clean connection verification report to the configured recipient email address.</span>
                <Button
                  onClick={handleSendTestEmail}
                  disabled={testEmailLoading || !isSuperAdmin || !config?.adminEmail}
                  variant="secondary"
                  className="w-full text-xs text-center flex items-center justify-center gap-1.5 border border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50"
                >
                  {testEmailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send Test Verification
                </Button>
              </div>

              {/* Manual date trigger */}
              <div className="p-3 bg-[#1A0736]/40 border border-purple-500/10 rounded-xl space-y-3">
                <span className="text-xs font-bold block text-purple-200">Force Historical Report</span>
                <div>
                  <label className="text-[10px] text-purple-300/60 block mb-1">Target Date (Leave blank for yesterday)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-300/50" />
                      <input 
                        type="text"
                        placeholder="YYYY-MM-DD"
                        value={manualDate}
                        onChange={(e) => setManualDate(e.target.value)}
                        className="w-full bg-[#120427] border border-purple-500/30 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleSendManualReport}
                  disabled={manualTriggerLoading || !isSuperAdmin || !config?.adminEmail}
                  className="w-full text-xs text-center flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                >
                  {manualTriggerLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Trigger Report Dispatch
                </Button>
              </div>
            </div>
          </Card>
        </div>

      </div>

      {/* History Log Table */}
      <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white">
        <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-purple-400" /> Delivery & Execution History Logs
        </h3>

        {history.length === 0 ? (
          <div className="text-center py-8 text-purple-300/40 text-xs">
            No execution or manual delivery history logs found in the database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-purple-500/20 text-purple-300 font-extrabold uppercase tracking-wider">
                  <th className="py-2.5 px-4">Report Date</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Recipient</th>
                  <th className="py-2.5 px-4">Started At</th>
                  <th className="py-2.5 px-4">Completed At</th>
                  <th className="py-2.5 px-4">Message ID / Log / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-purple-400" />
                      {item.reportDate}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === 'SENT' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : item.status === 'SENDING'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-purple-300/80">{item.recipient}</td>
                    <td className="py-3 px-4 text-purple-300/60 font-mono text-[10px]">
                      {item.startedAt ? new Date(item.startedAt).toLocaleString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-purple-300/60 font-mono text-[10px]">
                      {item.completedAt ? new Date(item.completedAt).toLocaleString() : '-'}
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
