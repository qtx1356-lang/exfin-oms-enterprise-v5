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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#151515] border border-[#292929] w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-[20px] p-0 shadow-2xl animate-in zoom-in-95 duration-200 text-[#FFFFFF]">
        <div className="p-5 pb-4 flex-shrink-0 border-b border-[#292929] flex items-center justify-between bg-[#1B1B1B]">
          <h2 className="text-base font-bold text-[#FFFFFF] tracking-tight">{title}</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8A8A8A] hover:text-[#FFFFFF] hover:bg-[#252525] transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-5 overflow-y-auto text-[#C7C7C7] text-sm leading-relaxed break-words min-h-0 bg-[#151515]">
          {children}
        </div>
        {!hideDefaultFooter && (
          <div className="p-4 pt-3 flex-shrink-0 border-t border-[#292929] flex justify-end gap-2 bg-[#121212]">
            <button 
              onClick={onClose}
              className="px-5 py-2 text-[#C7C7C7] font-semibold rounded-xl hover:bg-[#202020] hover:text-[#FFFFFF] transition-colors cursor-pointer border border-[#292929]"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
