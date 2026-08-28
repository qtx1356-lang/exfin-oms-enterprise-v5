import React, { useRef, useState } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { 
  ExpenseRecord, 
  ExpenseCategory, 
  ExpenseStatus, 
  EXPENSE_CATEGORIES 
} from '../../types/expense';

import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ReceiptScanner } from './ReceiptScanner';

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
  const { expenses: realtimeExpenses, isOnline, syncState, updateExpenseOptimistically, triggerManualSync } = useRealtimeSync();

  const empCode = employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN';
  const empName = employeeData?.name || 'Employee';

  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Expense Data
  const expenses = realtimeExpenses.filter(
    (r) => r.employeeCode === empCode || r.employeeId === empCode
  );
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Submit Modal & Form
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>('');
  
  // Scanner Modal Visibility & Scanned Metadata States
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [scannedMerchant, setScannedMerchant] = useState<string | null>(null);
  const [scannedReceiptNum, setScannedReceiptNum] = useState<string | null>(null);
  const [scannedGstAmount, setScannedGstAmount] = useState<number | null>(null);
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

  // Handle Manual Sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    await triggerManualSync();
    setIsSyncing(false);
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
        receiptUrl: null, // Don't put Base64 in receiptUrl (saved for Storage download URL)
        localReceiptData: receiptUrl || null, // Keep Base64 locally for preview & pending upload
        receiptFileName: receiptUrl ? `receipt_${expenseId}.jpg` : null,
        receiptContentType: receiptUrl ? 'image/jpeg' : null,
        receiptSize: receiptUrl ? Math.round(receiptUrl.length * 0.75) : null,
        status: 'Pending',
        rejectionReason: null,
        syncStatus: 'Pending Sync',
        createdAtDeviceTime: new Date().toISOString(),
        merchant: scannedMerchant,
        receiptNumber: scannedReceiptNum,
        gstAmount: scannedGstAmount,
      };

      // Optimistically update central state and queue background sync
      await updateExpenseOptimistically(newRecord);

      // Reset form & state
      setAmount('');
      setCategory('Travel');
      setDate(new Date().toISOString().split('T')[0]);
      setDescription('');
      setReceiptUrl(null);
      setScannedMerchant(null);
      setScannedReceiptNum(null);
      setScannedGstAmount(null);
      setIsModalOpen(false);
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
    <div className="flex flex-col gap-5 pb-12 text-[#FFFFFF] max-w-5xl mx-auto font-sans">
      {/* Top Bar with Offline/Sync Indicator */}
      <div className="flex items-center justify-between pt-2 pb-2 border-b border-[#292929]">
        <div>
          <h1 className="text-2xl font-black text-[#FFFFFF] tracking-tight flex items-center gap-2">
            <Wallet className="w-7 h-7 text-[#D4AF37]" /> Expense Claims
          </h1>
          <p className="text-xs text-[#8A8A8A] font-medium mt-0.5">
            Submit & track reimbursement requests in Indian Rupees (₹)
          </p>
        </div>

        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 bg-[#151515] border border-[#292929] shadow-lg flex flex-col justify-between rounded-2xl">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#8A8A8A]">
            Total Submitted
          </p>
          <p className="text-xl font-black text-[#FFFFFF] mt-1 tracking-tight font-mono">
            ₹{totalSubmitted.toLocaleString('en-IN')}
          </p>
        </Card>

        <Card className="p-4 bg-[#151515] border border-[#292929] shadow-lg flex flex-col justify-between rounded-2xl">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
            Pending
          </p>
          <p className="text-xl font-black text-amber-400 mt-1 tracking-tight font-mono">
            ₹{totalPending.toLocaleString('en-IN')}
          </p>
        </Card>

        <Card className="p-4 bg-[#151515] border border-[#292929] shadow-lg flex flex-col justify-between rounded-2xl">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
            Approved
          </p>
          <p className="text-xl font-black text-emerald-400 mt-1 tracking-tight font-mono">
            ₹{totalApproved.toLocaleString('en-IN')}
          </p>
        </Card>
      </div>

      {/* Primary Actions Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Button 
          onClick={() => {
            setScannedMerchant(null);
            setScannedReceiptNum(null);
            setScannedGstAmount(null);
            setIsModalOpen(true);
          }} 
          className="py-3.5 text-sm font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-[#E6C766] text-[#080808]"
        >
          <Plus className="w-5 h-5" /> Enter Manually
        </Button>
        <Button 
          onClick={() => setIsScannerOpen(true)} 
          className="py-3.5 text-sm font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 bg-[#1B1B1B] hover:bg-[#292929] text-[#FFFFFF] border border-[#292929]"
        >
          <Camera className="w-5 h-5 text-[#D4AF37]" /> Scan Receipt
        </Button>
      </div>

      {/* Filters Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-[#D4AF37] uppercase tracking-wider">
            Filter History
          </span>
          {dateFilter && (
            <button 
              onClick={() => setDateFilter('')} 
              className="text-[11px] font-bold text-[#D4AF37] hover:underline"
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
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                statusFilter === status
                  ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] shadow-md'
                  : 'bg-[#151515] text-[#8A8A8A] border-[#292929] hover:bg-[#1B1B1B] hover:text-[#FFFFFF]'
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
            className="w-full px-3 py-2 rounded-xl border border-[#292929] bg-[#101010] text-[#FFFFFF] text-xs font-semibold focus:outline-none focus:border-[#D4AF37]"
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
            className="w-full px-3 py-2 rounded-xl border border-[#292929] bg-[#101010] text-[#FFFFFF] text-xs font-semibold focus:outline-none focus:border-[#D4AF37]"
          />
        </div>
      </div>

      {/* Expense History List */}
      <div className="space-y-3">
        <h2 className="text-xs font-extrabold text-[#D4AF37] uppercase tracking-wider">
          Expense Records ({filteredExpenses.length})
        </h2>

        {filteredExpenses.length > 0 ? (
          filteredExpenses.map((expense) => {
            const CategoryIcon = getCategoryIcon(expense.category);

            return (
              <Card 
                key={expense.id} 
                className="p-4 bg-[#151515] border border-[#292929] shadow-md hover:border-[#D4AF37]/50 transition-all space-y-3 text-[#FFFFFF]"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#1B1B1B] border border-[#292929] flex items-center justify-center text-[#D4AF37] flex-shrink-0">
                      <CategoryIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-[#FFFFFF]">{expense.category}</span>
                        {(expense.receiptUrl || expense.localReceiptData) && (
                          <button
                            onClick={() => {
                              setPreviewReceipt((expense.receiptUrl || expense.localReceiptData)!);
                              setZoomScale(1);
                            }}
                            className="p-1 rounded-md bg-[#1B1B1B] text-[#FFFFFF] hover:text-[#D4AF37] border border-[#292929] transition-colors cursor-pointer"
                            title="View Attached Receipt"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-[#D4AF37]" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8A8A8A] font-medium">
                        {expense.date} • Code: {expense.employeeCode}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-black text-[#FFFFFF]">
                      ₹{expense.amount.toLocaleString('en-IN')}
                    </p>
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      {/* Status Chip */}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        expense.status === 'Approved'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : expense.status === 'Rejected'
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}>
                        {expense.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#101010] p-2.5 rounded-xl border border-[#292929] text-xs text-[#8A8A8A] leading-relaxed">
                  {expense.description}
                </div>

                {/* Rejection Reason Alert if Rejected */}
                {expense.status === 'Rejected' && expense.rejectionReason && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                    <span className="font-bold text-rose-400">Rejected Reason: </span>
                    {expense.rejectionReason}
                  </div>
                )}
              </Card>
            );
          })
        ) : (
          <div className="py-8 bg-[#151515] rounded-2xl border border-dashed border-[#292929]">
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
            <label className="text-xs font-bold text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-[#18C98F]" /> Amount (₹)
            </label>
            <input
              type="number"
              min="1"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1500"
              required
              className="w-full px-4 py-3 rounded-2xl border border-[#3A4148] bg-[#111417] text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-[#18C98F]" /> Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              required
              className="w-full px-4 py-3 rounded-2xl border border-[#3A4148] bg-[#111417] text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#18C98F]" /> Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-2xl border border-[#3A4148] bg-[#111417] text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe purpose of expense..."
              rows={3}
              required
              className="w-full px-4 py-3 rounded-2xl border border-[#3A4148] bg-[#111417] text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Scanned metadata details preview if present */}
          {(scannedMerchant || scannedReceiptNum || scannedGstAmount) && (
            <div className="p-2.5 bg-[#1D2329] rounded-xl border border-[#3A4148] text-[11px] space-y-1">
              <div className="font-bold text-emerald-300 flex items-center justify-between">
                <span>Scanned Receipt Details</span>
                <span className="text-[10px] text-[#B7C0BC]/70 font-normal">Verified via Scanner</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[#B7C0BC]/90 pt-1">
                {scannedMerchant && (
                  <div><span className="text-[#18C98F] font-semibold">Vendor:</span> {scannedMerchant}</div>
                )}
                {scannedReceiptNum && (
                  <div><span className="text-[#18C98F] font-semibold">Bill #:</span> {scannedReceiptNum}</div>
                )}
                {scannedGstAmount !== null && scannedGstAmount !== undefined && (
                  <div><span className="text-[#18C98F] font-semibold">GST:</span> ₹{scannedGstAmount}</div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#B7C0BC] uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#18C98F]" /> Receipt Image {receiptUrl ? '(Attached)' : '(Optional)'}
              </span>
              {receiptUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsScannerOpen(true);
                  }}
                  className="text-[11px] font-bold text-[#18C98F] hover:text-white underline cursor-pointer"
                >
                  Rescan with Camera
                </button>
              )}
            </label>
            
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleReceiptCapture}
              className="hidden"
            />

            {!receiptUrl ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsScannerOpen(true);
                  }}
                  className="border-2 border-dashed border-[#3A4148] hover:border-emerald-500/60 bg-[#1D2329]/40 hover:bg-[#1D2329] rounded-2xl p-3 flex flex-col items-center justify-center gap-1 text-xs font-semibold text-[#B7C0BC] transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span className="text-[11px] font-bold text-white">Scan with Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#3A4148] hover:border-emerald-500/60 bg-[#1D2329]/40 hover:bg-[#1D2329] rounded-2xl p-3 flex flex-col items-center justify-center gap-1 text-xs font-semibold text-[#B7C0BC] transition-colors cursor-pointer"
                >
                  <Paperclip className="w-4 h-4 text-[#B7C0BC]/60" />
                  <span className="text-[11px] font-bold text-white">Upload File / Photo</span>
                </button>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-[#3A4148] h-32 bg-black/40">
                <img src={receiptUrl} alt="Receipt Preview" className="w-full h-full object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    setReceiptUrl(null);
                    setScannedMerchant(null);
                    setScannedReceiptNum(null);
                    setScannedGstAmount(null);
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600 transition-colors cursor-pointer"
                  title="Remove Attached Receipt"
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
              className="flex-1 py-3 bg-[#18C98F] hover:bg-[#10966D] text-[#0B0D0F] font-bold rounded-2xl"
            >
              {isSubmitting ? 'Saving Claim...' : 'Submit Claim'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Receipt Scanner Component */}
      <ReceiptScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        existingExpenses={expenses}
        onConfirm={({ amount, category, date, merchant, receiptNumber, gstAmount, localReceiptData }) => {
          setAmount(String(amount));
          setCategory(category);
          setDate(date);
          setScannedMerchant(merchant);
          setScannedReceiptNum(receiptNumber);
          setScannedGstAmount(gstAmount);
          setReceiptUrl(localReceiptData);
          if (!description.trim()) {
            setDescription(merchant ? `${category} - ${merchant}` : `${category} claim with scanned receipt`);
          }
          setIsScannerOpen(false);
          setIsModalOpen(true);
        }}
      />

      {/* Receipt Preview Modal */}
      <Dialog 
        isOpen={!!previewReceipt} 
        onClose={() => setPreviewReceipt(null)} 
        title="Receipt Image Preview"
      >
        {previewReceipt && (
          <div className="space-y-4">
            <div className="relative max-h-[60vh] overflow-auto bg-black/60 rounded-2xl border border-[#3A4148] p-2 flex items-center justify-center">
              <img 
                src={previewReceipt} 
                alt="Receipt" 
                style={{ transform: `scale(${zoomScale})` }}
                className="max-w-full h-auto object-contain transition-transform duration-200 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#B7C0BC]">Zoom:</span>
                {[1, 1.5, 2].map((scale) => (
                  <button
                    key={scale}
                    onClick={() => setZoomScale(scale)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all border ${
                      zoomScale === scale
                        ? 'bg-[#18C98F] text-[#0B0D0F] border-[#18C98F]'
                        : 'bg-[#1D2329] text-[#B7C0BC] border-[#3A4148]'
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
