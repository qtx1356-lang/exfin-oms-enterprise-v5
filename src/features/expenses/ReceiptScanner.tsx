import React, { useRef, useState } from 'react';
import { 
  Camera, 
  Image as ImageIcon, 
  Loader2, 
  AlertTriangle, 
  RotateCcw, 
  Check, 
  X, 
  Edit3,
  Calendar,
  Tag,
  Hash,
  Percent,
  IndianRupee,
  Eye
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ExpenseCategory, EXPENSE_CATEGORIES, ExpenseRecord } from '../../types/expense';

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
    localReceiptData: string;
  }) => void;
}

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  isOpen,
  onClose,
  existingExpenses,
  onConfirm
}) => {
  const [step, setStep] = useState<'source' | 'scanning' | 'unusable_warning' | 'review'>('source');
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermissionError, setCameraPermissionError] = useState<boolean>(false);

  // Extracted values state
  const [merchant, setMerchant] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [category, setCategory] = useState<ExpenseCategory>('Travel');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [gstAmount, setGstAmount] = useState<string>('');
  const [isUsableReason, setIsUsableReason] = useState<string>('');

  // UI edit modes during review
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Duplicate Warning State
  const [duplicateMatch, setDuplicateMatch] = useState<ExpenseRecord | null>(null);
  const [bypassDuplicate, setBypassDuplicate] = useState<boolean>(false);
  const [showDuplicateDetails, setShowDuplicateDetails] = useState<boolean>(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Request Camera Permission check
  const handleCaptureClick = async () => {
    setCameraPermissionError(false);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        cameraInputRef.current?.click();
      } else {
        cameraInputRef.current?.click();
      }
    } catch (err) {
      console.warn('Camera permission denied or unavailable:', err);
      setCameraPermissionError(true);
    }
  };

  // Compress & Load Image
  const processFile = (file: File) => {
    setStep('scanning');
    setError(null);
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
        setBase64Image(compressedDataUrl);
        performOcrScan(compressedDataUrl);
      };
      img.onerror = () => {
        setError("Invalid image file. Please try another.");
        setStep('source');
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      setError("Failed to read file.");
      setStep('source');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Perform AI scan call to Express backend
  const performOcrScan = async (imageBase64: string) => {
    try {
      const response = await fetch('/api/ocr/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' })
      });

      if (!response.ok) {
        throw new Error(await response.text() || 'Scanning failed');
      }

      const data = await response.json();
      console.log('Extracted OCR receipt payload:', data);

      // Populate extracted states
      setMerchant(data.merchant || '');
      setAmount(data.amount ? String(data.amount) : '');
      setDate(data.date || '');
      setReceiptNumber(data.receiptNumber || '');
      setGstAmount(data.taxAmount ? String(data.taxAmount) : '');
      setIsUsableReason(data.isUsableReason || '');

      // Check category suggestion matching our categories
      if (data.category && EXPENSE_CATEGORIES.includes(data.category as ExpenseCategory)) {
        setCategory(data.category as ExpenseCategory);
      } else {
        setCategory('Travel'); // default fallback
      }

      // Check image quality usability
      if (data.isUsable === false) {
        setStep('unusable_warning');
      } else {
        // Run duplicate detection right away
        triggerDuplicateCheck(data.amount, data.date, data.merchant);
        setStep('review');
      }
    } catch (err: any) {
      console.error('OCR scan API error:', err);
      setError(err?.message || 'Failed to scan receipt image.');
      setStep('source');
    }
  };

  // Duplicate Check logic
  const triggerDuplicateCheck = (ocrAmount: number | null, ocrDate: string | null, ocrMerchant: string | null) => {
    if (!ocrAmount || !ocrDate) return;
    
    const duplicate = existingExpenses.find(e => {
      const matchesAmount = Math.abs(e.amount - ocrAmount) < 0.05;
      const matchesDate = e.date === ocrDate;
      const matchesMerchant = !ocrMerchant || !e.merchant || e.merchant.toLowerCase().includes(ocrMerchant.toLowerCase()) || ocrMerchant.toLowerCase().includes(e.merchant.toLowerCase());
      return matchesAmount && matchesDate && matchesMerchant;
    });

    if (duplicate) {
      setDuplicateMatch(duplicate);
      setBypassDuplicate(false);
    } else {
      setDuplicateMatch(null);
    }
  };

  // Re-run duplicate check on field edits
  const handleFieldDuplicateCheck = (currentAmount: string, currentDate: string, currentMerchant: string) => {
    const numAmt = parseFloat(currentAmount);
    if (isNaN(numAmt) || !currentDate) return;
    
    const duplicate = existingExpenses.find(e => {
      const matchesAmount = Math.abs(e.amount - numAmt) < 0.05;
      const matchesDate = e.date === currentDate;
      const matchesMerchant = !currentMerchant || !e.merchant || e.merchant.toLowerCase().includes(currentMerchant.toLowerCase()) || currentMerchant.toLowerCase().includes(e.merchant.toLowerCase());
      return matchesAmount && matchesDate && matchesMerchant;
    });

    if (duplicate) {
      setDuplicateMatch(duplicate);
    } else {
      setDuplicateMatch(null);
    }
  };

  const handleConfirmAndContinue = () => {
    setError(null);
    const numAmount = parseFloat(amount);
    
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('A valid numeric amount greater than ₹0 is required.');
      return;
    }

    if (!date) {
      setError('Date is required. Please select or enter a valid date.');
      return;
    }

    // Pass results to main expense screen form pre-fill
    onConfirm({
      amount: numAmount,
      category,
      date,
      merchant: merchant.trim() || null,
      receiptNumber: receiptNumber.trim() || null,
      gstAmount: gstAmount ? parseFloat(gstAmount) || null : null,
      localReceiptData: base64Image || ''
    });
  };

  const resetScanner = () => {
    setStep('source');
    setBase64Image(null);
    setMerchant('');
    setAmount('');
    setDate('');
    setCategory('Travel');
    setReceiptNumber('');
    setGstAmount('');
    setIsUsableReason('');
    setDuplicateMatch(null);
    setBypassDuplicate(false);
    setShowDuplicateDetails(false);
    setIsEditing(false);
    setError(null);
    setCameraPermissionError(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#211044] border border-purple-500/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-purple-500/20 bg-[#2D1B5A]">
          <h2 className="text-sm font-black uppercase tracking-wider text-purple-200 flex items-center gap-2">
            <Camera className="w-4 h-4 text-purple-400" /> Smart Receipt Scanner
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full text-purple-300 hover:bg-purple-500/20 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {error && (
            <div className="p-3.5 bg-red-500/20 border border-red-500/30 text-red-200 rounded-2xl text-xs font-bold flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: SOURCE SELECTION */}
          {step === 'source' && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 bg-[#2D1B5A] border border-purple-500/30 rounded-3xl flex items-center justify-center mx-auto text-[#A78BFA]">
                <Camera className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-white text-base">Select Receipt Source</h3>
                <p className="text-xs text-purple-300/80 leading-relaxed max-w-sm mx-auto">
                  Scan a digital copy or take a photo of your receipt. Exfin AI will extract the merchant, amount, tax, and categories for you.
                </p>
              </div>

              {cameraPermissionError && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-xl text-xs text-left max-w-sm mx-auto font-semibold">
                  Camera permission is required to take a receipt photo. Please choose a photo from your gallery instead.
                </div>
              )}

              <div className="flex flex-col gap-3 max-w-xs mx-auto pt-2">
                <Button 
                  onClick={handleCaptureClick}
                  className="py-3 bg-[#7C3AED] hover:bg-[#6D28D9] font-bold rounded-2xl flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" /> Take Photo
                </Button>
                
                <Button 
                  onClick={() => galleryInputRef.current?.click()}
                  variant="outline"
                  className="py-3 border-purple-500/30 bg-[#2D1B5A]/40 hover:bg-[#2D1B5A] font-bold text-purple-200 rounded-2xl flex items-center justify-center gap-2"
                >
                  <ImageIcon className="w-4 h-4 text-purple-300" /> Choose from Gallery
                </Button>
              </div>

              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={cameraInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <input 
                type="file" 
                accept="image/*" 
                ref={galleryInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
            </div>
          )}

          {/* STEP 2: SCANNING PROGRESS */}
          {step === 'scanning' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
              <div className="text-center space-y-1">
                <p className="font-extrabold text-white text-sm">Scanning receipt...</p>
                <p className="text-xs text-purple-300/70">Analyzing image quality and extracting data fields</p>
              </div>
            </div>
          )}

          {/* STEP 3: UNUSABLE/BLURRY WARNING */}
          {step === 'unusable_warning' && (
            <div className="space-y-6 text-center py-4">
              <div className="w-14 h-14 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="font-extrabold text-amber-200 text-sm uppercase tracking-wider">Unreadable Receipt</h3>
                <p className="text-xs text-purple-300/80 leading-relaxed">
                  Receipt image is difficult to read. It may be too dark, blurry, or folded.
                </p>
                {isUsableReason && (
                  <p className="text-xs bg-black/30 p-2.5 rounded-xl border border-purple-500/10 italic text-purple-200 text-center max-w-xs mx-auto">
                    "{isUsableReason}"
                  </p>
                )}
              </div>

              <div className="flex gap-3 max-w-sm mx-auto pt-4">
                <Button 
                  onClick={resetScanner} 
                  variant="outline" 
                  className="flex-1 border-purple-500/30 text-purple-200 hover:bg-[#2D1B5A] py-3 rounded-xl font-bold text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retake
                </Button>
                <Button 
                  onClick={() => {
                    triggerDuplicateCheck(parseFloat(amount), date, merchant);
                    setStep('review');
                  }} 
                  className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] py-3 rounded-xl font-bold text-xs"
                >
                  Use Anyway
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW EXTRACTED DETAILS */}
          {step === 'review' && (
            <div className="space-y-4">
              
              {/* Receipt Preview */}
              <div className="relative rounded-2xl overflow-hidden border border-purple-500/20 bg-black/40 h-40 flex items-center justify-center">
                <img src={base64Image || ''} alt="Scanned Receipt" className="w-full h-full object-contain" />
                <div className="absolute top-2 right-2 px-2.5 py-1 bg-black/60 rounded-lg text-[10px] font-bold text-purple-200 border border-purple-500/20">
                  Scanned Copy
                </div>
              </div>

              {/* Duplicate Warning Prompt */}
              {duplicateMatch && !bypassDuplicate && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3">
                  <div className="flex gap-2 items-center text-amber-300 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>Possible duplicate expense detected!</span>
                  </div>
                  <p className="text-[11px] text-purple-200">
                    An existing claim matching this amount (₹{duplicateMatch.amount}) and date ({duplicateMatch.date}) is already filed.
                  </p>
                  
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowDuplicateDetails(!showDuplicateDetails)}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#211044] border border-purple-500/30 text-purple-300 hover:text-white transition flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> {showDuplicateDetails ? 'Hide Duplicate' : 'Review Existing'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBypassDuplicate(true)}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-purple-500/20 border border-purple-500/40 text-purple-200 hover:bg-purple-500/30 transition"
                    >
                      Continue Anyway
                    </button>
                  </div>

                  {showDuplicateDetails && (
                    <div className="p-3 rounded-xl bg-[#2D1B5A] border border-purple-500/20 text-[11px] space-y-1 mt-2">
                      <p className="font-bold text-purple-200">Existing Expense Details:</p>
                      <p><span className="text-purple-300">Amount:</span> ₹{duplicateMatch.amount}</p>
                      <p><span className="text-purple-300">Date:</span> {duplicateMatch.date}</p>
                      <p><span className="text-purple-300">Category:</span> {duplicateMatch.category}</p>
                      <p><span className="text-purple-300">Description:</span> {duplicateMatch.description}</p>
                      <p><span className="text-purple-300">Status:</span> {duplicateMatch.status}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Readonly & Edit UI */}
              <div className="space-y-3.5 bg-[#2D1B5A]/40 p-4 rounded-2xl border border-purple-500/10">
                <div className="flex justify-between items-center pb-2 border-b border-purple-500/15">
                  <span className="text-xs font-extrabold uppercase text-purple-300 tracking-wider">
                    Extracted Values
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-xs font-bold text-purple-300 hover:text-white transition flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#A78BFA]" /> {isEditing ? 'Save Changes' : 'Edit Details'}
                  </button>
                </div>

                {isEditing ? (
                  // Edit form fields
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-purple-300 uppercase flex items-center gap-1">
                        <IndianRupee className="w-3 h-3 text-[#A78BFA]" /> Amount (₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          handleFieldDuplicateCheck(e.target.value, date, merchant);
                        }}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-purple-500/30 bg-[#211044] text-white"
                        placeholder="Required amount"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-purple-300 uppercase flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#A78BFA]" /> Date
                      </label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                          handleFieldDuplicateCheck(amount, e.target.value, merchant);
                        }}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-purple-500/30 bg-[#211044] text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-purple-300 uppercase flex items-center gap-1">
                        <Tag className="w-3 h-3 text-[#A78BFA]" /> Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-purple-500/30 bg-[#211044] text-white"
                      >
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-purple-300 uppercase flex items-center gap-1">
                        Merchant/Vendor
                      </label>
                      <input
                        type="text"
                        value={merchant}
                        onChange={(e) => {
                          setMerchant(e.target.value);
                          handleFieldDuplicateCheck(amount, date, e.target.value);
                        }}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-purple-500/30 bg-[#211044] text-white"
                        placeholder="Optional Merchant"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-purple-300 uppercase flex items-center gap-1">
                          <Percent className="w-3 h-3 text-[#A78BFA]" /> GST (₹)
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={gstAmount}
                          onChange={(e) => setGstAmount(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-purple-500/30 bg-[#211044] text-white"
                          placeholder="Optional GST"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[#A78BFA] uppercase flex items-center gap-1">
                          <Hash className="w-3 h-3 text-[#A78BFA]" /> Receipt #
                        </label>
                        <input
                          type="text"
                          value={receiptNumber}
                          onChange={(e) => setReceiptNumber(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-purple-500/30 bg-[#211044] text-white"
                          placeholder="Receipt Number"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  // Readonly display fields
                  <div className="grid grid-cols-2 gap-y-3.5 gap-x-2">
                    <div>
                      <p className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Amount</p>
                      {amount ? (
                        <p className="text-base font-black text-white">₹{parseFloat(amount).toLocaleString('en-IN')}</p>
                      ) : (
                        <p className="text-xs text-amber-300 italic font-medium mt-0.5">Amount could not be reliably detected.</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Date</p>
                      {date ? (
                        <p className="text-sm font-black text-white mt-0.5">{date}</p>
                      ) : (
                        <p className="text-xs text-amber-300 italic font-medium mt-0.5">Date could not be detected.</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Category</p>
                      <p className="text-xs font-extrabold text-white bg-purple-500/20 px-2.5 py-1 rounded-lg border border-purple-500/10 inline-block mt-1">
                        {category}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Merchant</p>
                      <p className="text-xs font-bold text-purple-200 mt-1 truncate">{merchant || 'Not detected'}</p>
                    </div>

                    {gstAmount && (
                      <div>
                        <p className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">GST</p>
                        <p className="text-xs font-black text-emerald-400 mt-0.5">₹{parseFloat(gstAmount).toLocaleString('en-IN')}</p>
                      </div>
                    )}

                    {receiptNumber && (
                      <div>
                        <p className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Receipt Number</p>
                        <p className="text-xs font-extrabold text-purple-200 mt-0.5">{receiptNumber}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2 border-t border-purple-500/15">
                <Button 
                  onClick={resetScanner} 
                  variant="outline" 
                  className="flex-1 border-purple-500/30 text-purple-300 hover:text-white py-3.5 rounded-2xl font-bold text-xs"
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" /> Retake Receipt
                </Button>
                
                <Button 
                  onClick={handleConfirmAndContinue}
                  className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Confirm & Continue
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
