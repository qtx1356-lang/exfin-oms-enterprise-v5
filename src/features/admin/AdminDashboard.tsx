import React, { useEffect, useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { db } from '../../services/firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { LogOut, Search, CheckCircle, XCircle, Clock, Smartphone, User, Phone, Calendar, Wifi, WifiOff } from 'lucide-react';
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

  const filteredAttendance = attendanceRecords.filter(a =>
    a.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.date.includes(searchTerm) ||
    a.townCity.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingRegCount = registrations.filter(r => r.status === 'Pending Approval').length;

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Top App Bar */}
      <header className="bg-surface shadow-sm sticky top-0 z-20 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-on-surface">Exfin Admin Panel</h1>
          <div className="flex bg-surface-variant p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'attendance'
                  ? 'bg-primary text-on-primary shadow'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Smart Attendance ({attendanceRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('registrations')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'registrations'
                  ? 'bg-primary text-on-primary shadow'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Registrations
              {pendingRegCount > 0 && (
                <span className="bg-error text-on-error text-[10px] px-1.5 py-0.2 rounded-full">
                  {pendingRegCount}
                </span>
              )}
            </button>
          </div>
        </div>
        <Button variant="text" onClick={handleLogout} className="text-on-surface-variant">
          <LogOut className="w-5 h-5 mr-2" /> Logout
        </Button>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        
        {/* Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              placeholder={activeTab === 'attendance' ? "Search by employee, date or city..." : "Search by name, code or mobile..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-outline/30 bg-surface focus:ring-2 focus:ring-primary focus:border-transparent text-on-surface text-sm"
            />
          </div>
        </div>

        {/* ATTENDANCE PANEL VIEW */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            <div className="overflow-x-auto bg-surface rounded-2xl shadow-sm border border-outline/20">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-variant/50 text-on-surface-variant uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="p-3.5">Employee</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Check-In Time</th>
                    <th className="p-3.5">Check-In Mode</th>
                    <th className="p-3.5">Check-Out Time</th>
                    <th className="p-3.5">Check-Out Mode</th>
                    <th className="p-3.5">Working Hours</th>
                    <th className="p-3.5">Exit / Return Log</th>
                    <th className="p-3.5">Offline / Online</th>
                    <th className="p-3.5">Sync Status</th>
                    <th className="p-3.5">Original Event Time</th>
                    <th className="p-3.5">Server Sync Time</th>
                    <th className="p-3.5">Auto Checkout Reason</th>
                    <th className="p-3.5">Reminders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline/10 text-on-surface font-medium">
                  {filteredAttendance.map((rec) => (
                    <tr 
                      key={rec.id} 
                      onClick={() => setSelectedAttendance(rec)}
                      className="hover:bg-surface-variant/30 cursor-pointer transition-colors"
                    >
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-bold text-sm text-primary">{rec.employeeName}</div>
                        <div className="text-[10px] text-outline">{rec.employeeId}</div>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">{rec.date}</td>
                      <td className="p-3.5 whitespace-nowrap font-bold text-green-700">{rec.checkInTime}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rec.checkInMode === 'AUTO' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {rec.checkInMode}
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-bold text-slate-800">
                        {rec.checkOutTime || '--:--'}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rec.checkOutMode === 'AUTO_SYSTEM' 
                            ? 'bg-red-100 text-red-800' 
                            : rec.checkOutMode === 'MANUAL'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {rec.checkOutMode}
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-bold">
                        {rec.workingHours || '--'}
                      </td>
                      <td className="p-3.5 whitespace-nowrap text-[11px] text-amber-900">
                        {rec.exitTime ? `Exit: ${rec.exitTime} | Return: ${rec.returnTime || '--'}` : 'None'}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`flex items-center gap-1 font-semibold ${rec.isOffline ? 'text-amber-700' : 'text-green-700'}`}>
                          {rec.isOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                          {rec.isOffline ? 'Offline' : 'Online'}
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          rec.syncStatus === 'Synced' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {rec.syncStatus}
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap text-[11px] font-mono text-outline">
                        {new Date(rec.createdAtDeviceTime).toLocaleString()}
                      </td>
                      <td className="p-3.5 whitespace-nowrap text-[11px] font-mono text-outline">
                        {rec.serverSyncTime ? new Date(rec.serverSyncTime).toLocaleString() : 'N/A (Pending Sync)'}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {rec.reason ? (
                          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded font-semibold text-[10px]">
                            {rec.reason}
                          </span>
                        ) : (
                          <span className="text-outline">--</span>
                        )}
                      </td>
                      <td className="p-3.5 whitespace-nowrap text-center font-bold">
                        {rec.reminderCount}
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
              <Card key={reg.id} className="p-4 flex flex-col cursor-pointer hover:bg-surface-variant/50 transition-colors" onClick={() => setSelectedReg(reg)}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-variant border border-outline/20">
                      {reg.selfieUrl ? (
                        <img src={reg.selfieUrl} alt={reg.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 m-3 text-on-surface-variant" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-on-surface line-clamp-1">{reg.name}</h3>
                      <p className="text-xs text-outline">{reg.employeeCode}</p>
                    </div>
                  </div>
                  <StatusBadge status={reg.status} />
                </div>
                
                <div className="space-y-2 mt-auto pt-4 border-t border-outline/10 text-sm text-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" /> {reg.mobileNumber}
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4" /> {reg.deviceModel}
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
      <Dialog isOpen={!!selectedAttendance} onClose={() => setSelectedAttendance(null)} title="Attendance Security Audit Record">
        {selectedAttendance && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-primary">{selectedAttendance.employeeName}</h3>
                <p className="text-[10px] text-outline">Doc ID: {selectedAttendance.docId || `${selectedAttendance.employeeId}_${selectedAttendance.date}`} | UUID: {selectedAttendance.id}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                selectedAttendance.syncStatus === 'Synced' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {selectedAttendance.syncStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-variant/30 rounded-xl">
              <div>
                <p className="text-[10px] text-outline mb-0.5">Employee ID</p>
                <p className="font-semibold text-on-surface">{selectedAttendance.employeeId}</p>
              </div>
              <div>
                <p className="text-[10px] text-outline mb-0.5">Date</p>
                <p className="font-semibold text-on-surface">{selectedAttendance.date}</p>
              </div>
              <div>
                <p className="text-[10px] text-outline mb-0.5">Check-In Time & Mode</p>
                <p className="font-bold text-green-700">{selectedAttendance.checkInTime} ({selectedAttendance.checkInMode})</p>
              </div>
              <div>
                <p className="text-[10px] text-outline mb-0.5">Check-Out Time & Mode</p>
                <p className="font-bold text-slate-800">{selectedAttendance.checkOutTime || '--:--'} ({selectedAttendance.checkOutMode})</p>
              </div>
              <div>
                <p className="text-[10px] text-outline mb-0.5">Working Hours</p>
                <p className="font-bold text-on-surface">{selectedAttendance.workingHours || '--'}</p>
              </div>
              <div>
                <p className="text-[10px] text-outline mb-0.5">Offline/Online Status</p>
                <p className="font-semibold text-on-surface">{selectedAttendance.isOffline ? 'Recorded Offline' : 'Recorded Online'}</p>
              </div>
              <div>
                <p className="text-[10px] text-outline mb-0.5">Reminder Count</p>
                <p className="font-semibold text-on-surface">{selectedAttendance.reminderCount}</p>
              </div>
              <div>
                <p className="text-[10px] text-outline mb-0.5">Distance From Office</p>
                <p className="font-semibold text-on-surface">{selectedAttendance.distance.toFixed(1)} meters</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] text-outline mb-0.5">Town / City Location</p>
                <p className="font-semibold text-on-surface">{selectedAttendance.townCity}</p>
              </div>
              {(selectedAttendance.exitTime || selectedAttendance.returnTime) && (
                <div className="col-span-2 p-2 bg-amber-50 text-amber-900 rounded">
                  <p className="text-[10px] font-bold mb-0.5">Smart Office Exit Log</p>
                  <p className="text-xs">Exit: {selectedAttendance.exitTime || '--'} | Return: {selectedAttendance.returnTime || '--'}</p>
                </div>
              )}
              <div className="col-span-2 border-t border-outline/10 pt-2">
                <p className="text-[10px] text-outline mb-0.5">Original Event Time (Device Timestamp)</p>
                <p className="font-mono text-[10px] text-on-surface">{new Date(selectedAttendance.createdAtDeviceTime).toLocaleString()}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] text-outline mb-0.5">Server Sync Time</p>
                <p className="font-mono text-[10px] text-on-surface">
                  {selectedAttendance.serverSyncTime ? new Date(selectedAttendance.serverSyncTime).toLocaleString() : 'Pending Sync'}
                </p>
              </div>
              {selectedAttendance.reason && (
                <div className="col-span-2 p-2 bg-red-50 text-red-800 rounded">
                  <p className="text-[10px] font-bold mb-0.5">Auto-Checkout Reason</p>
                  <p className="text-xs">{selectedAttendance.reason}</p>
                </div>
              )}
            </div>

            <Button onClick={() => setSelectedAttendance(null)} className="w-full">Close</Button>
          </div>
        )}
      </Dialog>

      {/* Registration Details Dialog */}
      <Dialog isOpen={!!selectedReg} onClose={() => setSelectedReg(null)} title="Registration Details">
        {selectedReg && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-sm border border-outline/20 bg-surface-variant flex items-center justify-center">
                {selectedReg.selfieUrl ? (
                  <img src={selectedReg.selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-on-surface-variant" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-outline mb-1">Employee Code</p>
                <p className="font-medium text-on-surface">{selectedReg.employeeCode}</p>
              </div>
              <div>
                <p className="text-xs text-outline mb-1">Status</p>
                <StatusBadge status={selectedReg.status} />
              </div>
              <div>
                <p className="text-xs text-outline mb-1">Full Name</p>
                <p className="font-medium text-on-surface">{selectedReg.name}</p>
              </div>
              <div>
                <p className="text-xs text-outline mb-1">Mobile Number</p>
                <p className="font-medium text-on-surface">{selectedReg.mobileNumber}</p>
              </div>
              <div className="col-span-2 border-t border-outline/10 pt-4 mt-2">
                <p className="text-xs text-outline mb-1">Device Model</p>
                <p className="font-medium text-on-surface">{selectedReg.deviceModel}</p>
              </div>
              <div>
                <p className="text-xs text-outline mb-1">Android Version</p>
                <p className="font-medium text-on-surface">{selectedReg.androidVersion}</p>
              </div>
              <div>
                <p className="text-xs text-outline mb-1">App Version</p>
                <p className="font-medium text-on-surface">{selectedReg.appVersion}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-outline mb-1">Device ID</p>
                <p className="font-mono text-xs text-on-surface break-all">{selectedReg.deviceId}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-outline mb-1">Registration Date</p>
                <p className="font-medium text-on-surface">
                  {new Date(selectedReg.registrationDate).toLocaleString()}
                </p>
              </div>
              {selectedReg.rejectionReason && (
                <div className="col-span-2 p-3 bg-red-50 text-red-800 rounded-lg">
                  <p className="text-xs font-medium mb-1">Rejection Reason</p>
                  <p>{selectedReg.rejectionReason}</p>
                </div>
              )}
            </div>

            {selectedReg.status === 'Pending Approval' && (
              <div className="flex gap-3 pt-4">
                <Button variant="outlined" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowRejectDialog(true)}>
                  Reject
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleApprove(selectedReg.id)}>
                  Approve
                </Button>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog isOpen={showRejectDialog} onClose={() => setShowRejectDialog(false)} title="Reject Registration">
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">Please provide a reason for rejecting this device registration.</p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="w-full p-3 rounded-xl border border-outline/30 bg-surface focus:ring-2 focus:ring-primary focus:border-transparent min-h-[100px] text-on-surface"
            placeholder="E.g., Image not clear, Invalid mobile number..."
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
      <span className="flex items-center gap-1 bg-green-100 text-green-800 px-2.5 py-1 rounded-full text-[11px] font-medium">
        <CheckCircle className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (status === 'Rejected') {
    return (
      <span className="flex items-center gap-1 bg-red-100 text-red-800 px-2.5 py-1 rounded-full text-[11px] font-medium">
        <XCircle className="w-3 h-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-[11px] font-medium">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
};
