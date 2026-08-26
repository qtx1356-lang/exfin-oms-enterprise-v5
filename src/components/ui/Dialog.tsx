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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[rgba(15,23,42,0.98)] border border-[rgba(148,163,184,0.25)] w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-[24px] p-0 shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200 text-[#F8FAFC]">
        <div className="p-5 pb-4 flex-shrink-0 border-b border-[rgba(148,163,184,0.20)] flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#F8FAFC] tracking-tight">{title}</h2>
        </div>
        <div className="p-5 overflow-y-auto text-[#CBD5E1] text-sm leading-relaxed break-words min-h-0">
          {children}
        </div>
        <div className="p-4 pt-3 flex-shrink-0 border-t border-[rgba(148,163,184,0.20)] flex justify-end gap-2 bg-[rgba(10,15,28,0.7)]">
          <button 
            onClick={onClose}
            className="px-5 py-2 text-[#CBD5E1] font-semibold rounded-xl hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
