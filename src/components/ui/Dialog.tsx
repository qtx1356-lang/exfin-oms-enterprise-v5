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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#0F1025]/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1E1F41]/90 backdrop-blur-[16px] border border-[#6366F1]/30 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-[20px] p-0 shadow-2xl animate-in zoom-in-95 duration-200 text-[#F8F8FF]">
        <div className="p-5 pb-4 flex-shrink-0 border-b border-[#6366F1]/20 flex items-center justify-between bg-[#171936]">
          <h2 className="text-base font-bold text-[#F8F8FF] tracking-tight">{title}</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#B9B9D0] hover:text-[#F8F8FF] hover:bg-[#6366F1]/20 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-5 overflow-y-auto text-[#B9B9D0] text-sm leading-relaxed break-words min-h-0 bg-[#1E1F41]/80">
          {children}
        </div>
        {!hideDefaultFooter && (
          <div className="p-4 pt-3 flex-shrink-0 border-t border-[#6366F1]/20 flex justify-end gap-2 bg-[#171936]">
            <button 
              onClick={onClose}
              className="px-5 py-2 text-[#B9B9D0] font-semibold rounded-xl hover:bg-[#6366F1]/20 hover:text-[#F8F8FF] transition-colors cursor-pointer border border-[#6366F1]/20"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
