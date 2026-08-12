import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  MessageCircle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Save,
  Key,
  Layers,
  Info,
  RefreshCw,
  Lock
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { createAuditLog } from '../../services/audit/auditService';
import {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  WhatsAppConfig,
  DEFAULT_WHATSAPP_TEMPLATES
} from '../../services/whatsapp/whatsappService';

export const WhatsAppConfigTab: React.FC = () => {
  const { user, isSuperAdmin } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<'META_CLOUD_API' | 'WHATSAPP_BUSINESS_PLATFORM'>('META_CLOUD_API');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessTokenSecret, setAccessTokenSecret] = useState('');
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [templates, setTemplates] = useState(DEFAULT_WHATSAPP_TEMPLATES);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const cfg = await getWhatsAppConfig();
      setEnabled(cfg.enabled);
      setProvider(cfg.provider as any || 'META_CLOUD_API');
      setPhoneNumberId(cfg.phoneNumberId);
      setBusinessAccountId(cfg.businessAccountId);
      setHasAccessToken(cfg.hasAccessToken);
      if (cfg.templates && cfg.templates.length > 0) {
        setTemplates(cfg.templates);
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);

    try {
      await saveWhatsAppConfig({
        enabled,
        provider,
        phoneNumberId: phoneNumberId.trim(),
        businessAccountId: businessAccountId.trim(),
        templates,
        updatedBy: user?.displayName || 'Admin'
      }, accessTokenSecret.trim() || undefined);

      setHasAccessToken(hasAccessToken || !!accessTokenSecret.trim());
      setAccessTokenSecret('');
      setStatusMsg({ type: 'success', text: 'WhatsApp configuration saved successfully.' });

      await createAuditLog({
        action: 'Update WhatsApp Configuration',
        actionCategory: 'System',
        performedByUserId: user?.uid || 'admin',
        performedByName: user?.displayName || 'Admin',
        performedByRole: 'SUPER_ADMIN',
        targetRecordId: 'system_config/whatsapp',
        description: `Updated WhatsApp configuration. Enabled: ${enabled}, Provider: ${provider}`,
        result: 'SUCCESS',
        source: 'ADMIN_PANEL'
      });
    } catch (err: any) {
      console.error('Save failed', err);
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save configuration.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleTemplate = (templateId: string) => {
    setTemplates(prev =>
      prev.map(t => t.id === templateId ? { ...t, enabled: !t.enabled } : t)
    );
  };

  const getStatusBadge = () => {
    if (!hasAccessToken || !phoneNumberId) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" /> NOT CONFIGURED
        </span>
      );
    }
    if (enabled) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> SYSTEM ENABLED
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
        <XCircle className="w-3.5 h-3.5" /> DISABLED
      </span>
    );
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-purple-300 font-bold animate-pulse">
        Loading WhatsApp Configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner */}
      <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white rounded-[24px] shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                WhatsApp Business Integration
              </h2>
              <p className="text-xs text-purple-300/80">
                Server-side WhatsApp Business API channel for official business alerts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {getStatusBadge()}
            <button
              onClick={fetchConfig}
              className="p-2 hover:bg-purple-500/20 rounded-xl text-purple-300 transition-colors"
              title="Refresh configuration"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white space-y-5 rounded-[24px]">
          <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2 border-b border-purple-500/15 pb-3">
            <Key className="w-4 h-4 text-emerald-400" /> Gateway & Provider Configuration
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Enable Toggle */}
            <div className="md:col-span-2 bg-[#1A0B36] p-4 rounded-2xl border border-purple-500/20 flex items-center justify-between">
              <div>
                <p className="font-extrabold text-sm text-white">Enable WhatsApp Notifications</p>
                <p className="text-[11px] text-purple-300/70">
                  When enabled, allowed system events will dispatch to opted-in employee WhatsApp numbers
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enabled ? 'bg-emerald-500' : 'bg-purple-900/80'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Provider */}
            <div>
              <label className="text-[10px] font-extrabold text-purple-300 uppercase block mb-1">Provider Platform</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
              >
                <option value="META_CLOUD_API">Meta Cloud API (Official)</option>
                <option value="WHATSAPP_BUSINESS_PLATFORM">WhatsApp Business Platform On-Premises</option>
              </select>
            </div>

            {/* Phone Number ID */}
            <div>
              <label className="text-[10px] font-extrabold text-purple-300 uppercase block mb-1">WhatsApp Phone Number ID</label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 109283746510293"
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-mono text-xs"
              />
            </div>

            {/* Business Account ID */}
            <div>
              <label className="text-[10px] font-extrabold text-purple-300 uppercase block mb-1">Business Account ID (WABA ID)</label>
              <input
                type="text"
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                placeholder="e.g. 987654321098765"
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-mono text-xs"
              />
            </div>

            {/* Access Token */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-extrabold text-purple-300 uppercase">System API Access Token</label>
                {hasAccessToken && (
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Configured ✓
                  </span>
                )}
              </div>
              <input
                type="password"
                value={accessTokenSecret}
                onChange={(e) => setAccessTokenSecret(e.target.value)}
                placeholder={hasAccessToken ? '•••••••••••••••• (Leave blank to keep existing token)' : 'Paste System User Access Token'}
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-mono text-xs"
              />
            </div>
          </div>
        </Card>

        {/* Templates Management */}
        <Card className="p-6 bg-[#250F4C] border border-purple-500/20 text-white space-y-4 rounded-[24px]">
          <div>
            <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" /> Pre-Approved WhatsApp Message Templates
            </h3>
            <p className="text-[10px] text-purple-300/60 mt-0.5">
              WhatsApp requires pre-approved Meta Business templates for outbound notifications
            </p>
          </div>

          <div className="space-y-3">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-white">{tmpl.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {tmpl.whatsappTemplateName}
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-300/70">{tmpl.purpose}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-purple-300/60 uppercase font-bold">{tmpl.language}</span>
                  <button
                    type="button"
                    onClick={() => toggleTemplate(tmpl.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                      tmpl.enabled
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-purple-900/40 text-purple-400 border-purple-500/20'
                    }`}
                  >
                    {tmpl.enabled ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {statusMsg && (
          <div
            className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/60 text-emerald-200 border border-emerald-500/30'
                : 'bg-rose-950/60 text-rose-200 border border-rose-500/30'
            }`}
          >
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 text-xs font-black px-6 py-2.5 rounded-xl shadow-lg"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Configuration...' : 'Save WhatsApp Configuration'}
          </Button>
        </div>
      </form>
    </div>
  );
};
