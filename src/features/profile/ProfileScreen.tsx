import React, { useEffect, useState } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { usePermission } from '../../context/PermissionContext';
import {
  User,
  Phone,
  Mail,
  Building,
  Briefcase,
  Calendar,
  ShieldCheck,
  Camera,
  Edit2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MapPin,
  Users,
  Shield,
  FileText,
  UploadCloud,
  ChevronRight,
  Send,
  Info,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmployeeProfile, ProfileChangeRequest } from '../../types/profile';
import {
  loadProfile,
  uploadProfilePhoto,
  submitProfileChangeRequest,
} from '../../services/profile/profileService';
import { db } from '../../services/firebase/config';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';

import { APP_VERSION, SERVICE_WORKER_VERSION } from '../../config/version';

export const ProfileScreen: React.FC = () => {
  const { employeeData, authUser } = useRegistration();
  const { role, hasFeatureAccess, permissions } = usePermission();

  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ProfileChangeRequest[]>([]);

  // Team Leader Scope State
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  // Request Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editField, setEditField] = useState<'mobileNumber' | 'email' | 'emergencyContact'>('mobileNumber');
  const [fieldLabel, setFieldLabel] = useState('Mobile Number');
  const [currentValue, setCurrentValue] = useState('');
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const uid = authUser?.uid || localStorage.getItem('registrationId') || '';

  // 1. Fetch Profile
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      setLoading(true);
      const data = await loadProfile(uid, employeeData?.employeeCode);
      setProfile(data);
      setLoading(false);
    };

    fetchProfile();
  }, [uid, employeeData]);

  // 2. Real-time Listen to User's Change Requests
  useEffect(() => {
    if (!db || !profile?.employeeCode) return;

    const q = query(
      collection(db, 'profile_change_requests'),
      where('employeeCode', '==', profile.employeeCode)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const reqs: ProfileChangeRequest[] = [];
        snapshot.forEach((doc) => {
          reqs.push({ id: doc.id, ...doc.data() } as ProfileChangeRequest);
        });
        reqs.sort(
          (a, b) =>
            new Date(b.createdAtDeviceTime).getTime() -
            new Date(a.createdAtDeviceTime).getTime()
        );
        setChangeRequests(reqs);
      },
      (err) => {
        console.warn('Error fetching change requests:', err);
      }
    );

    return () => unsub();
  }, [profile?.employeeCode]);

  // 3. Team Leader Scope: Fetch Team Members
  useEffect(() => {
    if (!db || !profile?.isTeamLeader && role !== 'TEAM_LEADER') return;

    const dept = profile?.department || employeeData?.office || 'Raniganj';
    const qTeam = query(
      collection(db, 'registrations'),
      where('office', '==', dept)
    );

    getDocs(qTeam).then((snap) => {
      const members: any[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.employeeCode !== profile?.employeeCode) {
          members.push({ id: docSnap.id, ...data });
        }
      });
      setTeamMembers(members);
    });
  }, [profile, role, employeeData]);

  // Open Edit Request Modal
  const openEditModal = (field: 'mobileNumber' | 'email' | 'emergencyContact', label: string, val: string) => {
    setEditField(field);
    setFieldLabel(label);
    setCurrentValue(val || '');
    setRequestedValue(val || '');
    setReason('');
    setShowEditModal(true);
  };

  // Submit Change Request
  const handleSubmitChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedValue.trim() || !reason.trim() || !profile) return;

    setSubmittingRequest(true);
    try {
      await submitProfileChangeRequest({
        uid: profile.uid,
        employeeCode: profile.employeeCode,
        employeeName: profile.name,
        field: editField,
        fieldLabel,
        oldValue: currentValue,
        requestedValue: requestedValue.trim(),
        reason: reason.trim(),
      });

      alert(`Profile change request for ${fieldLabel} submitted successfully.`);
      setShowEditModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to submit change request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const getRoleDisplayName = (r?: string) => {
    switch (r) {
      case 'SUPER_ADMIN':
        return 'Super Admin';
      case 'ADMIN':
        return 'Administrator';
      case 'HR':
        return 'HR Manager';
      case 'TEAM_LEADER':
        return 'Team Leader';
      default:
        return 'Employee';
    }
  };

  const activeModules = [
    { key: 'attendance', label: 'Attendance' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'workPlanner', label: 'Work Planner' },
    { key: 'myTeam', label: 'My Team' },
    { key: 'employeeEfficiency', label: 'Efficiency' },
    { key: 'leave', label: 'Leave' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'reports', label: 'Reports' },
  ].filter((m) => hasFeatureAccess(m.key as any));

  if (loading) {
    return (
      <div className="py-12 flex justify-center items-center text-purple-300 font-bold">
        Loading profile information...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 max-w-4xl mx-auto">
      {/* 1. Header Card */}
      <Card className="p-6 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[24px] shadow-2xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#7C3AED]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
          {/* Avatar Container */}
          <div className="relative group">
            <div className="w-24 h-24 rounded-full bg-[#170B38] border-2 border-[#7C3AED] overflow-hidden flex items-center justify-center shadow-lg">
              {profile?.profilePhotoUrl || profile?.localPhotoData ? (
                <img
                  src={profile.profilePhotoUrl || profile.localPhotoData!}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-purple-300/60" />
              )}
            </div>
          </div>

          {/* User Basic Info */}
          <div className="text-center sm:text-left space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-black text-white">{profile?.name || employeeData?.name || 'Employee Name'}</h1>
              <span className="px-3 py-0.5 rounded-full text-xs font-black bg-[#7C3AED] text-white shadow-md">
                {profile?.employeeCode || employeeData?.employeeCode}
              </span>
            </div>

            <p className="text-sm font-bold text-purple-200">
              {profile?.designation} • {profile?.department}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-purple-500/20 text-purple-200 border border-purple-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-300" />
                Role: {getRoleDisplayName(profile?.role || role)}
              </span>

              <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Status: {profile?.employmentStatus || 'Active'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Main Grid Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Information (Editable via Change Request) */}
        <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
          <div className="flex justify-between items-center border-b border-purple-500/10 pb-3">
            <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-[#A78BFA]" /> Personal Information
            </h2>
            <span className="text-[10px] text-purple-300/60 font-semibold">Editable via Request</span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="flex justify-between items-center bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <div>
                <p className="text-[10px] font-bold text-purple-300/70">MOBILE NUMBER</p>
                <p className="text-sm font-bold text-white mt-0.5">{profile?.mobileNumber || 'Not Set'}</p>
              </div>
              <button
                onClick={() => openEditModal('mobileNumber', 'Mobile Number', profile?.mobileNumber || '')}
                className="p-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-all"
                title="Request Mobile Change"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex justify-between items-center bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <div>
                <p className="text-[10px] font-bold text-purple-300/70">EMAIL ADDRESS</p>
                <p className="text-sm font-bold text-white mt-0.5">{profile?.email || 'Not Set'}</p>
              </div>
              <button
                onClick={() => openEditModal('email', 'Email Address', profile?.email || '')}
                className="p-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-all"
                title="Request Email Change"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex justify-between items-center bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <div>
                <p className="text-[10px] font-bold text-purple-300/70">EMERGENCY CONTACT</p>
                <p className="text-sm font-bold text-white mt-0.5">{profile?.emergencyContact || 'Not Provided'}</p>
              </div>
              <button
                onClick={() => openEditModal('emergencyContact', 'Emergency Contact', profile?.emergencyContact || '')}
                className="p-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-all"
                title="Request Emergency Contact Change"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <p className="text-[10px] font-bold text-purple-300/70">WORK LOCATION</p>
              <p className="text-sm font-bold text-white mt-0.5">{profile?.workLocation || profile?.department}</p>
            </div>
          </div>
        </Card>

        {/* Employment Information (Read-Only) */}
        <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
          <div className="flex justify-between items-center border-b border-purple-500/10 pb-3">
            <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-[#A78BFA]" /> Employment Information
            </h2>
            <span className="text-[10px] text-amber-300/80 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              READ ONLY
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <p className="text-[10px] font-bold text-purple-300/70">EMPLOYEE CODE</p>
              <p className="text-sm font-black text-white mt-0.5">{profile?.employeeCode}</p>
            </div>

            <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <p className="text-[10px] font-bold text-purple-300/70">DEPARTMENT</p>
              <p className="text-sm font-bold text-white mt-0.5">{profile?.department}</p>
            </div>

            <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <p className="text-[10px] font-bold text-purple-300/70">DESIGNATION</p>
              <p className="text-sm font-bold text-white mt-0.5">{profile?.designation}</p>
            </div>

            <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <p className="text-[10px] font-bold text-purple-300/70">TEAM LEADER</p>
              <p className="text-sm font-bold text-purple-200 mt-0.5">{profile?.teamLeaderName || 'Branch Admin'}</p>
            </div>

            <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <p className="text-[10px] font-bold text-purple-300/70">JOINING DATE</p>
              <p className="text-sm font-bold text-white mt-0.5">{profile?.joiningDate}</p>
            </div>

            <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              <p className="text-[10px] font-bold text-purple-300/70">REPORTING MANAGER</p>
              <p className="text-sm font-bold text-white mt-0.5">{profile?.reportingManager || 'Branch Admin'}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Access & Permissions Section */}
      <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-3 shadow-xl">
        <div className="flex justify-between items-center border-b border-purple-500/10 pb-3">
          <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#A78BFA]" /> Access & Authorized Modules
          </h2>
          <span className="text-[10px] text-purple-300/60 font-semibold">RBAC Governed</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {activeModules.map((m) => (
            <span
              key={m.key}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#211044] text-purple-200 border border-purple-500/20 flex items-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              {m.label}
            </span>
          ))}
        </div>
      </Card>

      {/* 4. My Profile Change Requests Section */}
      <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
        <div className="flex justify-between items-center border-b border-purple-500/10 pb-3">
          <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#A78BFA]" /> My Profile Change Requests
          </h2>
          <span className="text-[10px] text-purple-300/60 font-semibold">
            {changeRequests.length} Total Requests
          </span>
        </div>

        <div className="space-y-2.5">
          {changeRequests.length > 0 ? (
            changeRequests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 bg-[#211044] rounded-xl border border-purple-500/15 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-white">{req.fieldLabel}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${
                        req.status === 'Approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : req.status === 'Rejected'
                          ? 'bg-red-500/20 text-red-300 border-red-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {req.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-300/80">
                    Requested: <span className="text-white font-bold">{req.requestedValue}</span> (Reason: {req.reason})
                  </p>
                  {req.rejectionReason && (
                    <p className="text-[10px] text-red-300 font-semibold">
                      Rejection Reason: {req.rejectionReason}
                    </p>
                  )}
                </div>

                <span className="text-[10px] text-purple-300/50 font-mono">
                  {new Date(req.createdAtDeviceTime).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-purple-300/60 py-4 text-center">
              No profile change requests submitted yet.
            </p>
          )}
        </div>
      </Card>

      {/* 5. Team Leader View: My Team Members Scope */}
      {(profile?.isTeamLeader || role === 'TEAM_LEADER') && (
        <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
          <div className="flex justify-between items-center border-b border-purple-500/10 pb-3">
            <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-[#A78BFA]" /> Assigned Team Directory ({teamMembers.length})
            </h2>
            <span className="text-[10px] text-purple-300/60 font-semibold">Team Leader Scope</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="p-3 bg-[#211044] rounded-xl border border-purple-500/15 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-purple-900/50 border border-purple-500/30 flex items-center justify-center font-black text-purple-200">
                  {member.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <p className="font-bold text-xs text-white truncate">{member.name}</p>
                  <p className="text-[10px] text-purple-300/70">
                    {member.employeeCode} • {member.office || 'Raniganj'}
                  </p>
                  <p className="text-[10px] text-purple-300/50">{member.mobileNumber}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* System & Application Info */}
      <Card className="p-4 bg-[#2D1B5A]/60 border border-purple-500/15 text-white rounded-[22px] flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold text-purple-200">EXFIN OMS ENTERPRISE</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
            App Version: {APP_VERSION}
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
            SW Cache: {SERVICE_WORKER_VERSION}
          </span>
        </div>
      </Card>

      {/* Profile Edit Modal */}
      <Dialog
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Request ${fieldLabel} Change`}
      >
        <form onSubmit={handleSubmitChangeRequest} className="space-y-4">
          <p className="text-xs text-purple-300/80">
            For security, edits to personal details require approval from HR or Administration. Your request will be queued securely.
          </p>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-purple-300">CURRENT VALUE</label>
            <input
              type="text"
              readOnly
              value={currentValue || 'Not Set'}
              className="w-full px-3 py-2 rounded-xl bg-[#170B38] border border-purple-500/20 text-purple-300/70 text-xs font-bold"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-purple-300">REQUESTED NEW {fieldLabel}</label>
            <input
              type="text"
              required
              value={requestedValue}
              onChange={(e) => setRequestedValue(e.target.value)}
              placeholder={`Enter new ${fieldLabel.toLowerCase()}`}
              className="w-full px-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-purple-300">REASON FOR CHANGE</label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State clear reason for requesting this update..."
              className="w-full px-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submittingRequest}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {submittingRequest ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
