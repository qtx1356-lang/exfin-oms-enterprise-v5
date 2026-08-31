import React, { useEffect, useState } from 'react';
import { db } from '../../services/firebase/config';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Smartphone, RefreshCw } from 'lucide-react';
import { Registration } from '../../types/attendance';

export const RegistrationsTab: React.FC = () => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const qRegs = query(collection(db, 'registrations'), limit(500));
    const unsub = onSnapshot(qRegs, (snapshot) => {
      const regs: Registration[] = [];
      snapshot.forEach((doc) => {
        regs.push({ id: doc.id, ...doc.data() } as Registration);
      });
      setRegistrations(regs);
      setIsLoading(false);
    }, (err) => {
      console.error('Failed to fetch registrations:', err);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const deduplicatedRegistrations = React.useMemo(() => {
    const map = new Map<string, Registration>();
    const getCodeNum = (code: string) => parseInt(code.replace('EXFRNG', ''), 10) || 0;

    registrations.forEach((reg) => {
      const existing = map.get(reg.deviceId);
      if (!existing) {
        map.set(reg.deviceId, reg);
      } else {
        const dateNew = new Date(reg.registrationDate || 0).getTime();
        const dateOld = new Date(existing.registrationDate || 0).getTime();
        
        if (dateNew > dateOld) {
          map.set(reg.deviceId, reg);
        } else if (dateNew === dateOld) {
          if (getCodeNum(reg.employeeCode) > getCodeNum(existing.employeeCode)) {
            map.set(reg.deviceId, reg);
          }
        }
      }
    });
    return Array.from(map.values());
  }, [registrations]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        <p className="text-purple-300 font-bold animate-pulse">Loading Registrations...</p>
      </div>
    );
  }

  return (
    <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-emerald-400" /> Device Registration Management
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#1A0B36] text-purple-300 uppercase font-bold border-b border-purple-500/20">
              <th className="p-3">Employee</th>
              <th className="p-3">Device Model</th>
              <th className="p-3">Office</th>
              <th className="p-3">Device ID</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-500/10">
            {deduplicatedRegistrations.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-purple-300/60">No device registrations found.</td>
              </tr>
            ) : (
              deduplicatedRegistrations.map((reg) => (
                <tr key={reg.id} className="hover:bg-white/[0.02]">
                  <td className="p-3 font-bold text-white">{reg.name} ({reg.employeeCode})</td>
                  <td className="p-3 text-purple-200">{reg.deviceModel} (Android {reg.androidVersion})</td>
                  <td className="p-3 text-purple-200">{reg.office}</td>
                  <td className="p-3 text-purple-200 font-mono text-[10px]">{reg.deviceId}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      reg.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {reg.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
