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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#070B1A]/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[linear-gradient(135deg,rgba(42,35,86,0.95),rgba(20,31,61,0.95))] backdrop-blur-[16px] border border-[#7C3AED]/30 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-2xl p-0 shadow-2xl animate-in zoom-in-95 duration-200 text-[#F8FAFC]">
        <div className="p-4 flex-shrink-0 border-b border-white/10 flex items-center justify-between bg-[#11152D]/80">
          <h2 className="text-sm font-bold text-[#F8FAFC] tracking-tight">{title}</h2>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto text-[#CBD5E1] text-sm leading-relaxed break-words min-h-0 bg-[#191E3A]/80">
          {children}
        </div>
        {!hideDefaultFooter && (
          <div className="p-3.5 flex-shrink-0 border-t border-white/10 flex justify-end gap-2 bg-[#11152D]/80">
            <button 
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-[#CBD5E1] rounded-lg hover:bg-white/10 hover:text-[#F8FAFC] transition-colors cursor-pointer border border-white/10"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
