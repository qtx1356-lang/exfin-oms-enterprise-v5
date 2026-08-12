import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { db } from '../../services/firebase/config';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { NotificationRecord } from '../../types/notification';
import { MessageCircle, Bell, Smartphone, RefreshCw, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

export const NotificationDeliveryLog: React.FC = () => {
  const [logs, setLogs] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (!db) {
        setLoading(false);
        return;
      }
      const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(100));
      const snap = await getDocs(q);
      const fetched: NotificationRecord[] = [];
      snap.forEach((doc) => fetched.push({ id: doc.id, ...doc.data() } as any));

      setLogs(fetched);
    } catch (err) {
      console.error('Failed to fetch delivery logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4 rounded-[24px]">
      <div className="flex justify-between items-center border-b border-purple-500/15 pb-3">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-400" /> Multi-Channel Delivery Logs
          </h3>
          <p className="text-[10px] text-purple-300/60 mt-0.5">
            Audit trail of In-App, Push, and WhatsApp Business dispatch status per business event
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="p-2 hover:bg-purple-500/20 rounded-xl text-purple-300 transition-colors"
          title="Refresh logs"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {loading && logs.length === 0 ? (
          <div className="text-center py-10 text-purple-300/40 animate-pulse text-xs font-bold">
            Loading dispatch logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 text-purple-300/40 border border-dashed border-purple-500/15 rounded-2xl">
            <Info className="w-8 h-8 mx-auto text-purple-500/30 mb-2" />
            <p className="text-xs font-bold">No dispatch logs found</p>
            <p className="text-[10px] text-purple-300/60 mt-0.5">
              System alerts, leave decisions, or announcements will populate this delivery log.
            </p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/25 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {log.type}
                  </span>
                  <span className="text-[10px] font-mono text-purple-300/60">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Just now'}
                  </span>
                </div>
                <h4 className="text-sm font-black text-white">{log.title}</h4>
                <p className="text-xs text-purple-200/85">{log.message}</p>
                <div className="text-[10px] text-purple-300/80 font-mono pt-1">
                  Target Employee: <strong className="text-purple-200">{log.recipientEmployeeCode || 'GLOBAL'}</strong>
                </div>
              </div>

              <div className="flex flex-col gap-2 shrink-0 w-full sm:w-52 bg-[#15082E] p-3 rounded-xl border border-purple-500/10">
                <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-0.5">
                  Delivery Channels
                </div>

                {/* In-App */}
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-purple-200">
                    <Bell className="w-3.5 h-3.5 text-emerald-400" /> In-App
                  </span>
                  <span className="text-emerald-400 font-bold">✓</span>
                </div>

                {/* Push */}
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-purple-200">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-400" /> Push
                  </span>
                  {log.channels?.includes('PUSH') ? (
                    <span className="text-emerald-400 font-bold">✓</span>
                  ) : (
                    <span className="text-purple-300/30">—</span>
                  )}
                </div>

                {/* WhatsApp */}
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-purple-200">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp
                  </span>
                  {log.channels?.includes('WHATSAPP') ? (
                    <span
                      className={`font-bold text-[11px] ${
                        log.whatsappStatus === 'FAILED'
                          ? 'text-rose-400'
                          : log.whatsappStatus === 'DELIVERED' || log.whatsappStatus === 'READ'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {log.whatsappStatus === 'FAILED'
                        ? 'FAILED ✗'
                        : log.whatsappStatus === 'DELIVERED' || log.whatsappStatus === 'READ'
                        ? 'DELIVERED ✓'
                        : log.whatsappStatus || 'QUEUED'}
                    </span>
                  ) : (
                    <span className="text-purple-300/30">—</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
