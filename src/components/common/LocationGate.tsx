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
    <div className="fixed inset-0 z-[9999] min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] flex flex-col items-center justify-center p-4 text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-md w-full"
      >
        <Card className="w-full p-8 space-y-6 bg-[#2D1B5A] border-2 border-purple-500/40 shadow-[0_0_50px_rgba(139,92,246,0.2)] rounded-[24px] text-center relative overflow-hidden">
          {/* Subtle Ambient Glow Ring */}
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Animated Glowing Icon Header */}
          <div className="relative flex justify-center">
            <div className="relative w-20 h-20 bg-purple-500/15 border-2 border-purple-500/30 rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.2)]">
              {showPermissionDenied && (
                <ShieldAlert className="w-10 h-10 text-purple-400 animate-pulse" />
              )}
              {showGpsOff && (
                <MapPin className="w-10 h-10 text-purple-400 animate-bounce" style={{ animationDuration: '2s' }} />
              )}
              {showUnavailable && (
                <Compass className="w-10 h-10 text-purple-400 animate-spin" style={{ animationDuration: '8s' }} />
              )}
              {/* Outer Pulse Rings */}
              <div className="absolute inset-0 border border-purple-500/20 rounded-3xl animate-ping opacity-30" style={{ animationDuration: '3s' }} />
            </div>
          </div>

          {/* Core Warning Headline & Description */}
          <div className="space-y-3">
            <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center justify-center gap-2">
              <span className="text-purple-400">📍</span>
              {showPermissionDenied && 'Permission Required'}
              {showGpsOff && 'Location Turned Off'}
              {showUnavailable && 'Location Services'}
            </h1>

            <p className="text-purple-200/90 text-sm font-semibold leading-relaxed px-2">
              {showPermissionDenied && 'Office Management System requires your permission to access device location to use the Attendance features.'}
              {showGpsOff && 'Please turn on Location Services to continue using Attendance features.'}
              {showUnavailable && 'Office Management System requires your device location to be turned ON to use Attendance features.'}
            </p>

            <p className="text-purple-300/70 text-xs leading-relaxed px-4">
              Location is required for automatic attendance, office geofence verification and accurate check-in/check-out.
            </p>
          </div>

          {/* Explanatory Message / Warning */}
          <div className="bg-[#1D113B]/50 border border-purple-500/20 p-3.5 rounded-2xl">
            <p className="text-[11px] text-purple-200/70 leading-normal">
              {showPermissionDenied && 'Without permission, the app cannot track your geofence status or process automatic check-ins.'}
              {showGpsOff && 'Your attendance cannot be processed until Location Services are enabled on your device.'}
              {showUnavailable && 'We are currently unable to obtain your current location. Please check your GPS signal strength.'}
            </p>
          </div>

          {/* Large Action Buttons */}
          <div className="pt-2 space-y-3">
            <button
              onClick={handleAction}
              disabled={loading || locationStatus === 'loading'}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition-all duration-200 shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {(loading || locationStatus === 'loading') ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
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
            <p className="text-[10px] text-purple-300/40">
              Office Management System • GPS Geofenced Verification
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};
