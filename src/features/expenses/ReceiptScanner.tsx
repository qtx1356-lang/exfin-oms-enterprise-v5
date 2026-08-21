import React from 'react';
import { ExpenseRecord, ExpenseCategory } from '../../types/expense';

interface ReceiptScannerProps {
  isOpen: boolean;
  onClose: () => void;
  existingExpenses: ExpenseRecord[];
  onConfirm: (data: {
    amount: number;
    category: ExpenseCategory;
    date: string;
    merchant: string | null;
    receiptNumber: string | null;
    gstAmount: number | null;
    localReceiptData: string | null;
  }) => void;
}

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div>
      <button onClick={onClose}>Close Scanner</button>
    </div>
  );
};
