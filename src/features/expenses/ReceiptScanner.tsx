import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ExpenseRecord, ExpenseCategory } from '../../types/expense';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { 
  Camera, 
  RotateCcw, 
  Check, 
  Upload, 
  AlertCircle, 
  X, 
  Sparkles,
  SwitchCamera,
  RefreshCw
} from 'lucide-react';

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

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  const [cameraState, setCameraState] = useState<'INITIALIZING' | 'STREAMING' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'CAPTURED'>('INITIALIZING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedImageData, setCapturedImageData] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Check available video devices
  const checkCameraDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      }
    } catch {
      // Ignore enumeration errors
    }
  };

  // Start camera stream
  const startCamera = useCallback(async () => {
    if (!isOpen) return;

    if (Capacitor.isNativePlatform()) {
      setCameraState('STREAMING');
      setErrorMessage(null);
      return;
    }

    stopCamera();
    setCameraState('INITIALIZING');
    setErrorMessage(null);

    // Check if mediaDevices is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('UNAVAILABLE');
      setErrorMessage('Direct camera access is not supported on this browser or platform. You can upload an image from your files instead.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((playErr) => {
            console.warn('Video playback notice:', playErr);
          });
          setCameraState('STREAMING');
        };
      } else {
        setCameraState('STREAMING');
      }

      checkCameraDevices();
    } catch (err: any) {
      console.warn('Camera access error:', err);
      stopCamera();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraState('PERMISSION_DENIED');
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser or device settings, or select a receipt photo from your gallery.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraState('UNAVAILABLE');
        setErrorMessage('No camera device found on this system. You can attach a receipt image directly.');
      } else {
        setCameraState('UNAVAILABLE');
        setErrorMessage(err.message || 'Unable to open camera stream. Please try file upload.');
      }
    }
  }, [isOpen, facingMode, stopCamera]);

  // Lifecycle effect
  useEffect(() => {
    if (isOpen) {
      setCapturedImageData(null);
      startCamera();
    } else {
      stopCamera();
      setCapturedImageData(null);
      setCameraState('INITIALIZING');
      setErrorMessage(null);
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Request native permission
  const requestNativeCameraPermission = async (): Promise<boolean> => {
    try {
      const status = await CapCamera.checkPermissions();
      if (status.camera === 'granted') {
        return true;
      }
      const request = await CapCamera.requestPermissions({ permissions: ['camera'] });
      return request.camera === 'granted';
    } catch (err) {
      console.error('Error checking native camera permission:', err);
      return false;
    }
  };

  // Native camera capture
  const handleNativeCameraCapture = async () => {
    try {
      setErrorMessage(null);
      const isGranted = await requestNativeCameraPermission();
      if (!isGranted) {
        setCameraState('PERMISSION_DENIED');
        setErrorMessage('Camera permission was denied. Please enable camera permission in your Android settings to capture receipt photos.');
        return;
      }

      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (photo && photo.dataUrl) {
        setCapturedImageData(photo.dataUrl);
        setCameraState('CAPTURED');
      } else {
        setCameraState('STREAMING');
      }
    } catch (err: any) {
      console.warn('Native camera capture error or cancellation:', err);
      if (err?.message?.includes('cancelled') || err?.message?.includes('Cancel') || err?.message?.includes('user cancelled')) {
        setCameraState('STREAMING');
      } else {
        setCameraState('UNAVAILABLE');
        setErrorMessage(err?.message || 'Failed to capture image from device camera.');
      }
    }
  };

  // Native gallery picker
  const handleNativeGalleryPick = async () => {
    try {
      setErrorMessage(null);
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });

      if (photo && photo.dataUrl) {
        setCapturedImageData(photo.dataUrl);
        setCameraState('CAPTURED');
      } else {
        setCameraState('STREAMING');
      }
    } catch (err: any) {
      console.warn('Native gallery pick error or cancellation:', err);
      if (err?.message?.includes('cancelled') || err?.message?.includes('Cancel') || err?.message?.includes('user cancelled')) {
        setCameraState('STREAMING');
      } else {
        setCameraState('UNAVAILABLE');
        setErrorMessage(err?.message || 'Failed to select image from gallery.');
      }
    }
  };

  // Trigger gallery pick based on platform
  const handleGalleryClick = async () => {
    if (Capacitor.isNativePlatform()) {
      await handleNativeGalleryPick();
    } else {
      fileInputRef.current?.click();
    }
  };

  // Trigger camera capture based on platform
  const handleCapturePhoto = async () => {
    if (Capacitor.isNativePlatform()) {
      await handleNativeCameraCapture();
    } else {
      handleWebCapturePhoto();
    }
  };

  // Web capture photo from video element
  const handleWebCapturePhoto = () => {
    if (!videoRef.current) return;

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const MAX_DIM = 1200;

      let width = video.videoWidth || 640;
      let height = video.videoHeight || 480;

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
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);

      // Compress to JPEG format with 0.82 quality
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      stopCamera();
      setCapturedImageData(compressedDataUrl);
      setCameraState('CAPTURED');
    } catch (err: any) {
      console.error('Error capturing photo:', err);
      setErrorMessage('Failed to capture frame from camera. Please retry.');
    }
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedImageData(null);
    startCamera();
  };

  // Switch between front and back camera
  const handleToggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Handle fallback file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
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
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        stopCamera();
        setCapturedImageData(compressedDataUrl);
        setCameraState('CAPTURED');
        setIsProcessing(false);
      };
      img.onerror = () => {
        setIsProcessing(false);
        setErrorMessage('Failed to read image file.');
      };
      img.src = uploadEvent.target?.result as string;
    };
    reader.onerror = () => {
      setIsProcessing(false);
      setErrorMessage('Failed to process selected file.');
    };
    reader.readAsDataURL(file);
  };

  // Accept and confirm receipt
  const handleAcceptPhoto = () => {
    if (!capturedImageData) return;

    stopCamera();
    onConfirm({
      amount: 0,
      category: 'Travel',
      date: new Date().toISOString().split('T')[0],
      merchant: null,
      receiptNumber: null,
      gstAmount: null,
      localReceiptData: capturedImageData,
    });
  };

  const handleModalClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleModalClose}
      title="Scan / Capture Receipt"
    >
      <div className="space-y-4 text-white">
        {/* Hidden file input for gallery upload */}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Viewfinder / Captured Preview Area */}
        <div className="relative w-full aspect-[4/3] bg-black/90 rounded-2xl overflow-hidden border border-purple-500/30 flex items-center justify-center shadow-inner">
          {/* Active Streaming Video */}
          {cameraState === 'STREAMING' && (
            <>
              {Capacitor.isNativePlatform() ? (
                <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-purple-500/10 text-purple-300 flex items-center justify-center border border-purple-500/20 animate-pulse">
                    <Camera className="w-8 h-8 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Native Receipt Capture</p>
                    <p className="text-xs text-purple-200/60 mt-1 max-w-xs leading-relaxed">
                      Tap "Capture Photo" below to open your device camera, or "Gallery" to select a saved receipt.
                    </p>
                  </div>
                  {/* Scanning Overlay Reticle */}
                  <div className="absolute inset-4 border-2 border-dashed border-emerald-400/40 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                    <div className="flex justify-between items-center text-[11px] font-bold text-emerald-300 bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm self-center">
                      <Sparkles className="w-3.5 h-3.5 mr-1 animate-spin" /> Ready to capture
                    </div>
                    <div className="text-[10px] text-center text-white/50 bg-black/50 py-0.5 rounded backdrop-blur-sm">
                      Align receipt within frame
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Scanning Overlay Reticle */}
                  <div className="absolute inset-4 border-2 border-dashed border-emerald-400/70 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                    <div className="flex justify-between items-center text-[11px] font-bold text-emerald-300 bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm self-center">
                      <Sparkles className="w-3.5 h-3.5 mr-1 animate-spin" /> Align receipt within frame
                    </div>
                    <div className="text-[10px] text-center text-white/70 bg-black/50 py-0.5 rounded backdrop-blur-sm">
                      Ensure amount and date are clearly visible
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Initializing State */}
          {cameraState === 'INITIALIZING' && (
            <div className="flex flex-col items-center gap-2 text-purple-300 p-6 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
              <p className="text-xs font-semibold">Starting camera...</p>
            </div>
          )}

          {/* Captured Image State */}
          {cameraState === 'CAPTURED' && capturedImageData && (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <img
                src={capturedImageData}
                alt="Captured Receipt"
                className="w-full h-full object-contain"
              />
              <div className="absolute top-2 left-2 bg-emerald-500/90 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
                <Check className="w-3 h-3" /> Captured
              </div>
            </div>
          )}

          {/* Permission Denied or Unavailable State */}
          {(cameraState === 'PERMISSION_DENIED' || cameraState === 'UNAVAILABLE') && (
            <div className="p-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {cameraState === 'PERMISSION_DENIED' ? 'Camera Permission Required' : 'Camera Unavailable'}
                </p>
                <p className="text-xs text-purple-200/80 mt-1 max-w-xs leading-relaxed">
                  {errorMessage || 'Camera access is required to capture photos directly. You can select an image from your files.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center pt-1">
                <button
                  type="button"
                  onClick={handleGalleryClick}
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Upload className="w-4 h-4" /> Upload from Files
                </button>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3 py-2 rounded-xl bg-[#211044] hover:bg-[#2D1B5A] text-purple-200 border border-purple-500/30 font-semibold text-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {cameraState === 'STREAMING' && (
            <>
              <button
                type="button"
                onClick={handleGalleryClick}
                className="px-3 py-2.5 rounded-xl bg-[#211044] hover:bg-[#2D1B5A] text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5"
                title="Upload from device storage"
              >
                <Upload className="w-4 h-4" /> Gallery
              </button>

              <button
                type="button"
                onClick={handleCapturePhoto}
                className="flex-1 py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-extrabold text-sm rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-98 transition-transform"
              >
                <Camera className="w-5 h-5" /> Capture Photo
              </button>

              {hasMultipleCameras && (
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  className="p-2.5 rounded-xl bg-[#211044] hover:bg-[#2D1B5A] text-purple-300 border border-purple-500/30 text-xs"
                  title="Flip camera"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {cameraState === 'CAPTURED' && (
            <>
              <Button
                type="button"
                variant="text"
                onClick={handleRetake}
                className="flex-1 border border-purple-500/30 text-purple-200 hover:bg-[#211044] rounded-xl text-xs py-2.5 flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> Retake Photo
              </Button>
              <Button
                type="button"
                onClick={handleAcceptPhoto}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs py-2.5 flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-900/30"
              >
                <Check className="w-4 h-4" /> Accept Receipt
              </Button>
            </>
          )}

          {(cameraState === 'PERMISSION_DENIED' || cameraState === 'UNAVAILABLE' || cameraState === 'INITIALIZING') && (
            <Button
              type="button"
              variant="text"
              onClick={handleModalClose}
              className="w-full py-2.5 rounded-xl"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
};
