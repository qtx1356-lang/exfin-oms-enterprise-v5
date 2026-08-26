import React from 'react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  hideDefaultFooter?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, title, children, hideDefaultFooter }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[rgba(12,15,22,0.94)] backdrop-blur-2xl border border-[rgba(167,139,250,0.25)] w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-[24px] p-0 shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200 text-[#F8FAFC]">
        <div className="p-5 pb-4 flex-shrink-0 border-b border-[rgba(167,139,250,0.18)] flex items-center justify-between">
          <h2 className="text-lg font-black text-[#F8FAFC] tracking-tight">{title}</h2>
        </div>
        <div className="p-5 overflow-y-auto text-[#A7B0BE] text-sm leading-relaxed break-words min-h-0">
          {children}
        </div>
        {!hideDefaultFooter && (
          <div className="p-4 pt-3 flex-shrink-0 border-t border-[rgba(167,139,250,0.18)] flex justify-end gap-2 bg-[rgba(8,11,15,0.85)]">
            <button 
              onClick={onClose}
              className="px-5 py-2 text-[#A7B0BE] font-bold rounded-xl hover:bg-[rgba(139,92,246,0.12)] hover:text-[#00F5FF] transition-colors cursor-pointer border border-[rgba(167,139,250,0.20)]"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

