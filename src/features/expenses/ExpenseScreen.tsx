import React, { useEffect, useRef, useState } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
import { 
  ExpenseRecord, 
  ExpenseCategory, 
  ExpenseStatus, 
  EXPENSE_CATEGORIES 
} from '../../types/expense';
import { 
  getStoredExpenseRecords, 
  saveExpenseRecord 
} from '../../services/expenses/expenseStorage';
import { 
  syncPendingExpenseRecords, 
  startExpenseAutoSyncEngine 
} from '../../services/expenses/expenseSyncEngine';

import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';

import { 
  Wallet, 
  Plus, 
  Camera, 
  Paperclip, 
  WifiOff, 
  Wifi, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye, 
  X, 
  ZoomIn, 
  Car, 
  Utensils, 
  Briefcase, 
  ShoppingBag, 
  Fuel, 
  Hotel, 
  MoreHorizontal,
  Calendar,
  IndianRupee,
  Receipt
} from 'lucide-react';

export const ExpenseScreen: React.FC = () => {
  const { employeeData } = useRegistration();
  const empCode = employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN';
  const empName = employeeData?.name || 'Employee';

  // Network & Sync States
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  
  // Expense Data
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Submit Modal & Form
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState<ExpenseCategory>('Travel');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Receipt Preview Modal
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Connectivity Listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const cleanupSync = startExpenseAutoSyncEngine();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      cleanupSync();
    };
  }, []);

  // Sync Engine Trigger & Local / Firestore Merging
  const loadAndMergeExpenses = () => {
    const local = getStoredExpenseRecords().filter(
      (r) => r.employeeCode === empCode || r.employeeId === empCode
    );

    if (!db || !isOnline) {
      setExpenses(local);
      return;
    }

    const q = query(
      collection(db, 'expenses'),
      where('employeeCode', '==', empCode),
      orderBy('createdAtDeviceTime', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const firestoreList: ExpenseRecord[] = [];
        snapshot.forEach((docSnap) => {
          firestoreList.push({ id: docSnap.id, ...docSnap.data() } as ExpenseRecord);
        });

        // Merge local pending with Firestore
        const mergedMap = new Map<string, ExpenseRecord>();
        
        // Put Firestore items first
        firestoreList.forEach((item) => mergedMap.set(item.id, item));
        
        // Put local items if not already in Firestore or if local is pending
        local.forEach((item) => {
          if (!mergedMap.has(item.id) || item.syncStatus === 'Pending Sync') {
            mergedMap.set(item.id, item);
          }
        });

        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime()
        );

        setExpenses(merged);
      },
      (err) => {
        console.warn('Expense Firestore snapshot error:', err);
        setExpenses(local);
      }
    );

    return unsub;
  };

  useEffect(() => {
    const unsub = loadAndMergeExpenses();
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [empCode, isOnline]);

  // Handle Manual Sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    await syncPendingExpenseRecords();
    setIsSyncing(false);
    loadAndMergeExpenses();
  };

  // Capture & Compress Image
  const handleReceiptCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 900;
          const MAX_HEIGHT = 900;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with 0.75 quality
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          setReceiptUrl(compressedDataUrl);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Expense Form
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid amount greater than ₹0.');
      return;
    }

    if (!category) {
      setFormError('Please select an expense category.');
      return;
    }

    if (!date) {
      setFormError('Please select a date.');
      return;
    }

    if (!description.trim()) {
      setFormError('Please enter a description for the expense.');
      return;
    }

    setIsSubmitting(true);

    try {
      const expenseId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const newRecord: ExpenseRecord = {
        id: expenseId,
        employeeId: empCode,
        employeeName: empName,
        employeeCode: empCode,
        amount: numAmount,
        category,
        date,
        description: description.trim(),
        receiptUrl: receiptUrl || null,
        status: 'Pending',
        rejectionReason: null,
        syncStatus: 'Pending Sync',
        createdAtDeviceTime: new Date().toISOString(),
      };

      // Save locally first (Mandatory Offline First requirement)
      saveExpenseRecord(newRecord);

      // Attempt automatic sync if online
      if (navigator.onLine) {
        await syncPendingExpenseRecords();
      }

      // Reset form & state
      setAmount('');
      setCategory('Travel');
      setDate(new Date().toISOString().split('T')[0]);
      setDescription('');
      setReceiptUrl(null);
      setIsModalOpen(false);
      loadAndMergeExpenses();
    } catch (err: any) {
      console.error('Error submitting expense:', err);
      setFormError(err.message || 'Failed to submit expense. Saved locally.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate Totals
  const totalSubmitted = expenses.reduce((acc, curr) => acc + curr.amount, 0);
  const totalPending = expenses
    .filter((e) => e.status === 'Pending')
    .reduce((acc, curr) => acc + curr.amount, 0);
  const totalApproved = expenses
    .filter((e) => e.status === 'Approved')
    .reduce((acc, curr) => acc + curr.amount, 0);

  // Filtered Expenses
  const filteredExpenses = expenses.filter((e) => {
    const matchesStatus = statusFilter === 'All' || e.status === statusFilter;
    const matchesCategory = categoryFilter === 'All' || e.category === categoryFilter;
    const matchesDate = !dateFilter || e.date.includes(dateFilter);
    return matchesStatus && matchesCategory && matchesDate;
  });

  const getCategoryIcon = (cat: ExpenseCategory) => {
    switch (cat) {
      case 'Travel': return Car;
      case 'Meals & Food': return Utensils;
      case 'Client Entertainment': return ShoppingBag;
      case 'Office Supplies': return Briefcase;
      case 'Fuel / Conveyance': return Fuel;
      case 'Lodging': return Hotel;
      default: return MoreHorizontal;
    }
  };

  const pendingSyncCount = expenses.filter((e) => e.syncStatus === 'Pending Sync').length;

  return (
    <div className="flex flex-col gap-5 pb-12 text-white">
      {/* Top Bar with Offline/Sync Indicator */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-[#A78BFA]" /> Expense Claims
          </h1>
          <p className="text-xs text-purple-300/80 font-medium mt-0.5">
            Submit & track enterprise reimbursement requests
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isOnline ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <WifiOff className="w-3.5 h-3.5" /> OFFLINE
            </span>
          ) : pendingSyncCount > 0 ? (
            <button 
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/30 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} /> 
              {isSyncing ? 'Syncing...' : `${pendingSyncCount} Pending Sync`}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Synced
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3.5 bg-[#2D1B5A] border border-purple-500/20 shadow-lg flex flex-col justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300/80">
            Total Submitted
          </p>
          <p className="text-lg font-black text-white mt-1 tracking-tight">
            ₹{totalSubmitted.toLocaleString('en-IN')}
          </p>
        </Card>

        <Card className="p-3.5 bg-[#2D1B5A] border border-amber-500/30 shadow-lg flex flex-col justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
            Pending
          </p>
          <p className="text-lg font-black text-amber-300 mt-1 tracking-tight">
            ₹{totalPending.toLocaleString('en-IN')}
          </p>
        </Card>

        <Card className="p-3.5 bg-[#2D1B5A] border border-emerald-500/30 shadow-lg flex flex-col justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
            Approved
          </p>
          <p className="text-lg font-black text-emerald-400 mt-1 tracking-tight">
            ₹{totalApproved.toLocaleString('en-IN')}
          </p>
        </Card>
      </div>

      {/* Primary Submit Button */}
      <div>
        <Button 
          onClick={() => setIsModalOpen(true)} 
          className="w-full py-3.5 text-sm font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9]"
        >
          <Plus className="w-5 h-5" /> Submit Expense Claim
        </Button>
      </div>

      {/* Filters Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider">
            Filter History
          </span>
          {dateFilter && (
            <button 
              onClick={() => setDateFilter('')} 
              className="text-[11px] font-bold text-purple-300 hover:underline"
            >
              Clear Date Filter
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {['All', 'Pending', 'Approved', 'Rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                statusFilter === status
                  ? 'bg-[#7C3AED] text-white border-purple-400/50 shadow-md'
                  : 'bg-[#211044] text-purple-300/80 border-purple-500/20 hover:bg-[#2D1B5A]'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
          >
            <option value="All">All Categories</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
          />
        </div>
      </div>

      {/* Expense History List */}
      <div className="space-y-3">
        <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider">
          Expense Records ({filteredExpenses.length})
        </h2>

        {filteredExpenses.length > 0 ? (
          filteredExpenses.map((expense) => {
            const CategoryIcon = getCategoryIcon(expense.category);

            return (
              <Card 
                key={expense.id} 
                className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-md hover:border-purple-500/40 transition-all space-y-3"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#211044] border border-purple-500/30 flex items-center justify-center text-[#A78BFA] flex-shrink-0">
                      <CategoryIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-white">{expense.category}</span>
                        {expense.receiptUrl && (
                          <button
                            onClick={() => {
                              setPreviewReceipt(expense.receiptUrl!);
                              setZoomScale(1);
                            }}
                            className="p-1 rounded-md bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
                            title="View Attached Receipt"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-purple-300/70 font-medium">
                        {expense.date} • Code: {expense.employeeCode}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-black text-white">
                      ₹{expense.amount.toLocaleString('en-IN')}
                    </p>
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      {/* Status Chip */}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        expense.status === 'Approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : expense.status === 'Rejected'
                          ? 'bg-red-500/20 text-red-300 border-red-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}>
                        {expense.status}
                      </span>

                      {/* Sync Status Chip */}
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                        expense.syncStatus === 'Synced'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-purple-500/20 text-purple-200 border-purple-500/30'
                      }`}>
                        {expense.syncStatus === 'Pending Sync' ? 'Saved Offline' : expense.syncStatus}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 text-xs text-purple-200/90 leading-relaxed">
                  {expense.description}
                </div>

                {/* Rejection Reason Alert if Rejected */}
                {expense.status === 'Rejected' && expense.rejectionReason && (
                  <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-xs text-red-200">
                    <span className="font-bold text-red-300">Rejected Reason: </span>
                    {expense.rejectionReason}
                  </div>
                )}
              </Card>
            );
          })
        ) : (
          <div className="py-8 bg-[#211044] rounded-2xl border border-dashed border-purple-500/20">
            <EmptyState
              icon={Receipt}
              title="No expense claims found"
              description="You haven't submitted any expense claims matching the criteria yet."
            />
          </div>
        )}
      </div>

      {/* Submit Expense Form Modal */}
      <Dialog 
        isOpen={isModalOpen} 
        onClose={() => !isSubmitting && setIsModalOpen(false)} 
        title="Submit Expense Claim"
      >
        <form onSubmit={handleSubmitExpense} className="space-y-4">
          
          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-[#A78BFA]" /> Amount (₹)
            </label>
            <input
              type="number"
              min="1"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1500"
              required
              className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-[#A78BFA]" /> Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              required
              className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#A78BFA]" /> Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe purpose of expense..."
              rows={3}
              required
              className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-[#A78BFA]" /> Receipt Image (Optional)
            </label>
            
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleReceiptCapture}
              className="hidden"
            />

            {!receiptUrl ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-purple-500/30 bg-[#211044]/60 hover:bg-[#211044] rounded-2xl p-4 flex items-center justify-center gap-2 text-xs font-semibold text-purple-200 transition-colors"
              >
                <Camera className="w-4 h-4 text-[#A78BFA]" /> Tap to attach camera or gallery receipt
              </button>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-purple-500/30 h-32 bg-black/40">
                <img src={receiptUrl} alt="Receipt Preview" className="w-full h-full object-contain" />
                <button
                  type="button"
                  onClick={() => setReceiptUrl(null)}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {formError && (
            <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-2xl text-xs font-bold text-center">
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant="text" 
              onClick={() => setIsModalOpen(false)} 
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting} 
              className="flex-1 py-3 bg-[#7C3AED] hover:bg-[#6D28D9] font-bold rounded-2xl"
            >
              {isSubmitting ? 'Saving Claim...' : 'Submit Claim'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Receipt Preview Modal */}
      <Dialog 
        isOpen={!!previewReceipt} 
        onClose={() => setPreviewReceipt(null)} 
        title="Receipt Image Preview"
      >
        {previewReceipt && (
          <div className="space-y-4">
            <div className="relative max-h-[60vh] overflow-auto bg-black/60 rounded-2xl border border-purple-500/30 p-2 flex items-center justify-center">
              <img 
                src={previewReceipt} 
                alt="Receipt" 
                style={{ transform: `scale(${zoomScale})` }}
                className="max-w-full h-auto object-contain transition-transform duration-200 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-purple-300">Zoom:</span>
                {[1, 1.5, 2].map((scale) => (
                  <button
                    key={scale}
                    onClick={() => setZoomScale(scale)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all border ${
                      zoomScale === scale
                        ? 'bg-[#7C3AED] text-white border-purple-400'
                        : 'bg-[#211044] text-purple-300 border-purple-500/20'
                    }`}
                  >
                    {scale}x
                  </button>
                ))}
              </div>

              <Button onClick={() => setPreviewReceipt(null)}>Close Preview</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
