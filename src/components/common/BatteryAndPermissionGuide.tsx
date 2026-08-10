import React, { useState } from 'react';
import { Shield, Zap, Info, CheckCircle2, ChevronDown, ChevronUp, AlertTriangle, MapPin } from 'lucide-react';
import { useLocationContext } from '../../context/LocationContext';

export const BatteryAndPermissionGuide: React.FC = () => {
  const { backgroundPermissionGranted, requestBackgroundPermission } = useLocationContext();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [permRequesting, setPermRequesting] = useState<boolean>(false);
  const [permGrantedLocal, setPermGrantedLocal] = useState<boolean>(false);

  const handleRequestPerm = async () => {
    setPermRequesting(true);
    try {
      const granted = await requestBackgroundLocationPermission();
      setPermGrantedLocal(granted);
    } catch (e) {
      console.warn('Failed to request background location:', e);
    } finally {
      setPermRequesting(false);
    }
  };

  const isGranted = backgroundPermissionGranted || permGrantedLocal;

  return (
    <div className="bg-slate-900/90 border border-purple-500/20 rounded-2xl p-4 text-white shadow-xl mb-6 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-purple-100 flex items-center gap-1.5">
              Background Automatic Attendance
              {isGranted ? (
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              ) : (
                <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Action Recommended
                </span>
              )}
            </h4>
            <p className="text-xs text-purple-300/80 mt-0.5">
              Ensures auto check-in/out when screen is locked or app is minimized
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-purple-300 hover:text-white bg-purple-950/50 hover:bg-purple-900/60 px-3 py-1.5 rounded-lg border border-purple-500/20 transition flex items-center gap-1 font-medium"
        >
          {isExpanded ? (
            <>Hide <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>Setup <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-purple-500/20 space-y-4 text-xs">
          {/* Step 1: Background Location Permission */}
          <div className="bg-purple-950/30 rounded-xl p-3 border border-purple-500/20">
            <div className="flex items-start space-x-3">
              <MapPin className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-purple-200">1. Location Permission ("Allow all the time")</span>
                  {isGranted ? (
                    <span className="text-emerald-400 font-medium text-[11px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Granted
                    </span>
                  ) : (
                    <button
                      onClick={handleRequestPerm}
                      disabled={permRequesting}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-medium px-3 py-1 rounded-md text-[11px] transition shadow"
                    >
                      {permRequesting ? 'Requesting...' : 'Grant Access'}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-purple-300/80 mt-1">
                  Required so Android can detect when you enter the 25-meter office boundary without opening the app screen.
                </p>
              </div>
            </div>
          </div>

          {/* Step 2: Battery Optimization */}
          <div className="bg-purple-950/30 rounded-xl p-3 border border-purple-500/20">
            <div className="flex items-start space-x-3">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold text-purple-200">2. Disable Aggressive Battery Optimization</span>
                <p className="text-[11px] text-purple-300/80 mt-1">
                  To prevent manufacturers (Samsung, Xiaomi, Vivo, Oppo, OnePlus) from sleeping the geofence engine:
                </p>
                <ol className="list-decimal list-inside text-[11px] text-purple-200/90 mt-1.5 space-y-0.5 pl-1">
                  <li>Open phone <strong>Settings → Apps → Exfin OMS</strong></li>
                  <li>Tap <strong>Battery</strong> or <strong>Battery Saver</strong></li>
                  <li>Select <strong>Unrestricted</strong> or <strong>No Restrictions</strong></li>
                </ol>
              </div>
            </div>
          </div>

          {/* Step 3: Force Stop Explanation */}
          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-700/50">
            <div className="flex items-start space-x-3">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold text-sky-200">3. App States & Force Stop Info</span>
                <p className="text-[11px] text-sky-300/80 mt-1 leading-relaxed">
                  • <strong>App Minimized / Locked / Recents Removed:</strong> Geofence automatic check-in & exit tracking works continuously in the background.<br />
                  • <strong>Explicit Force Stop (via Settings):</strong> Android prevents background apps from executing after explicit Force Stop until you open Exfin OMS again.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
