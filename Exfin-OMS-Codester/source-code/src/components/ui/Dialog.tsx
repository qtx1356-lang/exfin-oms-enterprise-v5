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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#2D1B5A] border border-purple-500/30 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-[28px] p-0 shadow-2xl animate-in zoom-in-95 duration-200 text-white">
        <div className="p-6 pb-4 flex-shrink-0 border-b border-purple-500/20">
          <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
        </div>
        <div className="p-6 overflow-y-auto text-purple-200 text-sm leading-relaxed break-words min-h-0">
          {children}
        </div>
        <div className="p-4 pt-3 flex-shrink-0 border-t border-purple-500/20 flex justify-end gap-2 bg-[#211044]/50">
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
