import React, { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { MessageCircle, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import {
  getEmployeeWhatsAppPreference,
  setEmployeeWhatsAppPreference,
  maskPhoneNumber
} from '../../services/whatsapp/whatsappService';

export const WhatsAppSettingsCard: React.FC = () => {
  const { employeeData } = useRegistration();
  const [optedIn, setOptedIn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const empCode = employeeData?.employeeCode;
  const mobile = employeeData?.mobileNumber || employeeData?.phone;

  useEffect(() => {
    if (!empCode) {
      setLoading(false);
      return;
    }

    getEmployeeWhatsAppPreference(empCode).then((pref) => {
      setOptedIn(pref.optedIn);
      setLoading(false);
    });
  }, [empCode]);

  const handleToggle = async () => {
    if (!empCode) return;
    const newStatus = !optedIn;
    setOptedIn(newStatus);
    setSaving(true);
    setStatusMessage(null);

    try {
      await setEmployeeWhatsAppPreference(empCode, newStatus, mobile);
      setStatusMessage(newStatus ? 'Opted in to WhatsApp updates.' : 'Opted out of WhatsApp updates.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update WhatsApp preference:', err);
      setOptedIn(!newStatus); // revert
      setStatusMessage('Failed to save preference.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
      <div className="flex justify-between items-center border-b border-purple-500/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase text-purple-200 tracking-wider">
              WhatsApp Notifications
            </h2>
            <p className="text-[10px] text-purple-300/70">Official business alerts on your WhatsApp number</p>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
            optedIn
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
          }`}
        >
          {optedIn ? 'OPTED IN' : 'OPTED OUT'}
        </span>
      </div>

      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between bg-[#211044] p-3 rounded-xl border border-purple-500/10">
          <div className="space-y-0.5">
            <p className="font-bold text-white">Receive EXFIN OMS Alerts</p>
            <p className="text-[10px] text-purple-300/70">
              Get leave decisions, attendance corrections & device approval alerts.
            </p>
          </div>

          <button
            onClick={handleToggle}
            disabled={loading || saving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              optedIn ? 'bg-emerald-500' : 'bg-purple-900/80'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                optedIn ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="bg-[#211044]/60 p-3 rounded-xl border border-purple-500/10 flex items-center justify-between text-[11px]">
          <span className="text-purple-300/80 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" /> Registered Number:
          </span>
          <span className="font-mono font-bold text-white">
            {mobile ? maskPhoneNumber(mobile) : 'No mobile registered'}
          </span>
        </div>

        {statusMessage && (
          <div className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg text-center">
            {statusMessage}
          </div>
        )}
      </div>
    </Card>
  );
};
