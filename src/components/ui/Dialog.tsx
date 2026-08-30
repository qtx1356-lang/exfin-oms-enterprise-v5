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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-card border border-white/25 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-2xl p-0 shadow-[0_20px_50px_rgba(30,41,100,0.35)] animate-in zoom-in-95 duration-200 text-white">
        <div className="p-4 flex-shrink-0 border-b border-white/15 flex items-center justify-between bg-black/20">
          <h2 className="text-sm font-bold text-white tracking-tight">{title}</h2>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#CBD5E1] hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto text-[#E2E8F0] text-sm leading-relaxed break-words min-h-0 bg-[var(--surface-elevated)]/70">
          {children}
        </div>
        {!hideDefaultFooter && (
          <div className="p-3.5 flex-shrink-0 border-t border-white/15 flex justify-end gap-2 bg-black/20">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-white rounded-xl bg-white/15 hover:bg-white/25 transition-colors cursor-pointer border border-white/20"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

