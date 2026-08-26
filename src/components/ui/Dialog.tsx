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
      <div className="bg-[#173A32] border border-[#2A5B50] w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-[24px] p-0 shadow-2xl animate-in zoom-in-95 duration-200 text-[#F4FAF7]">
        <div className="p-5 pb-4 flex-shrink-0 border-b border-[#2A5B50] flex items-center justify-between">
          <h2 className="text-lg font-black text-[#F4FAF7] tracking-tight">{title}</h2>
        </div>
        <div className="p-5 overflow-y-auto text-[#C7DAD3] text-sm leading-relaxed break-words min-h-0">
          {children}
        </div>
        {!hideDefaultFooter && (
          <div className="p-4 pt-3 flex-shrink-0 border-t border-[#2A5B50] flex justify-end gap-2 bg-[#112C26]">
            <button 
              onClick={onClose}
              className="px-5 py-2 text-[#C7DAD3] font-bold rounded-xl hover:bg-[#21483E] hover:text-[#19C7C0] transition-colors cursor-pointer border border-[#2A5B50]"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

