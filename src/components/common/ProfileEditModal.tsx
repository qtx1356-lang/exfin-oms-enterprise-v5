import React, { useState } from 'react';
import { Camera, User, Phone, Mail, Building, Briefcase, MapPin, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ManagedUser } from '../../types/user';

interface ProfileEditModalProps {
  user: ManagedUser;
  isOpen: boolean;
  onClose: () => void;
  onSave: (uid: string, data: Record<string, any>, oldData: Record<string, any>) => Promise<void>;
  departments: any[];
  designations: any[];
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ user, isOpen, onClose, onSave, departments = [], designations = [] }) => {
  console.log("[UM_PHASE_6] MODAL_RENDER_START", user?.id);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    mobileNumber: user?.mobileNumber || '',
    email: user?.email || '',
    office: user?.office || 'Raniganj',
    designation: user?.designation || '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[UM_PHASE_6] SAVE_ATTEMPT_BLOCKED (Phase 6B only)", formData);
    // onSave is disabled for Phase 6A stability
    onClose();
  };

  if (!user) {
    console.warn("[UM_PHASE_6] MODAL_USER_MISSING");
    return null;
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Edit Profile: ${user.name || 'Unknown'}`}>
      <div className="mb-4 p-2 bg-purple-900/40 border border-purple-500/30 rounded-lg text-center">
        <p className="text-[10px] font-black text-purple-300">DIAGNOSTIC: UM-PHASE-6-EDIT-MODAL</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Employee Code (Read-only) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-purple-300">EMPLOYEE CODE (Read-Only)</label>
          <input type="text" readOnly value={user.employeeCode || 'N/A'} className="w-full px-3 py-2 rounded-xl bg-[#170B38] border border-purple-500/20 text-purple-300/70 text-xs font-bold" />
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-purple-300">Name</label>
            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-bold" />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300">Mobile Number</label>
              <input type="text" value={formData.mobileNumber} onChange={e => setFormData({...formData, mobileNumber: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-bold" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300">Email</label>
              <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-bold" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300">Department</label>
              <select value={formData.office} onChange={e => setFormData({...formData, office: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-bold">
                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300">Designation</label>
              <select value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-bold">
                {designations.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </form>
    </Dialog>
  );
};
