import React, { useState, useEffect } from 'react';
import { Camera, User, Phone, Mail, Building2, Briefcase, Shield, Users, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ManagedUser } from '../../types/user';
import { uploadProfilePhoto } from '../../services/profile/profileService';

interface ProfileEditModalProps {
  user: ManagedUser;
  isOpen: boolean;
  onClose: () => void;
  onSave: (uid: string, data: Record<string, any>, oldData: Record<string, any>) => Promise<void>;
  departments: any[];
  designations: any[];
  allUsers?: ManagedUser[];
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  user,
  isOpen,
  onClose,
  onSave,
  departments = [],
  designations = [],
  allUsers = [],
}) => {
  const currentTlId =
    (user as any)?.assignedTeamLeaderId ||
    (user as any)?.teamLeaderId ||
    (user as any)?.teamLeaderUid ||
    '';

  const [formData, setFormData] = useState({
    name: user?.name || '',
    mobileNumber: user?.mobileNumber || '',
    email: user?.email || '',
    office: user?.office || (user as any)?.departmentName || '',
    designation: user?.designation || '',
    role: user?.role || (user?.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE'),
    status: user?.status || 'Approved',
    isTeamLeader: Boolean(user?.isTeamLeader) || user?.role === 'TEAM_LEADER',
    assignedTeamLeaderId: currentTlId,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(user?.profilePhotoUrl || user?.selfieUrl || '');

  // Keep state synced when user prop changes
  useEffect(() => {
    if (user) {
      const tlId =
        (user as any)?.assignedTeamLeaderId ||
        (user as any)?.teamLeaderId ||
        (user as any)?.teamLeaderUid ||
        '';
      setFormData({
        name: user.name || '',
        mobileNumber: user.mobileNumber || '',
        email: user.email || '',
        office: user.office || (user as any)?.departmentName || '',
        designation: user.designation || '',
        role: user.role || (user.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE'),
        status: user.status || 'Approved',
        isTeamLeader: Boolean(user.isTeamLeader) || user.role === 'TEAM_LEADER',
        assignedTeamLeaderId: tlId,
      });
      setPhotoUrl(user.profilePhotoUrl || user.selfieUrl || '');
    }
  }, [user]);

  // List of candidate Team Leaders (excluding the user being edited)
  const safeAllUsers = Array.isArray(allUsers) ? allUsers : [];
  const candidateTeamLeaders = safeAllUsers.filter(
    (u) =>
      u &&
      u.id !== user?.id &&
      u.status === 'Approved' &&
      (u.isTeamLeader || u.role === 'TEAM_LEADER')
  );

  const handleRoleChange = (newRole: string) => {
    let isTL = formData.isTeamLeader;
    if (newRole === 'TEAM_LEADER') {
      isTL = true;
    } else if (newRole === 'EMPLOYEE') {
      isTL = false;
    }
    console.log('[TeamLeaderSync] FORM_VALUE', { isTeamLeader: isTL, role: newRole });
    setFormData((prev) => ({
      ...prev,
      role: newRole,
      isTeamLeader: isTL,
      assignedTeamLeaderId: newRole === 'TEAM_LEADER' ? '' : prev.assignedTeamLeaderId,
    }));
  };

  const handleTeamLeaderToggle = (checked: boolean) => {
    console.log('[TeamLeaderSync] FORM_VALUE', { isTeamLeader: checked });
    setFormData((prev) => {
      const nextRole = checked
        ? (prev.role === 'EMPLOYEE' ? 'TEAM_LEADER' : prev.role)
        : (prev.role === 'TEAM_LEADER' ? 'EMPLOYEE' : prev.role);
      return {
        ...prev,
        isTeamLeader: checked,
        role: nextRole,
        assignedTeamLeaderId: checked ? '' : prev.assignedTeamLeaderId,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      const selectedTl = candidateTeamLeaders.find((tl) => tl && tl.id === formData.assignedTeamLeaderId);

      const finalIsTeamLeader = Boolean(formData.isTeamLeader);
      const finalRole = !finalIsTeamLeader && formData.role === 'TEAM_LEADER' ? 'EMPLOYEE' : formData.role;

      const payload: Record<string, any> = {
        name: formData.name.trim(),
        mobileNumber: formData.mobileNumber.trim(),
        email: formData.email.trim(),
        office: formData.office,
        designation: formData.designation,
        role: finalRole,
        status: formData.status,
        isTeamLeader: finalIsTeamLeader,
        assignedTeamLeaderId: formData.assignedTeamLeaderId || null,
        assignedTeamLeaderName: selectedTl ? selectedTl.name : null,
        assignedTeamLeaderCode: selectedTl ? selectedTl.employeeCode : null,
        profilePhotoUrl: photoUrl,
      };

      console.log('[TeamLeaderSync] SAVE_REQUEST', { isTeamLeader: payload.isTeamLeader, role: payload.role });

      await onSave(user.id, payload, user);
    } catch (error) {
      console.error('Save failed', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Photo size must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setUploadingPhoto(true);
      try {
        const res = await uploadProfilePhoto(user.id, user.employeeCode || 'EXFRNG000', base64);
        if (res.photoUrl) {
          setPhotoUrl(res.photoUrl);
          alert('Profile photo updated successfully.');
        } else {
          setPhotoUrl(base64);
          alert('Profile photo updated successfully.');
        }
      } catch (err: any) {
        if (!navigator.onLine) {
          alert("You're offline. Connect to the internet to update the profile photo.");
        } else {
          alert('Unable to upload profile photo. Please try again.');
        }
      } finally {
        setUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!user) {
    return null;
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Edit Employee Profile: ${user.name || 'Unknown'}`}>
      <div className="flex flex-col items-center mb-5">
        <div className="relative group">
          <div className="w-24 h-24 rounded-full bg-[var(--surface-elevated)] border-2 border-[var(--primary)] overflow-hidden flex items-center justify-center shadow-lg">
            {photoUrl ? (
              <img src={photoUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-[var(--primary)]/60" />
            )}
          </div>
          <label
            className={`absolute bottom-0 right-0 p-2 ${
              uploadingPhoto ? 'bg-[var(--button-primary)]' : 'bg-[var(--button-primary)] hover:opacity-90'
            } text-black rounded-full cursor-pointer shadow-md transition-all scale-95 group-hover:scale-105`}
          >
            {uploadingPhoto ? (
              <span className="text-[9px] font-black animate-pulse">Wait...</span>
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
              disabled={uploadingPhoto}
            />
          </label>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-2 font-bold uppercase tracking-wider">
          Profile Photo (Admin Only)
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Employee Code (Read-only) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-purple-300 block">
            EMPLOYEE CODE (Read-Only)
          </label>
          <input
            type="text"
            readOnly
            value={user.employeeCode || 'N/A'}
            className="w-full px-3 py-2 rounded-xl bg-[var(--app-background-secondary)] border border-[var(--border)] text-[var(--text-muted)] text-xs font-mono font-bold"
          />
        </div>

        {/* Basic Personal Information */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-purple-300 block">Full Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-white text-xs font-bold focus:outline-none focus:border-purple-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300 block">Mobile Number</label>
              <input
                type="text"
                value={formData.mobileNumber}
                onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-white text-xs font-bold focus:outline-none focus:border-purple-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300 block">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-white text-xs font-bold focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {/* Department & Designation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300 block">Department *</label>
              <select
                required
                value={formData.office}
                onChange={(e) => setFormData({ ...formData, office: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-white text-xs font-bold focus:outline-none focus:border-purple-400"
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id || d.name} value={d.name}>
                    {d.name} {d.active === false ? '(Inactive)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300 block">Designation</label>
              <select
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-white text-xs font-bold focus:outline-none focus:border-purple-400"
              >
                <option value="">Select Designation</option>
                {designations.map((d) => (
                  <option key={d.id || d.name} value={d.name}>
                    {d.name} {d.active === false ? '(Inactive)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Role & Account Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300 block">Role</label>
              <select
                value={formData.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-white text-xs font-bold focus:outline-none focus:border-purple-400"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="TEAM_LEADER">Team Leader</option>
                <option value="HR">HR</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300 block">Account Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-white text-xs font-bold focus:outline-none focus:border-purple-400"
              >
                <option value="Pending Approval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* Team Leader Designate Checkbox */}
          <div className="p-3 bg-[var(--app-background-secondary)] border border-[var(--border)] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-xs font-bold text-white">Designate as Team Leader</p>
                <p className="text-[10px] text-purple-300/60">Unlocks "My Team" management screen for this user</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={formData.isTeamLeader}
              onChange={(e) => handleTeamLeaderToggle(e.target.checked)}
              className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
            />
          </div>

          {/* Team Leader dropdown (if not a Team Leader themselves) */}
          {!formData.isTeamLeader && formData.role !== 'TEAM_LEADER' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300 block">
                Team Leader
              </label>
              <select
                value={formData.assignedTeamLeaderId}
                onChange={(e) => setFormData({ ...formData, assignedTeamLeaderId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-white text-xs font-bold focus:outline-none focus:border-purple-400"
              >
                <option value="">No Team Leader</option>
                {candidateTeamLeaders.map((tl) => (
                  <option key={tl.id} value={tl.id}>
                    {tl.name} ({tl.employeeCode || tl.id}) - {tl.office || (tl as any).departmentName || 'Raniganj'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
          <Button
            type="button"
            variant="text"
            onClick={onClose}
            disabled={isSaving}
            className="text-purple-300 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold"
            disabled={isSaving}
          >
            {isSaving ? 'Saving Changes...' : 'Save Profile'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

