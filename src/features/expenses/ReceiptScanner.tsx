import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExpenseRecord, ExpenseCategory, EXPENSE_CATEGORIES } from '../../types/expense';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import {
  Camera,
  RefreshCw,
  X,
  Check,
  RotateCcw,
  Upload,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  IndianRupee,
  Calendar,
  Briefcase,
  Store,
  FileText,
  Percent,
  Sparkles,
  SwitchCamera
} from 'lucide-react';

interface ReceiptScannerProps {
  isOpen: boolean;
  onClose: () => void;
  existingExpenses?: ExpenseRecord[];
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

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  // Video & Stream references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputGalleryRef = useRef<HTMLInputElement | null>(null);

  // Scanner UI States
  const [cameraState, setCameraState] = useState<'idle' | 'requesting' | 'streaming' | 'captured' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);

  // Captured Image & Review Fields
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState<ExpenseCategory>('Meals & Food');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [merchant, setMerchant] = useState<string>('');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [gstAmount, setGstAmount] = useState<string>('');
  const [formValidation, setFormValidation] = useState<string | null>(null);

  // Stop camera tracks safely
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Check available camera devices
  const checkCameraDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoDevices.length > 1);
      }
    } catch (e) {
      console.warn('Error enumerating devices:', e);
    }
  }, []);

  // Start live camera stream
  const startCamera = useCallback(async () => {
    stopCamera();
    setErrorMessage(null);
    setCameraState('requesting');

    // Median / Web Chrome permission check
    const win = window as any;
    if (win.median?.permissions?.requestCamera) {
      try {
        await win.median.permissions.requestCamera();
      } catch (medErr) {
        console.warn('Median camera permission request:', medErr);
      }
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('Direct camera stream is not supported in this browser environment. Please use the System Camera or Gallery fallback below.');
      setCameraState('error');
      return;
    }

    try {
      // First attempt with environment (rear) camera
      let constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        console.warn('Failed with ideal constraints, trying standard video: true...', firstErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS/Android WebView inline playback
        videoRef.current.muted = true;
        await videoRef.current.play();
        setCameraState('streaming');
        checkCameraDevices();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      let msg = 'Could not access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. You can enable camera in app permissions or use the System Camera / File Picker fallback below.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera hardware found on this device. Please use the Gallery / File upload option.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is already in use by another application. Please close other camera apps and retry.';
      } else {
        msg = err.message || 'Camera initialization failed. Please use the fallback buttons below.';
      }
      setErrorMessage(msg);
      setCameraState('error');
    }
  }, [facingMode, stopCamera, checkCameraDevices]);

  // Handle open / close lifecycle
  useEffect(() => {
    if (isOpen) {
      // Reset state for new scan session
      setCapturedImage(null);
      setZoomScale(1);
      setAmount('');
      setCategory('Meals & Food');
      setDate(new Date().toISOString().split('T')[0]);
      setMerchant('');
      setReceiptNumber('');
      setGstAmount('');
      setFormValidation(null);
      setErrorMessage(null);

      // Start camera automatically
      startCamera();
    } else {
      stopCamera();
      setCameraState('idle');
      setCapturedImage(null);
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Process and compress image to data URL
  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          stopCamera();
          setCapturedImage(compressedDataUrl);
          setCameraState('captured');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Capture frame from live video stream
  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;

    try {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch {}

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;

    // Constrain max dimensions for storage & performance
    const MAX_DIM = 1200;
    let width = videoWidth;
    let height = videoHeight;

    if (width > height) {
      if (width > MAX_DIM) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      }
    } else {
      if (height > MAX_DIM) {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      stopCamera();
      setCapturedImage(dataUrl);
      setCameraState('captured');
    }
  };

  // Retake / discard captured image
  const handleRetake = () => {
    setCapturedImage(null);
    setZoomScale(1);
    setFormValidation(null);
    startCamera();
  };

  // Switch between rear and front cameras
  const handleToggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Handle native file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    // Reset file input so same file can be reselected if needed
    e.target.value = '';
  };

  // Confirm and pass data back to Expense form
  const handleConfirmReceipt = () => {
    setFormValidation(null);
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormValidation('Please enter a valid expense amount in ₹ (e.g. 450).');
      return;
    }

    if (!category) {
      setFormValidation('Please select an expense category.');
      return;
    }

    if (!date) {
      setFormValidation('Please select the receipt date.');
      return;
    }

    const parsedGst = gstAmount.trim() ? parseFloat(gstAmount) : null;

    onConfirm({
      amount: parsedAmount,
      category,
      date,
      merchant: merchant.trim() || null,
      receiptNumber: receiptNumber.trim() || null,
      gstAmount: isNaN(parsedGst as number) ? null : parsedGst,
      localReceiptData: capturedImage,
    });
  };

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="Receipt Scanner"
    >
      <div className="space-y-4 max-w-lg mx-auto text-white" id="receipt-scanner-container">
        
        {/* Hidden Fallback Inputs for Median / Native Android Camera & Gallery */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputCameraRef}
          onChange={handleFileInputChange}
          className="hidden"
          id="native-camera-input"
        />
        <input
          type="file"
          accept="image/*"
          ref={fileInputGalleryRef}
          onChange={handleFileInputChange}
          className="hidden"
          id="native-gallery-input"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* ------------------------------------------------------------- */}
        {/* 1. LIVE CAMERA VIEWFINDER MODE                                */}
        {/* ------------------------------------------------------------- */}
        {cameraState !== 'captured' && (
          <div className="space-y-3">
            <div className="relative bg-[#111417] rounded-2xl overflow-hidden border border-[#3A4148] aspect-[3/4] max-h-[58vh] flex items-center justify-center shadow-2xl">
              
              {/* Video Element */}
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className={`w-full h-full object-cover transition-opacity duration-200 ${
                  cameraState === 'streaming' ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Scanning Target Guide Overlay */}
              {cameraState === 'streaming' && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                  {/* Guide Frame Corners */}
                  <div className="relative w-full h-[78%] border-2 border-dashed border-emerald-400/70 rounded-2xl flex flex-col justify-between p-3 bg-emerald-500/[0.03]">
                    <div className="flex justify-between">
                      <div className="w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                      <div className="w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                    </div>
                    <div className="text-center">
                      <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[11px] font-bold text-emerald-300 border border-emerald-400/40">
                        Align Receipt within Box
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <div className="w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                      <div className="w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                    </div>
                  </div>
                </div>
              )}

              {/* Camera Requesting / Loading State */}
              {cameraState === 'requesting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#111417]/90">
                  <div className="w-12 h-12 rounded-full bg-[#1D2329] border border-[#3A4148] flex items-center justify-center animate-pulse">
                    <Camera className="w-6 h-6 text-[#B7C0BC]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Starting Camera Scanner...</h3>
                    <p className="text-xs text-[#B7C0BC]/70 mt-1">Please allow camera permissions if prompted</p>
                  </div>
                  <RefreshCw className="w-5 h-5 text-[#18C98F] animate-spin mt-2" />
                </div>
              )}

              {/* Camera Error / Fallback State */}
              {cameraState === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#111417]">
                  <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-rose-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Camera Access Notice</h3>
                    <p className="text-xs text-[#B7C0BC]/80 mt-1 max-w-xs leading-relaxed">
                      {errorMessage || 'Unable to open live camera stream.'}
                    </p>
                  </div>

                  <div className="w-full flex flex-col gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => fileInputCameraRef.current?.click()}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow border border-[#3A4148] flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Take Photo with System Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputGalleryRef.current?.click()}
                      className="w-full py-2.5 px-4 bg-[#1D2329]/60 hover:bg-[#1D2329] text-[#B7C0BC] hover:text-white font-bold text-xs rounded-xl border border-[#3A4148] flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Choose from Gallery / Files</span>
                    </button>

                    <button
                      type="button"
                      onClick={startCamera}
                      className="text-xs text-[#B7C0BC]/80 hover:text-[#B7C0BC] underline mt-1"
                    >
                      Retry Live Camera
                    </button>
                  </div>
                </div>
              )}

              {/* Viewfinder Controls (Switch Camera) */}
              {cameraState === 'streaming' && hasMultipleCameras && (
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  className="absolute top-3 right-3 p-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full border border-emerald-500/60 text-[#B7C0BC] hover:text-white shadow-lg cursor-pointer transition-all"
                  title="Switch Camera"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Shutter & Fallback Buttons Bar */}
            {cameraState === 'streaming' && (
              <div className="flex items-center justify-between gap-3 pt-1">
                {/* Gallery Button */}
                <button
                  type="button"
                  onClick={() => fileInputGalleryRef.current?.click()}
                  className="flex-1 py-3 px-3 bg-[#1D2329] hover:bg-[#252C34] active:bg-[#1D2329] border border-[#3A4148] rounded-2xl flex flex-col items-center justify-center gap-1 text-[#B7C0BC] hover:text-white transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-[#18C98F]" />
                  <span className="text-[10px] font-bold">Gallery</span>
                </button>

                {/* Primary Shutter Button */}
                <button
                  type="button"
                  id="shutter-capture-button"
                  onClick={handleCaptureSnapshot}
                  className="w-16 h-16 rounded-full bg-[#18C98F] hover:bg-[#10966D] active:scale-95 shadow-xl shadow-emerald-950/60 border-4 border-white/80 flex items-center justify-center cursor-pointer transition-transform"
                  title="Capture Receipt Photo"
                >
                  <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white" />
                </button>

                {/* Native System Camera Button */}
                <button
                  type="button"
                  onClick={() => fileInputCameraRef.current?.click()}
                  className="flex-1 py-3 px-3 bg-[#1D2329] hover:bg-[#252C34] active:bg-[#1D2329] border border-[#3A4148] rounded-2xl flex flex-col items-center justify-center gap-1 text-[#B7C0BC] hover:text-white transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-bold">Native App</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 2. CAPTURED IMAGE PREVIEW & DETAILS REVIEW MODE               */}
        {/* ------------------------------------------------------------- */}
        {cameraState === 'captured' && capturedImage && (
          <div className="space-y-4">
            {/* Captured Image Preview with Zoom Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400" /> Captured Receipt Preview
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setZoomScale((s) => Math.max(0.75, s - 0.25))}
                    className="p-1 bg-[#1D2329] hover:bg-[#252C34] text-[#B7C0BC] rounded text-xs"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono text-[#B7C0BC] w-10 text-center">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomScale((s) => Math.min(2.5, s + 0.25))}
                    className="p-1 bg-[#1D2329] hover:bg-[#252C34] text-[#B7C0BC] rounded text-xs"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="relative bg-[#111417] rounded-2xl overflow-hidden border border-[#3A4148] h-48 max-h-52 flex items-center justify-center p-1">
                <img
                  src={capturedImage}
                  alt="Scanned Receipt"
                  style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center' }}
                  className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-150"
                />
                
                {/* Retake Pill in Preview */}
                <button
                  type="button"
                  id="btn-retake-receipt"
                  onClick={handleRetake}
                  className="absolute bottom-2 right-2 px-3 py-1.5 bg-black/70 hover:bg-black/90 backdrop-blur-md text-[#B7C0BC] hover:text-white rounded-full border border-emerald-500/60 text-xs font-bold flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Retake</span>
                </button>
              </div>
            </div>

            {/* Quick Review Form Fields */}
            <div className="bg-[#1D2329] p-4 rounded-2xl border border-[#3A4148] space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-[#3A4148]/60">
                <span className="text-xs font-black text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Receipt Details Verification
                </span>
                <span className="text-[10px] text-[#B7C0BC]/70">Review before confirming</span>
              </div>

              {/* Amount & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#B7C0BC] uppercase flex items-center gap-1">
                    <IndianRupee className="w-3 h-3 text-emerald-400" /> Amount (₹) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="scanned-receipt-amount"
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 550"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-[#3A4148] bg-[#111417] text-white text-xs font-bold focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#B7C0BC] uppercase flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-[#18C98F]" /> Category <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="scanned-receipt-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-[#3A4148] bg-[#111417] text-white text-xs font-semibold focus:outline-none focus:border-emerald-500/60"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date & Merchant */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#B7C0BC] uppercase flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#18C98F]" /> Receipt Date <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="scanned-receipt-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#3A4148] bg-[#111417] text-white text-xs font-semibold focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#B7C0BC] uppercase flex items-center gap-1">
                    <Store className="w-3 h-3 text-[#18C98F]" /> Merchant / Vendor
                  </label>
                  <input
                    id="scanned-receipt-merchant"
                    type="text"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder="e.g. Indian Oil / Hotel Taj"
                    className="w-full px-3 py-2 rounded-xl border border-[#3A4148] bg-[#111417] text-white text-xs focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              {/* Bill Number & GST */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#B7C0BC] uppercase flex items-center gap-1">
                    <FileText className="w-3 h-3 text-[#18C98F]" /> Bill / Invoice #
                  </label>
                  <input
                    id="scanned-receipt-billnum"
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="e.g. INV-2026-981"
                    className="w-full px-3 py-2 rounded-xl border border-[#3A4148] bg-[#111417] text-white text-xs focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#B7C0BC] uppercase flex items-center gap-1">
                    <Percent className="w-3 h-3 text-[#18C98F]" /> GST / Tax (₹)
                  </label>
                  <input
                    id="scanned-receipt-gst"
                    type="number"
                    min="0"
                    step="any"
                    value={gstAmount}
                    onChange={(e) => setGstAmount(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-xl border border-[#3A4148] bg-[#111417] text-white text-xs focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              {/* Validation Alert */}
              {formValidation && (
                <div className="p-2.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold text-center">
                  {formValidation}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={handleRetake}
                className="flex-1 py-2.5 text-xs font-bold"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retake
              </Button>

              <button
                type="button"
                id="btn-confirm-scanned-receipt"
                onClick={handleConfirmReceipt}
                className="flex-[2] py-2.5 px-4 bg-[#18C98F] hover:bg-[#10966D] text-[#0B0D0F] font-bold text-xs rounded-xl shadow-lg border border-[#3A4148] flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Use Receipt & Fill Form</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
