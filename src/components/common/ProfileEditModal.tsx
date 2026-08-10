import React, { useState } from 'react';
import { Camera, User, Phone, Mail, Building, Briefcase, MapPin, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ManagedUser } from '../../features/admin/UserManagementTab';

interface ProfileEditModalProps {
  user: ManagedUser;
  isOpen: boolean;
  onClose: () => void;
  onSave: (uid: string, data: Record<string, any>, oldData: Record<string, any>) => Promise<void>;
  departments: any[];
  designations: any[];
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ user, isOpen, onClose, onSave, departments, designations }) => {
  const [formData, setFormData] = useState({
    name: user.name,
    mobileNumber: user.mobileNumber || '',
    email: user.email || '',
    office: user.office || 'Raniganj',
    designation: user.designation || '',
    // Add other fields based on schema
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(user.id, formData, { 
        name: user.name, 
        mobileNumber: user.mobileNumber, 
        email: user.email, 
        office: user.office, 
        designation: user.designation,
        employeeCode: user.employeeCode 
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Edit Profile: ${user.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Employee Code (Read-only) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-purple-300">EMPLOYEE CODE (Read-Only)</label>
          <input type="text" readOnly value={user.employeeCode} className="w-full px-3 py-2 rounded-xl bg-[#170B38] border border-purple-500/20 text-purple-300/70 text-xs font-bold" />
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
