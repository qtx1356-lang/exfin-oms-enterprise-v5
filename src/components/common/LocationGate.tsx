import React, { useState } from 'react';
import { useLocationContext } from '../../context/LocationContext';
import { Card } from '../ui/Card';
import { MapPin, ShieldAlert, Compass, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

export const LocationGate: React.FC = () => {
  const { 
    isGpsOff, 
    isPermissionDenied, 
    isLocationUnavailable, 
    errorMessage, 
    refreshLocation,
    locationStatus 
  } = useLocationContext();

  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isPermissionDenied) {
        // Triggers permission requests
        await refreshLocation();
      } else if (isGpsOff) {
        // Open device settings
        if (Capacitor.isNativePlatform()) {
          try {
            await (CapApp as any).openUrl({ url: 'app-settings:' });
          } catch (err) {
            console.warn('Failed to open app settings:', err);
          }
        }
        // Also trigger location check to prompt the Play Services system dialog if possible
        await refreshLocation();
      } else {
        // Retry locating
        await refreshLocation();
      }
    } catch (err) {
      console.warn('Location gate action error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Determine active case based on states or context error message
  const showPermissionDenied = isPermissionDenied || errorMessage.toLowerCase().includes('permission');
  const showGpsOff = isGpsOff || errorMessage.toLowerCase().includes('off') || errorMessage.toLowerCase().includes('disabled') || errorMessage.toLowerCase().includes('settings');
  const showUnavailable = isLocationUnavailable || (!showPermissionDenied && !showGpsOff);

  return (
    <div className="fixed inset-0 z-[9999] min-h-screen bg-[#080808] flex flex-col items-center justify-center p-4 text-[#FFFFFF]">
      {/* Background ambient lighting */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-md w-full relative z-10"
      >
        <Card className="w-full p-8 space-y-6 bg-[#151515] border border-[#292929] shadow-2xl rounded-3xl text-center relative overflow-hidden">
          {/* Top Gold Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />

          {/* Animated Glowing Icon Header */}
          <div className="relative flex justify-center pt-2">
            <div className="relative w-20 h-20 bg-[#1B1B1B] border border-[#D4AF37]/30 rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.15)]">
              {showPermissionDenied && (
                <ShieldAlert className="w-10 h-10 text-[#D4AF37] animate-pulse" />
              )}
              {showGpsOff && (
                <MapPin className="w-10 h-10 text-[#D4AF37] animate-bounce" style={{ animationDuration: '2s' }} />
              )}
              {showUnavailable && (
                <Compass className="w-10 h-10 text-[#D4AF37] animate-spin" style={{ animationDuration: '8s' }} />
              )}
              {/* Outer Pulse Rings */}
              <div className="absolute inset-0 border border-[#D4AF37]/20 rounded-3xl animate-ping opacity-30" style={{ animationDuration: '3s' }} />
            </div>
          </div>

          {/* Core Warning Headline & Description */}
          <div className="space-y-3">
            <h1 className="text-xl font-black tracking-wide text-[#FFFFFF] uppercase flex items-center justify-center gap-2">
              <span className="text-[#D4AF37]">📍</span>
              {showPermissionDenied && 'Permission Required'}
              {showGpsOff && 'Location Turned Off'}
              {showUnavailable && 'Location Services'}
            </h1>

            <p className="text-[#C7C7C7] text-sm font-semibold leading-relaxed px-2">
              {showPermissionDenied && 'EXFIN OMS requires your permission to access device location to use Attendance features.'}
              {showGpsOff && 'Please turn on Location Services to continue using Attendance features.'}
              {showUnavailable && 'EXFIN OMS requires your device location to be turned ON to use Attendance features.'}
            </p>

            <p className="text-[#8A8A8A] text-xs leading-relaxed px-4">
              Location is required for automatic attendance, 25-meter geofence verification and check-in/check-out.
            </p>
          </div>

          {/* Explanatory Message / Warning */}
          <div className="bg-[#121212] border border-[#292929] p-3.5 rounded-2xl">
            <p className="text-[11px] text-[#8A8A8A] leading-normal font-medium">
              {showPermissionDenied && 'Without permission, the app cannot track your geofence status or process automatic check-ins.'}
              {showGpsOff && 'Your attendance cannot be processed until Location Services are enabled on your device.'}
              {showUnavailable && 'We are currently unable to obtain your current location. Please check your GPS signal strength.'}
            </p>
          </div>

          {/* Action Button */}
          <div className="pt-2 space-y-3">
            <button
              onClick={handleAction}
              disabled={loading || locationStatus === 'loading'}
              className="w-full py-4 bg-[#D4AF37] hover:bg-[#E6C766] active:bg-[#B3922E] disabled:opacity-50 text-[#080808] font-black rounded-2xl text-xs uppercase tracking-wider transition-all duration-200 shadow-lg shadow-[#D4AF37]/15 flex items-center justify-center gap-2 cursor-pointer border border-[#D4AF37]/50"
            >
              {(loading || locationStatus === 'loading') ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#080808]" />
                  <span>Verifying State...</span>
                </>
              ) : (
                <>
                  {showPermissionDenied && <span>Grant Location Permission</span>}
                  {showGpsOff && <span>Turn On Location</span>}
                  {showUnavailable && <span>Retry Connection</span>}
                </>
              )}
            </button>

            {/* Subtle Fallback Info */}
            <p className="text-[10px] text-[#8A8A8A] font-mono">
              EXFIN OMS • 25m GPS Geofenced Verification
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};
