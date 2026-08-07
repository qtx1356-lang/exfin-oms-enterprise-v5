import React, { useEffect, useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { db } from '../../services/firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { LogOut, Search, CheckCircle, XCircle, Clock, Smartphone, User, Phone } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useNavigate } from 'react-router-dom';

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
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'registrations'), orderBy('registrationDate', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const regs: Registration[] = [];
      snapshot.forEach((doc) => {
        regs.push({ id: doc.id, ...doc.data() } as Registration);
      });
      setRegistrations(regs);
    });
    return () => unsub();
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

  const pendingCount = registrations.filter(r => r.status === 'Pending Approval').length;

  return (
    <div className="min-h-screen bg-background">
      {/* Top App Bar */}
      <header className="bg-surface shadow-sm sticky top-0 z-20 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-on-surface">Admin Panel</h1>
          <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-medium">
            {pendingCount} Pending
          </span>
        </div>
        <Button variant="text" onClick={handleLogout} className="text-on-surface-variant">
          <LogOut className="w-5 h-5 mr-2" /> Logout
        </Button>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        
        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              placeholder="Search by name, code or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-outline/30 bg-surface focus:ring-2 focus:ring-primary focus:border-transparent text-on-surface"
            />
          </div>
        </div>

        {/* Registrations List */}
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
      </main>

      {/* Details Dialog */}
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
