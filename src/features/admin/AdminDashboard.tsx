import React, { useEffect, useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { db } from '../../services/firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { LogOut, Search, CheckCircle, XCircle, Clock, Smartphone, User, Phone, Calendar, Wifi, WifiOff, Shield, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useNavigate } from 'react-router-dom';
import { AttendanceRecord } from '../../types/attendance';
import { getStoredAttendanceRecords } from '../../services/attendance/attendanceStorage';

type Registration = {
  id: string;
  employeeCode: string;
  name: string;
  mobileNumber: string;
  deviceId: string;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
  selfieUrl: string;
  registrationDate: string;
  status: string;
  rejectionReason?: string;
  office: string;
};

export const AdminDashboard: React.FC = () => {
  const { logout } = useAdminAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'registrations' | 'attendance'>('attendance');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  useEffect(() => {
    if (!db) return;

    // Listen to registrations
    const qRegs = query(collection(db, 'registrations'), orderBy('registrationDate', 'desc'));
    const unsubRegs = onSnapshot(qRegs, (snapshot) => {
      const regs: Registration[] = [];
      snapshot.forEach((doc) => {
        regs.push({ id: doc.id, ...doc.data() } as Registration);
      });
      setRegistrations(regs);
    }, (err) => {
      console.warn('Error fetching registrations:', err);
    });

    // Listen to synced attendance records from Firestore
    const qAttendance = query(collection(db, 'attendance'), orderBy('createdAtDeviceTime', 'desc'));
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const firestoreAtt: AttendanceRecord[] = [];
      snapshot.forEach((doc) => {
        firestoreAtt.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
      });

      // Merge local un-synced records with firestore records
      const localRecords = getStoredAttendanceRecords();
      const mergedMap = new Map<string, AttendanceRecord>();

      firestoreAtt.forEach((rec) => mergedMap.set(rec.id, rec));
      localRecords.forEach((rec) => {
        if (!mergedMap.has(rec.id)) {
          mergedMap.set(rec.id, rec);
        }
      });

      const combined = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime()
      );
      setAttendanceRecords(combined);
    }, (err) => {
      console.warn('Error fetching attendance from firestore, loading local fallback:', err);
      setAttendanceRecords(getStoredAttendanceRecords());
    });

    return () => {
      unsubRegs();
      unsubAttendance();
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const handleApprove = async (id: string) => {
    if (!db) return;
    await updateDoc(doc(db, 'registrations', id), {
      status: 'Approved',
      rejectionReason: null
    });
    setSelectedReg(null);
  };

  const handleReject = async (id: string) => {
    if (!db) return;
    await updateDoc(doc(db, 'registrations', id), {
      status: 'Rejected',
      rejectionReason: rejectionReason || 'Rejected by administrator'
    });
    setShowRejectDialog(false);
    setSelectedReg(null);
    setRejectionReason('');
  };

  const filteredRegs = registrations.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.mobileNumber.includes(searchTerm)
  );

  const filteredAttendance = attendanceRecords.filter(a => {
    const term = searchTerm.toLowerCase();
    return (
      a.employeeName.toLowerCase().includes(term) ||
      a.employeeId.toLowerCase().includes(term) ||
      a.date.includes(term) ||
      a.townCity.toLowerCase().includes(term) ||
      (a.attendanceType || 'OFFICE').toLowerCase().includes(term) ||
      (a.clientName && a.clientName.toLowerCase().includes(term)) ||
      (a.outdoorType && a.outdoorType.toLowerCase().includes(term))
    );
  });

  const pendingRegCount = registrations.filter(r => r.status === 'Pending Approval').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] text-white pb-12">
      {/* Top Header */}
      <header className="bg-[#2D1B5A] border-b border-purple-500/20 sticky top-0 z-20 px-4 md:px-8 h-18 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-[#7C3AED] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(124,58,237,0.5)]">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white leading-none">Exfin OMS Admin</h1>
              <span className="text-[10px] text-purple-300 font-bold">Enterprise Console v6.0</span>
            </div>
          </div>

          <div className="flex bg-[#211044] p-1 rounded-2xl border border-purple-500/20 text-xs font-bold">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-4 py-2 rounded-xl transition-all ${
                activeTab === 'attendance'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-900/50'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              Smart Attendance ({attendanceRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('registrations')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'registrations'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-900/50'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              Device Registrations
              {pendingRegCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                  {pendingRegCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <Button variant="outlined" onClick={handleLogout} className="border-purple-400/30 text-purple-200 text-xs">
          <LogOut className="w-4 h-4 mr-1.5" /> Logout
        </Button>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        
        {/* Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-purple-300/70" />
            <input
              type="text"
              placeholder={activeTab === 'attendance' ? "Search employee, date or mode..." : "Search name, code or mobile..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-purple-500/30 bg-[#2D1B5A] text-white focus:ring-2 focus:ring-[#7C3AED] focus:outline-none text-xs font-medium placeholder:text-purple-300/50 shadow-md"
            />
          </div>
        </div>

        {/* ATTENDANCE PANEL VIEW */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            <div className="overflow-x-auto bg-[#2D1B5A] rounded-[22px] shadow-2xl border border-purple-500/20">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#211044] text-purple-300 uppercase text-[10px] font-extrabold tracking-wider border-b border-purple-500/20">
                  <tr>
                    <th className="p-4">Employee</th>
                    <th className="p-4">Attendance Mode</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Check-In</th>
                    <th className="p-4">Mode</th>
                    <th className="p-4">Check-Out</th>
                    <th className="p-4">Mode</th>
                    <th className="p-4">Working Hours</th>
                    <th className="p-4">Exit / Return</th>
                    <th className="p-4">Network</th>
                    <th className="p-4">Sync Status</th>
                    <th className="p-4">Device Time</th>
                    <th className="p-4">Server Sync Time</th>
                    <th className="p-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10 text-white font-medium">
                  {filteredAttendance.map((rec) => (
                    <tr 
                      key={rec.id} 
                      onClick={() => setSelectedAttendance(rec)}
                      className="hover:bg-[#35206A]/60 cursor-pointer transition-colors"
                    >
                      <td className="p-4 whitespace-nowrap">
                        <div className="font-bold text-sm text-white">{rec.employeeName}</div>
                        <div className="text-[10px] text-purple-300/70">{rec.employeeId}</div>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1.5 w-fit border ${
                          (rec.attendanceType || 'OFFICE') === 'WFH'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : (rec.attendanceType || 'OFFICE') === 'CLIENT_VISIT'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : (rec.attendanceType || 'OFFICE') === 'OUTDOOR'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : 'bg-purple-500/20 text-purple-200 border-purple-500/30'
                        }`}>
                          {(rec.attendanceType || 'OFFICE') === 'WFH' ? '🏠 WFH' : (rec.attendanceType || 'OFFICE') === 'CLIENT_VISIT' ? '🤝 Client Visit' : (rec.attendanceType || 'OFFICE') === 'OUTDOOR' ? '🚗 Outdoor Work' : '🏢 Office'}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-purple-200">{rec.date}</td>
                      <td className="p-4 whitespace-nowrap font-bold text-emerald-400">{rec.checkInTime}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/50 text-purple-200 border border-purple-500/30">
                          {rec.checkInMode}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-bold text-purple-100">
                        {rec.checkOutTime || '--:--'}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          rec.checkOutMode === 'AUTO_SYSTEM' 
                            ? 'bg-red-500/20 text-red-300 border-red-500/30' 
                            : rec.checkOutMode === 'MANUAL'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-purple-900/40 text-purple-300 border-purple-500/20'
                        }`}>
                          {rec.checkOutMode || '--'}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-bold text-white">
                        {rec.workingHours || '--'}
                      </td>
                      <td className="p-4 whitespace-nowrap text-[11px] text-amber-300">
                        {rec.exitTime ? `Exit: ${rec.exitTime} | Ret: ${rec.returnTime || '--'}` : 'None'}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`flex items-center gap-1 font-semibold text-[11px] ${rec.isOffline ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {rec.isOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                          {rec.isOffline ? 'Offline' : 'Online'}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          rec.syncStatus === 'Synced' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {rec.syncStatus}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-[10px] font-mono text-purple-300/80">
                        {new Date(rec.createdAtDeviceTime).toLocaleString()}
                      </td>
                      <td className="p-4 whitespace-nowrap text-[10px] font-mono text-purple-300/80">
                        {rec.serverSyncTime ? new Date(rec.serverSyncTime).toLocaleString() : 'Pending'}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {rec.reason ? (
                          <span className="text-red-300 bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded font-bold text-[10px]">
                            {rec.reason}
                          </span>
                        ) : (
                          <span className="text-purple-300/50">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredAttendance.length === 0 && (
                <div className="py-12">
                  <EmptyState 
                    icon={Calendar} 
                    title="No attendance records found" 
                    description="Attendance events logged by employees will appear here." 
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* REGISTRATIONS PANEL VIEW */}
        {activeTab === 'registrations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRegs.map((reg) => (
              <Card key={reg.id} className="p-5 flex flex-col cursor-pointer bg-[#2D1B5A] border border-purple-500/20 hover:border-purple-500/50 transition-all hover:scale-[1.01]" onClick={() => setSelectedReg(reg)}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#211044] border border-purple-500/30">
                      {reg.selfieUrl ? (
                        <img src={reg.selfieUrl} alt={reg.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 m-3 text-purple-300" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm line-clamp-1">{reg.name}</h3>
                      <p className="text-xs text-purple-300/70 font-mono">{reg.employeeCode}</p>
                    </div>
                  </div>
                  <StatusBadge status={reg.status} />
                </div>
                
                <div className="space-y-2 mt-auto pt-4 border-t border-purple-500/15 text-xs text-purple-200">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#A78BFA]" /> {reg.mobileNumber}
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-[#A78BFA]" /> {reg.deviceModel}
                  </div>
                </div>
              </Card>
            ))}
            
            {filteredRegs.length === 0 && (
              <div className="col-span-full py-12">
                <EmptyState 
                  icon={Search} 
                  title="No registrations found" 
                  description="Try adjusting your search criteria" 
                />
              </div>
            )}
          </div>
        )}

      </main>

      {/* Attendance Detail Dialog */}
      <Dialog isOpen={!!selectedAttendance} onClose={() => setSelectedAttendance(null)} title="Attendance Audit Log">
        {selectedAttendance && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#211044] rounded-2xl border border-purple-500/30 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-white">{selectedAttendance.employeeName}</h3>
                <p className="text-[10px] text-purple-300/70 font-mono">ID: {selectedAttendance.employeeId} | UUID: {selectedAttendance.id}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                selectedAttendance.syncStatus === 'Synced' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {selectedAttendance.syncStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-[#211044]/60 rounded-2xl border border-purple-500/20">
              <div className="col-span-2 p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20">
                <p className="text-[10px] text-purple-300/70 font-bold uppercase mb-0.5">Mode</p>
                <p className="font-black text-sm text-white flex items-center gap-1.5">
                  {(selectedAttendance.attendanceType || 'OFFICE') === 'WFH' ? '🏠 Work From Home (WFH)' : (selectedAttendance.attendanceType || 'OFFICE') === 'CLIENT_VISIT' ? '🤝 Client Visit' : (selectedAttendance.attendanceType || 'OFFICE') === 'OUTDOOR' ? '🚗 Outdoor Work' : '🏢 Office Attendance'}
                </p>
                {selectedAttendance.wfhReason && (
                  <div className="mt-2 pt-2 border-t border-purple-500/20 space-y-1 text-xs">
                    <p><span className="font-bold text-emerald-300">Reason:</span> {selectedAttendance.wfhReason}</p>
                    <p><span className="font-bold text-emerald-300">Work Plan:</span> {selectedAttendance.workPlan}</p>
                  </div>
                )}
                {selectedAttendance.clientName && (
                  <div className="mt-2 pt-2 border-t border-purple-500/20 space-y-1 text-xs">
                    <p><span className="font-bold text-amber-300">Client:</span> {selectedAttendance.clientName}</p>
                    <p><span className="font-bold text-amber-300">Location:</span> {selectedAttendance.clientLocation}</p>
                    <p><span className="font-bold text-amber-300">Purpose:</span> {selectedAttendance.purpose}</p>
                  </div>
                )}
                {selectedAttendance.outdoorType && (
                  <div className="mt-2 pt-2 border-t border-purple-500/20 space-y-1 text-xs">
                    <p><span className="font-bold text-blue-300">Outdoor Type:</span> {selectedAttendance.outdoorType}</p>
                    <p><span className="font-bold text-blue-300">Description:</span> {selectedAttendance.description}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Date</p>
                <p className="font-bold text-white">{selectedAttendance.date}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Working Hours</p>
                <p className="font-bold text-white">{selectedAttendance.workingHours || '--'}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Check-In</p>
                <p className="font-bold text-emerald-400">{selectedAttendance.checkInTime} ({selectedAttendance.checkInMode})</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Check-Out</p>
                <p className="font-bold text-purple-200">{selectedAttendance.checkOutTime || '--:--'} ({selectedAttendance.checkOutMode})</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Office Distance</p>
                <p className="font-bold text-white">{selectedAttendance.distance.toFixed(1)}m</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Location</p>
                <p className="font-bold text-white">{selectedAttendance.townCity}</p>
              </div>
            </div>

            <Button onClick={() => setSelectedAttendance(null)} className="w-full">Close Audit Log</Button>
          </div>
        )}
      </Dialog>

      {/* Registration Details Dialog */}
      <Dialog isOpen={!!selectedReg} onClose={() => setSelectedReg(null)} title="Device Registration Audit">
        {selectedReg && (
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="w-28 h-28 rounded-2xl overflow-hidden shadow-xl border border-purple-500/30 bg-[#211044]">
                {selectedReg.selfieUrl ? (
                  <img src={selectedReg.selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 m-auto mt-9 text-purple-300" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#211044] p-4 rounded-2xl border border-purple-500/20">
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Code</p>
                <p className="font-bold text-white">{selectedReg.employeeCode}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Status</p>
                <StatusBadge status={selectedReg.status} />
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Name</p>
                <p className="font-bold text-white">{selectedReg.name}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Mobile</p>
                <p className="font-bold text-white">{selectedReg.mobileNumber}</p>
              </div>
              <div className="col-span-2 pt-2 border-t border-purple-500/20">
                <p className="text-[10px] text-purple-300/70 mb-0.5">Device</p>
                <p className="font-bold text-white">{selectedReg.deviceModel} ({selectedReg.androidVersion})</p>
              </div>
            </div>

            {selectedReg.status === 'Pending Approval' && (
              <div className="flex gap-3 pt-2">
                <Button variant="outlined" className="flex-1 border-red-500/40 text-red-300 hover:bg-red-500/20" onClick={() => setShowRejectDialog(true)}>
                  Reject
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(selectedReg.id)}>
                  Approve
                </Button>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog isOpen={showRejectDialog} onClose={() => setShowRejectDialog(false)} title="Reject Device Registration">
        <div className="space-y-4">
          <p className="text-xs text-purple-200">State reason for rejecting device registration:</p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="w-full p-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white min-h-[90px] text-xs focus:ring-2 focus:ring-[#7C3AED] focus:outline-none"
            placeholder="e.g., Unclear selfie, unrecognized employee..."
          />
          <div className="flex gap-3 pt-2">
            <Button variant="text" onClick={() => setShowRejectDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              className="flex-1 bg-red-600 text-white hover:bg-red-700" 
              onClick={() => selectedReg && handleReject(selectedReg.id)}
              disabled={!rejectionReason.trim()}
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      </Dialog>

    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'Approved') {
    return (
      <span className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
        <CheckCircle className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (status === 'Rejected') {
    return (
      <span className="flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
        <XCircle className="w-3 h-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
};
