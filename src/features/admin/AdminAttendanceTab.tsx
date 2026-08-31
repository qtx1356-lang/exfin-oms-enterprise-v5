import React, { useState, useEffect, useMemo } from 'react';
import { getAdminDb } from '../../services/firebase/config';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  limit, 
  orderBy, 
  doc, 
  updateDoc, 
  arrayUnion, 
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { 
  Calendar, Search, Clock, MapPin, Briefcase, Database, 
  AlertTriangle, CheckCircle, Wifi, WifiOff, RefreshCw,
  ChevronRight, ChevronDown, Smartphone, ShieldAlert
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { AttendanceRecord, AttendanceCorrection } from '../../types/attendance';
import { ManagedUser } from '../../types/user';
import { 
  isAttendanceCheckoutUnresolved, 
  getAttendanceCanonicalKey
} from '../../utils/attendanceUtils';
import { getKolkataDateStr, getRecordWorkingHoursDisplay } from '../../utils/workHoursCalc';

interface AdminAttendanceTabProps {
  role: 'ADMIN' | 'SUPER_ADMIN' | 'HR' | string;
  isSuperAdmin: () => boolean;
}

export const AdminAttendanceTab: React.FC<AdminAttendanceTabProps> = ({ role, isSuperAdmin }) => {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [registrations, setRegistrations] = useState<ManagedUser[]>([]);
  const [liveLocationByEmployee, setLiveLocationByEmployee] = useState<Map<string, any>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<'ALL' | 'MISSING_CHECKOUT' | 'LATE'>('ALL');
  const [collapsedDates, setCollapsedDates] = useState<{ [date: string]: boolean }>({});

  // Dialog states
  const [showAttendanceDetails, setShowAttendanceDetails] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceRecord | null>(null);

  // Rectify states
  const [showRectifyModal, setShowRectifyModal] = useState(false);
  const [selectedForRectify, setSelectedForRectify] = useState<AttendanceRecord | null>(null);
  const [rectifyCheckIn, setRectifyCheckIn] = useState('');
  const [rectifyCheckOut, setRectifyCheckOut] = useState('');
  const [rectifyReason, setRectifyReason] = useState('');
  const [rectifyError, setRectifyError] = useState('');
  const [showRectifyConfirm, setShowRectifyConfirm] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctionStep, setCorrectionStep] = useState<'idle' | 'verifying' | 'applying' | 'completed'>('idle');
  const [correctionMessage, setCorrectionMessage] = useState('');
  const [correctionResult, setCorrectionResult] = useState<AttendanceRecord | null>(null);

  const todayStr = getKolkataDateStr();

  // Firestore Subscriptions
  useEffect(() => {
    let isMounted = true;
    const unsubs: (() => void)[] = [];

    let attLoaded = false;
    let regsLoaded = false;
    let locsLoaded = false;

    const checkAllLoaded = () => {
      if (attLoaded && regsLoaded && locsLoaded && isMounted) {
        setIsLoading(false);
      }
    };

    getAdminDb().then((activeDb) => {
      if (!isMounted || !activeDb) return;

      // 1. Attendance (Last 1000 records)
      const qAtt = query(collection(activeDb, 'attendance'), orderBy('date', 'desc'), limit(1000));
      unsubs.push(onSnapshot(qAtt, (snap) => {
        if (!isMounted) return;
        const list: AttendanceRecord[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as AttendanceRecord));
        setAttendanceRecords(list);
        attLoaded = true;
        checkAllLoaded();
      }, (err) => {
        console.warn('AdminAttendanceTab attendance error:', err);
        attLoaded = true;
        checkAllLoaded();
      }));

      // 2. Registrations
      const qRegs = query(collection(activeDb, 'registrations'), limit(500));
      unsubs.push(onSnapshot(qRegs, (snap) => {
        if (!isMounted) return;
        const list: ManagedUser[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as ManagedUser));
        setRegistrations(list);
        regsLoaded = true;
        checkAllLoaded();
      }, (err) => {
        console.warn('AdminAttendanceTab registrations error:', err);
        regsLoaded = true;
        checkAllLoaded();
      }));

      // 3. Live Locations
      const qLocs = query(collection(activeDb, 'live_locations'), limit(500));
      unsubs.push(onSnapshot(qLocs, (snap) => {
        if (!isMounted) return;
        const map = new Map<string, any>();
        snap.forEach(doc => {
          const data = doc.data();
          if (data.employeeCode) {
            map.set(data.employeeCode.trim().toLowerCase(), data);
          }
        });
        setLiveLocationByEmployee(map);
        locsLoaded = true;
        checkAllLoaded();
      }, (err) => {
        console.warn('AdminAttendanceTab live locations error:', err);
        locsLoaded = true;
        checkAllLoaded();
      }));
    }).catch(err => {
      console.warn('AdminAttendanceTab db load error:', err);
      if (isMounted) setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  const toggleDateCollapse = (date: string) => {
    setCollapsedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const activeEmpCodes = useMemo(() => {
    return new Set(registrations.map(r => r.employeeCode || r.id));
  }, [registrations]);

  const filteredAttendance = useMemo(() => {
    return attendanceRecords.filter((rec) => {
      const searchLower = attendanceSearch.toLowerCase();
      const empName = (rec.employeeName || '').toLowerCase();
      const empId = (rec.employeeId || rec.employeeCode || '').toLowerCase();
      const matchesSearch = empName.includes(searchLower) || empId.includes(searchLower);
      if (!matchesSearch) return false;

      if (attendanceFilter === 'MISSING_CHECKOUT') {
        return isAttendanceCheckoutUnresolved(rec) || rec.checkoutStatus === 'PENDING_ADMIN_REVIEW';
      }
      if (attendanceFilter === 'LATE') {
        // Late calculation (assume 10:31 AM or later is late)
        const checkIn = rec.checkInTime || '';
        if (!checkIn || checkIn === '--:--') return false;
        const [time, period] = checkIn.split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        const totalMinutes = (period === 'PM' && hours !== 12 ? hours + 12 : (period === 'AM' && hours === 12 ? 0 : hours)) * 60 + minutes;
        return totalMinutes > 630; // 10:30 AM
      }
      return true;
    });
  }, [attendanceRecords, attendanceSearch, attendanceFilter]);

  const groupedAttendanceByDate = useMemo(() => {
    const groups: { [date: string]: { dateStr: string; formattedDateLabel: string; isToday: boolean; records: AttendanceRecord[]; summary: any } } = {};
    
    filteredAttendance.forEach((rec) => {
      const date = rec.date;
      if (!groups[date]) {
        groups[date] = {
          dateStr: date,
          formattedDateLabel: new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
          isToday: date === todayStr,
          records: [],
          summary: { total: 0, present: 0, wfh: 0, clientVisit: 0, outdoor: 0 }
        };
      }
      groups[date].records.push(rec);
      groups[date].summary.total++;
      if (rec.attendanceType === 'OFFICE') groups[date].summary.present++;
      else if (rec.attendanceType === 'WFH') groups[date].summary.wfh++;
      else if (rec.attendanceType === 'CLIENT_VISIT') groups[date].summary.clientVisit++;
      else if (rec.attendanceType === 'OUTDOOR') groups[date].summary.outdoor++;
    });

    return Object.values(groups).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [filteredAttendance, todayStr]);

  const safeStringify = (val: any) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const getCheckInLocationDetails = (rec: AttendanceRecord) => {
    return {
      time: rec.checkInTime || '--:--',
      location: rec.checkInTownCity || 'Unknown Location',
      meters: rec.checkInDistance,
      metersFormatted: rec.checkInDistance !== undefined ? `${Math.round(rec.checkInDistance)}m` : null
    };
  };

  const getCheckoutLocationDetails = (rec: AttendanceRecord) => {
    const isUnresolved = isAttendanceCheckoutUnresolved(rec);
    return {
      isUnresolved,
      time: rec.checkOutTime || '--:--',
      location: isUnresolved ? 'In-Office (Pending Exit)' : (rec.checkoutTownCity || 'Unknown Location'),
      meters: rec.checkoutDistance,
      metersFormatted: rec.checkoutDistance !== undefined ? `${Math.round(rec.checkoutDistance)}m` : null
    };
  };

  const getCurrentLocationDetails = (rec: AttendanceRecord, liveLoc: any) => {
    if (!liveLoc) return { status: 'OFFLINE', location: 'No signal', distance: null };
    
    const lastUpdate = new Date(liveLoc.timestamp || liveLoc.updatedAt || 0).getTime();
    const now = Date.now();
    const diffMins = Math.floor((now - lastUpdate) / 60000);
    
    let status: 'LIVE' | 'RECENT' | 'STALE' | 'OFFLINE' = 'OFFLINE';
    if (diffMins < 5) status = 'LIVE';
    else if (diffMins < 30) status = 'RECENT';
    else if (diffMins < 1440) status = 'STALE';

    return {
      status,
      location: liveLoc.townCity || 'Unknown',
      distance: liveLoc.distanceFromOffice !== undefined ? `${Math.round(liveLoc.distanceFromOffice)}m` : null,
      statusText: diffMins < 1 ? 'Just now' : `${diffMins}m ago`,
      latitude: liveLoc.latitude,
      longitude: liveLoc.longitude
    };
  };

  const getEffectiveCheckoutStatus = (rec: AttendanceRecord) => {
    return rec.checkoutStatus || rec.status || 'COMPLETED';
  };

  const handleApplyRectification = async () => {
    if (!selectedForRectify || !rectifyReason.trim()) return;

    setIsCorrecting(true);
    setCorrectionStep('verifying');
    setCorrectionMessage('Verifying authoritative record state...');

    try {
      const activeDb = await getAdminDb();
      if (!activeDb) throw new Error('Admin database connection unavailable.');
      const docSnap = await getDocs(query(collection(activeDb, 'attendance'), where('id', '==', selectedForRectify.id)));
      
      if (docSnap.empty) {
        throw new Error('Record not found in database.');
      }

      const targetDoc = docSnap.docs[0];
      const targetData = targetDoc.data() as AttendanceRecord;

      setCorrectionStep('applying');
      setCorrectionMessage('Applying forensic rectification to Firestore...');

      const correction: AttendanceCorrection = {
        id: `ADMIN_CORR_${Date.now()}`,
        correctedAt: new Date().toISOString(),
        correctedBy: role,
        correctedByRole: role,
        originalCheckIn: targetData.checkInTime || '',
        originalCheckOut: targetData.checkOutTime || '',
        correctedCheckIn: rectifyCheckIn,
        correctedCheckOut: rectifyCheckOut || null,
        reason: rectifyReason
      };

      const updateData: any = {
        checkInTime: rectifyCheckIn,
        checkOutTime: rectifyCheckOut || '--:--',
        manualRectified: true,
        isAdminRectified: true,
        correctedAt: new Date().toISOString(),
        correctionHistory: arrayUnion(correction),
        syncStatus: 'Synced',
        serverSyncTime: new Date().toISOString(),
        checkoutStatus: rectifyCheckOut ? 'COMPLETED' : 'UNRESOLVED',
        status: rectifyCheckOut ? 'COMPLETED' : 'UNRESOLVED'
      };

      await updateDoc(targetDoc.ref, updateData);

      setCorrectionStep('completed');
      setCorrectionMessage('Forensic rectification applied successfully.');
      setCorrectionResult({ ...targetData, ...updateData });

    } catch (error: any) {
      console.error('Rectification error:', error);
      setRectifyError(error.message || 'Failed to apply rectification.');
      setCorrectionStep('idle');
      setIsCorrecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-blue-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Syncing Attendance Ledger...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" /> Operational Attendance Records
          </h3>
          <div className="text-[10px] text-purple-300/60 italic">Click any record to view complete forensic details</div>
        </div>

        {/* Attendance Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-[#1A0B36]/50 border border-purple-500/10 rounded-xl">
          <div>
            <label className="block text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-1.5">Search Employee Name / Code</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-purple-400/50" />
              <input
                type="text"
                value={attendanceSearch}
                onChange={(e) => setAttendanceSearch(e.target.value)}
                placeholder="Search name or ID..."
                className="w-full bg-[#13072D] border border-purple-500/20 text-white rounded-lg text-xs pl-8 pr-3 py-2 focus:outline-none focus:border-purple-500/60 transition-all shadow-inner"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-1.5">Attention Quick Filter</label>
            <select
              value={attendanceFilter}
              onChange={(e) => setAttendanceFilter(e.target.value as any)}
              className="w-full bg-[#13072D] border border-purple-500/20 text-white rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-purple-500/60 appearance-none cursor-pointer"
            >
              <option value="ALL">Show All Logs</option>
              <option value="MISSING_CHECKOUT">Missing Checkouts Only</option>
              <option value="LATE">Late Arrivals Only</option>
            </select>
          </div>

          <div className="flex items-end justify-start sm:justify-end">
            <Button
              onClick={() => {
                setAttendanceFilter('ALL');
                setAttendanceSearch('');
              }}
              variant="secondary"
              className="text-xs py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 shadow-md"
            >
              Clear Filters
            </Button>
          </div>
        </div>
        
        {groupedAttendanceByDate.length === 0 ? (
          <div className="p-12 text-center text-purple-300/60 bg-[#1A0B36]/30 border border-purple-500/10 rounded-xl">
             <div className="flex flex-col items-center gap-2">
                <Calendar className="w-10 h-10 text-purple-500/30" />
                <p className="text-sm font-bold uppercase tracking-widest text-purple-300/40">No records found matching filters</p>
             </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedAttendanceByDate.map((group) => {
              const isCollapsed = !!collapsedDates[group.dateStr];
              return (
                <div key={group.dateStr} className="bg-[#1A0B36]/50 border border-purple-500/20 rounded-xl overflow-hidden shadow-lg transition-all hover:border-purple-500/40 group">
                  {/* Date Header */}
                  <div
                    onClick={() => toggleDateCollapse(group.dateStr)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gradient-to-r from-[#200D42] to-[#13072D] border-b border-purple-500/20 cursor-pointer hover:bg-purple-900/20 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${group.isToday ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 animate-pulse' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'}`}>
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-white tracking-wide uppercase">
                            {group.isToday ? `TODAY — ${group.formattedDateLabel}` : group.formattedDateLabel}
                          </h4>
                          {group.isToday && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider">
                              Live Today
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-purple-300/70 font-mono mt-0.5">
                          {group.summary.total} {group.summary.total === 1 ? 'record' : 'records'} logged
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-2">
                      <span className="px-2 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-bold rounded-md">
                        Office: {group.summary.present}
                      </span>
                      <span className="px-2 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-bold rounded-md">
                        WFH: {group.summary.wfh}
                      </span>
                      <span className="px-2 py-1 bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-bold rounded-md">
                        Client: {group.summary.clientVisit}
                      </span>
                      <span className="px-2 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-bold rounded-md">
                        Outdoor: {group.summary.outdoor}
                      </span>
                      <div className="text-purple-300/60 ml-2 group-hover:text-white transition-colors">
                        {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {/* Table for this date */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500/20 scrollbar-track-transparent">
                      <table className="w-full text-left text-xs border-separate border-spacing-0">
                        <thead>
                          <tr className="bg-[#1A0B36]/80 text-purple-300 uppercase font-bold sticky top-0 z-10 text-[11px]">
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Employee</th>
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Code</th>
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Date</th>
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Mode</th>
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-emerald-400">Check In</th>
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-emerald-300">Location (In)</th>
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-rose-400">Check Out</th>
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-rose-300">Location (Out)</th>
                            {isSuperAdmin() && (
                              <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-cyan-300">Live Status</th>
                            )}
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Duration</th>
                            <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-500/10">
                          {group.records.map((rec) => {
                            const checkInLoc = getCheckInLocationDetails(rec);
                            const checkoutLoc = getCheckoutLocationDetails(rec);
                            const empCode = (rec.employeeId || rec.employeeCode || '').trim();
                            const empLiveLoc = liveLocationByEmployee.get(empCode.toLowerCase());
                            const currentLoc = getCurrentLocationDetails(rec, empLiveLoc);

                            return (
                              <tr
                                key={rec.id || Math.random().toString()}
                                className="hover:bg-white/[0.05] cursor-pointer transition-colors group/row"
                                onClick={() => {
                                  setSelectedAttendance(rec);
                                  setShowAttendanceDetails(true);
                                }}
                              >
                                <td className="p-3 border-b border-purple-500/10">
                                  <div className="font-bold text-white group-hover/row:text-blue-400 transition-colors flex items-center gap-1.5">
                                    {safeStringify(rec.employeeName) || '—'}
                                    {!activeEmpCodes.has(rec.employeeId || rec.employeeCode) && (
                                      <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black uppercase rounded">Deleted</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 border-b border-purple-500/10 font-mono text-purple-300">
                                  {safeStringify(rec.employeeId || rec.employeeCode) || '—'}
                                </td>
                                <td className="p-3 border-b border-purple-500/10 text-white whitespace-nowrap">
                                  {safeStringify(rec.date)}
                                </td>
                                <td className="p-3 border-b border-purple-500/10">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                    rec.attendanceType === 'OFFICE' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                                    rec.attendanceType === 'WFH' ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' :
                                    rec.attendanceType === 'CLIENT_VISIT' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' :
                                    'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  }`}>
                                    {rec.attendanceType?.toLowerCase()}
                                  </span>
                                </td>
                                <td className="p-3 border-b border-purple-500/10 text-emerald-400 font-bold">
                                  {checkInLoc.time} <span className="text-[10px] text-purple-300/40">({rec.checkInMode})</span>
                                </td>
                                <td className="p-3 border-b border-purple-500/10 text-purple-200 truncate max-w-[150px]" title={checkInLoc.location}>
                                  {checkInLoc.location}
                                </td>
                                <td className="p-3 border-b border-purple-500/10">
                                  {checkoutLoc.isUnresolved ? (
                                    <span className="text-rose-400 font-black text-[10px] uppercase">Unresolved</span>
                                  ) : getEffectiveCheckoutStatus(rec) === 'PENDING_ADMIN_REVIEW' ? (
                                    <span className="text-amber-400 font-black text-[10px] uppercase">Pending</span>
                                  ) : (
                                    <span className="text-purple-200 font-mono">{checkoutLoc.time}</span>
                                  )}
                                </td>
                                <td className="p-3 border-b border-purple-500/10 text-purple-200 truncate max-w-[150px]" title={checkoutLoc.location}>
                                  {checkoutLoc.location}
                                </td>
                                {isSuperAdmin() && (
                                  <td className="p-3 border-b border-purple-500/10">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                        currentLoc.status === 'LIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                        currentLoc.status === 'RECENT' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                        'bg-purple-500/20 text-purple-300 border border-purple-500/20'
                                      }`}>
                                        {currentLoc.status}
                                      </span>
                                    </div>
                                  </td>
                                )}
                                <td className="p-3 border-b border-purple-500/10 font-bold text-white">
                                  {getRecordWorkingHoursDisplay(rec).display}
                                </td>
                                <td className="p-3 border-b border-purple-500/10" onClick={e => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setSelectedForRectify(rec);
                                      setRectifyCheckIn(rec.checkInTime || '');
                                      setRectifyCheckOut(rec.checkOutTime === '--:--' ? '' : (rec.checkOutTime || ''));
                                      setRectifyReason('');
                                      setRectifyError('');
                                      setShowRectifyModal(true);
                                    }}
                                    className="h-7 text-[10px] bg-purple-500/20 hover:bg-purple-500/40 text-purple-200 font-black uppercase px-2"
                                  >
                                    Rectify
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Audit Modal */}
      <Dialog
        isOpen={showAttendanceDetails && !!selectedAttendance}
        onClose={() => setShowAttendanceDetails(false)}
        title="Attendance Forensic Audit"
      >
        {selectedAttendance && (
          <div className="space-y-6 text-white max-h-[80vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-500/30">
            <div className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/30 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-black text-white uppercase tracking-tight">{selectedAttendance.employeeName}</h4>
                <p className="text-xs text-purple-300 font-mono">{selectedAttendance.employeeId || selectedAttendance.employeeCode}</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-purple-300/60 uppercase font-bold">Shift Date</div>
                <div className="text-sm font-black text-white">{selectedAttendance.date}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-purple-300 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Timeline Metrics
                </h5>
                <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex justify-between">
                  <span className="text-[11px] text-emerald-300 font-bold uppercase">Check-In</span>
                  <div className="text-right">
                    <div className="text-sm font-black text-white">{selectedAttendance.checkInTime}</div>
                    <div className="text-[9px] text-emerald-300/60 uppercase">{selectedAttendance.checkInMode} Mode</div>
                  </div>
                </div>
                <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-xl flex justify-between">
                  <span className="text-[11px] text-rose-300 font-bold uppercase">Check-Out</span>
                  <div className="text-right">
                    <div className="text-sm font-black text-white">{selectedAttendance.checkOutTime || '--:--'}</div>
                    <div className="text-[9px] text-rose-300/60 uppercase">{selectedAttendance.checkOutMode || 'N/A'} Mode</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-blue-300 uppercase tracking-widest flex items-center gap-2">
                  <MapPin className="w-3 h-3" /> Spatial Audit
                </h5>
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-1">
                  <div className="text-[10px] text-blue-300 font-bold uppercase">In-Location</div>
                  <div className="text-xs text-white">{selectedAttendance.checkInTownCity || 'Unknown'}</div>
                  {selectedAttendance.checkInDistance !== undefined && (
                    <div className="text-[9px] text-blue-300/50 font-mono">Distance: {Math.round(selectedAttendance.checkInDistance)}m from office</div>
                  )}
                </div>
                <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-1">
                  <div className="text-[10px] text-purple-300 font-bold uppercase">Out-Location</div>
                  <div className="text-xs text-white">{selectedAttendance.checkoutTownCity || 'Unknown'}</div>
                  {selectedAttendance.checkoutDistance !== undefined && (
                    <div className="text-[9px] text-purple-300/50 font-mono">Distance: {Math.round(selectedAttendance.checkoutDistance)}m from office</div>
                  )}
                </div>
              </div>
            </div>

            {selectedAttendance.correctionHistory && selectedAttendance.correctionHistory.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-purple-500/20">
                <h5 className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Correction History ({selectedAttendance.correctionHistory.length})</h5>
                <div className="space-y-2">
                  {selectedAttendance.correctionHistory.map((corr, idx) => (
                    <div key={idx} className="p-3 bg-purple-900/30 rounded-xl border border-purple-500/20 text-[11px] space-y-1">
                      <div className="flex justify-between text-purple-300 font-bold">
                        <span>{corr.correctedBy} ({corr.correctedByRole})</span>
                        <span>{corr.correctedAt}</span>
                      </div>
                      <div className="text-white">
                        Check-In: {corr.originalCheckIn} → <span className="text-emerald-400 font-black">{corr.correctedCheckIn}</span>
                      </div>
                      <div className="text-white">
                        Check-Out: {corr.originalCheckOut || 'None'} → <span className="text-emerald-400 font-black">{corr.correctedCheckOut || 'Unresolved'}</span>
                      </div>
                      <div className="text-amber-300 italic mt-1">Reason: &quot;{corr.reason}&quot;</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-purple-500/20">
              <Button onClick={() => setShowAttendanceDetails(false)} className="bg-purple-600 hover:bg-purple-500 text-white font-black uppercase text-xs">
                Close Audit View
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Rectify Modal */}
      <Dialog
        isOpen={showRectifyModal && !!selectedForRectify}
        onClose={() => !isCorrecting && setShowRectifyModal(false)}
        title="Rectify Attendance Record"
      >
        {selectedForRectify && (
          <div className="space-y-4 text-white">
             {rectifyError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{rectifyError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-purple-300 uppercase tracking-tighter">Correct Check-In</label>
                <input
                  type="text"
                  value={rectifyCheckIn}
                  onChange={(e) => setRectifyCheckIn(e.target.value)}
                  placeholder="e.g. 10:30 AM"
                  className="w-full px-3 py-2 bg-[#1B0D38] border border-purple-500/30 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-purple-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-purple-300 uppercase tracking-tighter">Correct Check-Out</label>
                <input
                  type="text"
                  value={rectifyCheckOut}
                  onChange={(e) => setRectifyCheckOut(e.target.value)}
                  placeholder="e.g. 06:00 PM (or empty)"
                  className="w-full px-3 py-2 bg-[#1B0D38] border border-purple-500/30 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-purple-300 uppercase tracking-tighter">Rectification Reason *</label>
              <textarea
                value={rectifyReason}
                onChange={(e) => setRectifyReason(e.target.value)}
                placeholder="Briefly explain this correction for the audit log..."
                rows={3}
                className="w-full px-3 py-2 bg-[#1B0D38] border border-purple-500/30 rounded-xl text-white text-xs focus:outline-none focus:border-purple-400 resize-none shadow-inner"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-purple-500/20">
              <Button variant="outline" onClick={() => setShowRectifyModal(false)} className="text-xs text-purple-300 border-purple-500/20">Cancel</Button>
              <Button
                onClick={handleApplyRectification}
                isLoading={isCorrecting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase px-6"
              >
                Apply Correction
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
