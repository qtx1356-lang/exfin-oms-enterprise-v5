import React from 'react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#2D1B5A] border border-purple-500/30 w-full max-w-md rounded-[28px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-white">
        <h2 className="text-xl font-bold text-white mb-4 tracking-tight">{title}</h2>
        <div className="mb-6 text-purple-200 text-sm leading-relaxed">
          {children}
        </div>
        <div className="flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-5 py-2 text-purple-300 font-semibold rounded-full hover:bg-purple-500/20 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
