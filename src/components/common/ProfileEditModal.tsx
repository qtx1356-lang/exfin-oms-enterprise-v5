import React, { useState } from 'react';
import { Camera, User, Phone, Mail, Building, Briefcase, MapPin, Users, UploadCloud } from 'lucide-react';
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
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ user, isOpen, onClose, onSave, departments = [], designations = [] }) => {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    mobileNumber: user?.mobileNumber || '',
    email: user?.email || '',
    office: user?.office || 'Raniganj',
    designation: user?.designation || '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(user?.profilePhotoUrl || user?.selfieUrl || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      await onSave(user.id, formData, user);
    } catch (error) {
      console.error("Save failed", error);
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
          // If the return object does not have photoUrl but it was successful, we set the preview locally
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
    <Dialog isOpen={isOpen} onClose={onClose} title={`Edit Profile: ${user.name || 'Unknown'}`}>
      <div className="flex flex-col items-center mb-6">
        <div className="relative group">
          <div className="w-24 h-24 rounded-full bg-[#170B38] border-2 border-[#7C3AED] overflow-hidden flex items-center justify-center shadow-lg">
            {photoUrl ? (
              <img src={photoUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-purple-300/60" />
            )}
          </div>
          <label className={`absolute bottom-0 right-0 p-2 ${uploadingPhoto ? 'bg-purple-800' : 'bg-[#7C3AED] hover:bg-[#6D28D9]'} text-white rounded-full cursor-pointer shadow-md transition-all scale-95 group-hover:scale-105`}>
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
        <p className="text-[10px] text-purple-300/70 mt-2 font-bold uppercase tracking-wider">Profile Photo (Admin Only)</p>
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
          <Button variant="text" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </form>
    </Dialog>
  );
};
