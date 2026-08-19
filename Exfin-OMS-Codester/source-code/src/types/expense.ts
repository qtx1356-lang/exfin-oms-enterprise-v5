export type ExpenseCategory = 
  | 'Travel'
  | 'Meals & Food'
  | 'Client Entertainment'
  | 'Office Supplies'
  | 'Fuel / Conveyance'
  | 'Lodging'
  | 'Miscellaneous';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Travel',
  'Meals & Food',
  'Client Entertainment',
  'Office Supplies',
  'Fuel / Conveyance',
  'Lodging',
  'Miscellaneous',
];

export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type ExpenseSyncStatus = 'Pending Sync' | 'Synced' | 'Sync Failed';

export interface ExpenseRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  description: string;
  receiptUrl?: string | null;
  localReceiptData?: string | null;
  storagePath?: string | null;
  receiptFileName?: string | null;
  receiptContentType?: string | null;
  receiptSize?: number | null;
  status: ExpenseStatus;
  rejectionReason?: string | null;
  adminRemark?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectedByName?: string | null;
  actionedAt?: string | null;
  actionedBy?: string | null;
  syncStatus: ExpenseSyncStatus;
  createdAtDeviceTime: string;
  serverSyncTime?: string | null;
  merchant?: string | null;
  receiptNumber?: string | null;
  gstAmount?: number | null;
}
