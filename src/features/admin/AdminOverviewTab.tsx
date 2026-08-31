import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Smartphone, 
  Shield, 
  Users, 
  Calendar, 
  Activity, 
  KeyRound 
} from 'lucide-react';
import { getAdminDb } from '../../services/firebase/config';
import { collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SmartDailyBrief } from './SmartDailyBrief';

interface AdminOverviewTabProps {
  role: string;
  authorizedOffice: string;
  loginId: string;
  adminEmail: string;
  onNavigateToTab: (tabName: any) => void;
  canSeeAttendance: boolean;
  canSeeRegistrations: boolean;
  canSeeUserManagement: boolean;
  canSeeRbac: boolean;
  canSeeHealth: boolean;
  canSeeReports: boolean;
  canSeeOverview: boolean;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({
  role,
  authorizedOffice,
  loginId,
  adminEmail,
  onNavigateToTab,
  canSeeAttendance,
  canSeeRegistrations,
  canSeeUserManagement,
  canSeeRbac,
  canSeeHealth,
  canSeeReports,
  canSeeOverview
}) => {
  const [unresolvedAttendanceCount, setUnresolvedAttendanceCount] = useState(0);
  const [pendingRegCount, setPendingRegCount] = useState(0);
  const [pendingExpenseCount, setPendingExpenseCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [todayAttendanceCount, setTodayAttendanceCount] = useState(0);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const unsubs: (() => void)[] = [];

    setIsDataLoading(true);

    getAdminDb().then((activeDb) => {
      if (!isMounted || !activeDb) return;

      // Unresolved Attendance
      const unresolvedQuery = query(
        collection(activeDb, 'attendance'),
        where('status', '==', 'MISSING_CHECKOUT')
      );
      unsubs.push(onSnapshot(unresolvedQuery, (snap) => {
        if (isMounted) setUnresolvedAttendanceCount(snap.size);
      }, (err) => console.warn('AdminOverviewTab unresolved attendance error:', err)));

      // Pending Registrations
      const regQuery = query(
        collection(activeDb, 'registrations'),
        where('status', '==', 'Pending')
      );
      unsubs.push(onSnapshot(regQuery, (snap) => {
        if (!isMounted) return;
        setPendingRegCount(snap.size);
        const regs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRegistrations(regs);
      }, (err) => console.warn('AdminOverviewTab pending regs error:', err)));

      // All Registrations (for counts)
      const allRegQuery = query(collection(activeDb, 'registrations'));
      unsubs.push(onSnapshot(allRegQuery, (snap) => {
        if (!isMounted) return;
        const regs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRegistrations(regs);
      }, (err) => console.warn('AdminOverviewTab all regs error:', err)));

      // Today's Attendance
      const today = new Date().toISOString().split('T')[0];
      const todayQuery = query(
        collection(activeDb, 'attendance'),
        where('date', '==', today)
      );
      unsubs.push(onSnapshot(todayQuery, (snap) => {
        if (!isMounted) return;
        setTodayAttendanceCount(snap.size);
        setAttendanceRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.warn('AdminOverviewTab today attendance error:', err)));

      // Pending Expenses
      const expenseQuery = query(
        collection(activeDb, 'expenses'),
        where('status', '==', 'Pending')
      );
      unsubs.push(onSnapshot(expenseQuery, (snap) => {
        if (isMounted) setPendingExpenseCount(snap.size);
      }, (err) => console.warn('AdminOverviewTab pending expenses error:', err)));

      // Pending Leaves
      const leaveQuery = query(
        collection(activeDb, 'leaves'),
        where('status', '==', 'Pending')
      );
      unsubs.push(onSnapshot(leaveQuery, (snap) => {
        if (!isMounted) return;
        setPendingLeaveCount(snap.size);
        setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.warn('AdminOverviewTab pending leaves error:', err)));

      if (isMounted) setIsDataLoading(false);
    }).catch(err => {
      console.warn('AdminOverviewTab db load error:', err);
      if (isMounted) setIsDataLoading(false);
    });

    return () => {
      isMounted = false;
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  const adminName = loginId || adminEmail?.split('@')[0] || 'Admin';

  return (
    <div className="space-y-6">
      {unresolvedAttendanceCount > 0 && canSeeAttendance && (
        <div 
          onClick={() => onNavigateToTab('attendance')}
          className="p-4 bg-gradient-to-r from-rose-500/20 via-purple-600/20 to-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-between cursor-pointer hover:border-rose-500/50 transition-all shadow-lg mb-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 rounded-xl text-rose-300">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Attention: Unresolved Attendance Found</h4>
              <p className="text-xs text-rose-200/80">{unresolvedAttendanceCount} {unresolvedAttendanceCount === 1 ? 'record has' : 'records have'} unresolved checkout times requiring review.</p>
            </div>
          </div>
          <Button className="bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs pointer-events-none px-4 py-1.5 rounded-lg shadow-lg">
            View Unresolved →
          </Button>
        </div>
      )}

      {pendingRegCount > 0 && canSeeRegistrations && (
        <div 
          onClick={() => onNavigateToTab('pendingDeviceApprovals')}
          className="p-4 bg-gradient-to-r from-amber-500/20 via-purple-600/20 to-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between cursor-pointer hover:border-amber-500/50 transition-all shadow-lg animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Pending Device Approvals Required</h4>
              <p className="text-xs text-amber-200/80">{pendingRegCount} {pendingRegCount === 1 ? 'new device is' : 'new devices are'} awaiting administrative approval.</p>
            </div>
          </div>
          <Button className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs pointer-events-none">
            Review Approvals →
          </Button>
        </div>
      )}

      <SmartDailyBrief 
        registrations={registrations}
        attendanceRecords={attendanceRecords}
        leaves={leaves}
        role={role}
        authorizedOffice={authorizedOffice}
        adminName={adminName}
        onNavigateToTab={onNavigateToTab}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 bg-[#250F4C] border border-amber-500/30 flex items-center gap-4">
          <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-300">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <div className="text-[10px] text-amber-300 uppercase font-black">Security Context</div>
            <div className="text-xl font-black text-white">{role}</div>
          </div>
        </Card>

        <Card className="p-5 bg-[#250F4C] border border-purple-500/20 flex items-center gap-4">
          <div className="p-3 bg-purple-500/20 rounded-2xl text-purple-300">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <div className="text-[10px] text-purple-300 uppercase font-bold">Unique Devices</div>
            <div className="text-xl font-black text-white">{registrations.length} Total</div>
          </div>
        </Card>

        <Card className="p-5 bg-[#250F4C] border border-purple-500/20 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-300">
            <Calendar className="w-8 h-8" />
          </div>
          <div>
            <div className="text-[10px] text-purple-300 uppercase font-bold">Attendance Records</div>
            <div className="text-xl font-black text-emerald-400">
              {isDataLoading ? '—' : todayAttendanceCount} Today
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-[#250F4C] border border-purple-500/20 flex items-center gap-4">
          <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-300">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <div className="text-[10px] text-purple-300 uppercase font-bold">Action Items</div>
            <div className="text-xl font-black text-amber-300">
              {pendingRegCount + pendingExpenseCount + pendingLeaveCount} Pending
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" /> Executive Controls & Administration
          </h3>
          <p className="text-xs text-purple-200/70">
            You are operating with administrative privileges on the unified enterprise console.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {canSeeUserManagement && (
              <Button onClick={() => onNavigateToTab('userManagement')} className="bg-purple-600 hover:bg-purple-500 text-xs py-2.5">
                User Management
              </Button>
            )}
            {canSeeRbac && (
              <Button onClick={() => onNavigateToTab('rbac')} className="bg-emerald-600 hover:bg-emerald-500 text-xs py-2.5">
                Permissions Matrix
              </Button>
            )}
            {canSeeHealth && (
              <Button onClick={() => onNavigateToTab('health')} variant="secondary" className="text-xs py-2.5">
                System Health
              </Button>
            )}
            {canSeeReports && (
              <Button onClick={() => onNavigateToTab('reports')} variant="secondary" className="text-xs py-2.5">
                Enterprise Reports
              </Button>
            )}
            {canSeeOverview && (
              <Button onClick={() => onNavigateToTab('officePulse')} className="col-span-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs py-2.5">
                Live Office Pulse
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Immediate Attention Summary
          </h3>
          <div className="space-y-2 text-xs">
            <div 
              onClick={() => onNavigateToTab('pendingDeviceApprovals')}
              className="p-3 bg-[#1A0B36] rounded-xl flex justify-between items-center border border-purple-500/20 cursor-pointer hover:border-amber-400/50 transition-all"
            >
              <span className="text-purple-200 font-medium flex items-center gap-2">
                Pending Device Registrations
                <span className="text-[10px] text-amber-400 font-bold underline">Review →</span>
              </span>
              <span className="font-bold text-amber-400">{pendingRegCount}</span>
            </div>
            <div 
              onClick={() => onNavigateToTab('expenses')}
              className="p-3 bg-[#1A0B36] rounded-xl flex justify-between items-center border border-purple-500/20 cursor-pointer hover:border-amber-400/50 transition-all"
            >
              <span className="text-purple-200 font-medium flex items-center gap-2">
                Pending Expense Claims
                <span className="text-[10px] text-amber-400 font-bold underline">Review →</span>
              </span>
              <span className="font-bold text-amber-400">{pendingExpenseCount}</span>
            </div>
            <div 
              onClick={() => onNavigateToTab('leaves')}
              className="p-3 bg-[#1A0B36] rounded-xl flex justify-between items-center border border-purple-500/20 cursor-pointer hover:border-amber-400/50 transition-all"
            >
              <span className="text-purple-200 font-medium flex items-center gap-2">
                Pending Leave Requests
                <span className="text-[10px] text-amber-400 font-bold underline">Review →</span>
              </span>
              <span className="font-bold text-amber-400">{pendingLeaveCount}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
