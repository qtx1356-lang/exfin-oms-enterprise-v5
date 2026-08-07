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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-md rounded-[28px] p-6 shadow-xl animate-in fade-in zoom-in-95">
        <h2 className="text-[24px] text-on-surface mb-4 font-normal">{title}</h2>
        <div className="mb-6 text-on-surface-variant text-sm">
          {children}
        </div>
        <div className="flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-primary font-medium rounded-full hover:bg-primary/10 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
