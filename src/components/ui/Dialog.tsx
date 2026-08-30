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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#0B0D2C]/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[linear-gradient(135deg,rgba(45,27,100,0.98),rgba(20,42,91,0.98))] backdrop-blur-[20px] border border-[#A78BFA]/35 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-2xl p-0 shadow-[0_16px_40px_rgba(17,16,74,0.70)] animate-in zoom-in-95 duration-200 text-white">
        <div className="p-4 flex-shrink-0 border-b border-[#A78BFA]/20 flex items-center justify-between bg-[#18204F]/80">
          <h2 className="text-sm font-bold text-white tracking-tight">{title}</h2>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#A8B0C5] hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto text-[#E2E8F0] text-sm leading-relaxed break-words min-h-0 bg-[#18204F]/60">
          {children}
        </div>
        {!hideDefaultFooter && (
          <div className="p-3.5 flex-shrink-0 border-t border-[#A78BFA]/20 flex justify-end gap-2 bg-[#18204F]/80">
            <button 
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-[#E2E8F0] rounded-xl hover:bg-white/15 hover:text-white transition-colors cursor-pointer border border-[#A78BFA]/20"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
