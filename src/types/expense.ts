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

export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected';

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
  status: ExpenseStatus;
  rejectionReason?: string | null;
  syncStatus: ExpenseSyncStatus;
  createdAtDeviceTime: string;
  serverSyncTime?: string | null;
}
