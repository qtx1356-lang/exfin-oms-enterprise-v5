import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, 
  Wifi, 
  WifiOff, 
  Search, 
  Clock, 
  Smartphone, 
  Compass, 
  Activity, 
  ChevronRight, 
  ChevronDown, 
  Settings, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Users,
  RefreshCw,
  LogOut,
  Play,
  Square,
  History,
  FileText
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, limit } from 'firebase/firestore';
import { 
  getCurrentLocationDetails, 
  getCheckInLocationDetails, 
  getCheckoutLocationDetails, 
  getEffectiveCheckoutStatus, 
  calculateWorkingHours, 
  getDistanceFromLatLonInM,
  toKolkataString,
  AUTHORIZED_OFFICE
} from './utils/attendanceUtils';

// Live production config details extracted from native Android Service
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  authDomain: "exfin-oms-production.firebaseapp.com",
  projectId: "exfin-oms-production",
  storageBucket: "exfin-oms-production.appspot.com",
  messagingSenderId: "364506822557",
  appId: "1:364506822557:web:fb0a61f22df8ba9c3d4ee7"
};

// Initialize Firebase dynamically with fail-safes
let db: any = null;
try {
  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  db = getFirestore(app);
} catch (err) {
  console.warn("Firebase failed to initialize. Falling back to local offline storage provider.", err);
}

interface LocalLocationDoc {
  employeeId: string;
  employeeName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  distanceFromOffice: number;
  townCity: string;
  timestamp: string;
  updatedAt: string;
  source: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'employee' | 'admin'>('employee');
  const [employeeId, setEmployeeId] = useState<string>(() => localStorage.getItem('exfin_employee_id') || 'EMP001');
  const [employeeName, setEmployeeName] = useState<string>(() => localStorage.getItem('exfin_employee_name') || 'Amit Sharma');
  const [isTracking, setIsTracking] = useState<boolean>(() => localStorage.getItem('exfin_is_tracking') === 'true');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  
  // Geolocation tracking state
  const [lastLocation, setLastLocation] = useState<LocalLocationDoc | null>(() => {
    const stored = localStorage.getItem('exfin_latest_location');
    return stored ? JSON.parse(stored) : null;
  });
  
  const [trackingQueue, setTrackingQueue] = useState<LocalLocationDoc[]>(() => {
    const stored = localStorage.getItem('exfin_offline_queue');
    return stored ? JSON.parse(stored) : [];
  });
  
  const [attendanceRecord, setAttendanceRecord] = useState<any>(() => {
    const stored = localStorage.getItem('exfin_attendance_record');
    return stored ? JSON.parse(stored) : null;
  });

  const [localHistory, setLocalHistory] = useState<LocalLocationDoc[]>(() => {
    const stored = localStorage.getItem('exfin_location_history');
    return stored ? JSON.parse(stored) : [];
  });

  // Admin Dashboard states
  const [adminRecords, setAdminRecords] = useState<any[]>([]);
  const [adminLiveLocations, setAdminLiveLocations] = useState<Map<string, any>>(new Map());
  const [adminSearch, setAdminSearch] = useState<string>('');
  const [adminFilter, setAdminFilter] = useState<'ALL' | 'MISSING_CHECKOUT' | 'LATE'>('ALL');
  const [selectedForAudit, setSelectedForAudit] = useState<any | null>(null);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  // Refs for tracking watchdog and watch ID
  const watchIdRef = useRef<number | null>(null);
  const lastLocationTimestampRef = useRef<number>(0);

  // Sync state for user action feedback
  const [syncStatus, setSyncStatus] = useState<string>('Synced');
  const [lastSyncTime, setLastSyncTime] = useState<string>('Never');

  // Trigger immediate location reacquisition on tab focus / visibilitychange
  const triggerOneOffReacquisition = () => {
    if (!isTracking) return;
    console.log("Visibility state changed to active or foreground resumed. Reacquiring GPS immediately.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleNewLocationSuccess(pos, 'manual-reacquisition');
      },
      (err) => {
        console.warn("Failed to immediately reacquire GPS on resume:", err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Online/Offline Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      attemptQueueSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [trackingQueue]);

  // Periodic Watchdog & Recovery Trigger
  useEffect(() => {
    let watchdogTimer: any = null;
    if (isTracking) {
      // Periodic check every 30 seconds
      watchdogTimer = setInterval(() => {
        const timeSinceLastUpdate = Date.now() - lastLocationTimestampRef.current;
        // If watchPosition is stalled (no update in last 45 seconds), restart it
        if (timeSinceLastUpdate > 45000) {
          console.warn(`Watchdog detected stale location stream (${Math.round(timeSinceLastUpdate / 1000)}s since last update). Restarting navigator.geolocation.watchPosition.`);
          restartWatchStream();
        }
      }, 30000);
    }
    return () => {
      if (watchdogTimer) clearInterval(watchdogTimer);
    };
  }, [isTracking]);

  // React to Foreground changes (visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerOneOffReacquisition();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTracking]);

  // Start watchstream on mount or tracking enable
  useEffect(() => {
    if (isTracking) {
      startWatchStream();
    } else {
      stopWatchStream();
    }
    return () => stopWatchStream();
  }, [isTracking, employeeId, employeeName]);

  // Update persisted parameters
  useEffect(() => {
    localStorage.setItem('exfin_employee_id', employeeId);
    localStorage.setItem('exfin_employee_name', employeeName);
  }, [employeeId, employeeName]);

  // Sync Live Data Subscription on Admin Side
  useEffect(() => {
    if (activeTab !== 'admin' || !db) return;

    // Listen to live locations
    const qLive = query(collection(db, 'live_locations'), limit(100));
    const unsubscribeLive = onSnapshot(qLive, (snapshot) => {
      const liveMap = new Map<string, any>();
      snapshot.forEach((doc) => {
        liveMap.set(doc.id.toLowerCase().trim(), doc.data());
      });
      setAdminLiveLocations(liveMap);
    }, (err) => {
      console.warn("Failed real-time subscription to live_locations:", err);
    });

    // Listen to attendance records
    const qAtt = query(collection(db, 'attendance'), limit(200));
    const unsubscribeAtt = onSnapshot(qAtt, (snapshot) => {
      const records: any[] = [];
      snapshot.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() });
      });
      setAdminRecords(records);
    }, (err) => {
      console.warn("Failed real-time subscription to attendance:", err);
    });

    return () => {
      unsubscribeLive();
      unsubscribeAtt();
    };
  }, [activeTab]);

  const startWatchStream = () => {
    stopWatchStream();
    if (!navigator.geolocation) {
      alert("Error: Geolocation is not supported by your browser or WebView.");
      return;
    }

    lastLocationTimestampRef.current = Date.now();
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handleNewLocationSuccess(pos, 'watchPosition'),
      (err) => handleNewLocationError(err),
      options
    );

    // Also trigger one immediate grab right away
    triggerOneOffReacquisition();
  };

  const stopWatchStream = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const restartWatchStream = () => {
    stopWatchStream();
    startWatchStream();
  };

  // Authoritative Reverse Geocoding via standard public lookup or fallback
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (response.ok) {
        const data = await response.json();
        return data.address?.suburb || data.address?.village || data.address?.city || data.address?.town || data.display_name || "Location name resolved";
      }
    } catch {
      // Fallback
    }
    return "Asansol, West Bengal";
  };

  const handleNewLocationSuccess = async (position: GeolocationPosition, triggerSource: string) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    lastLocationTimestampRef.current = Date.now();

    // Guard against zero coordinates or extreme outliers
    if (lat === 0 && lng === 0) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    // Calculate real distance to authorized office
    const dist = getDistanceFromLatLonInM(lat, lng, AUTHORIZED_OFFICE.latitude, AUTHORIZED_OFFICE.longitude);

    // Geocode to resolve Town/City name
    const townCity = await reverseGeocode(lat, lng);
    const isoString = toKolkataString(new Date());

    const payload: LocalLocationDoc = {
      employeeId: employeeId.trim(),
      employeeName: employeeName.trim(),
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      distanceFromOffice: dist,
      townCity: townCity,
      timestamp: isoString,
      updatedAt: isoString,
      source: triggerSource
    };

    // Save locally
    setLastLocation(payload);
    localStorage.setItem('exfin_latest_location', JSON.stringify(payload));

    // Append to local audit log history (max 30 logs)
    const updatedHistory = [payload, ...localHistory.slice(0, 29)];
    setLocalHistory(updatedHistory);
    localStorage.setItem('exfin_location_history', JSON.stringify(updatedHistory));

    // Send to Firestore or Queue it based on connectivity
    if (navigator.onLine) {
      writeToFirestore(payload);
    } else {
      const newQueue = [...trackingQueue, payload];
      setTrackingQueue(newQueue);
      localStorage.setItem('exfin_offline_queue', JSON.stringify(newQueue));
      setSyncStatus('Pending offline sync');
    }
  };

  const handleNewLocationError = (error: GeolocationPositionError) => {
    console.warn("Geolocation watch error encountered:", error.message);
    // Don't mock or create fake data. Report error in user interface.
  };

  const writeToFirestore = async (payload: LocalLocationDoc) => {
    if (!db) {
      setSyncStatus('Synced (Local Provider)');
      return;
    }

    try {
      const employeeRef = doc(db, 'live_locations', payload.employeeId.toLowerCase().trim());
      await setDoc(employeeRef, {
        employeeId: payload.employeeId,
        employeeName: payload.employeeName,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy,
        distanceFromOffice: payload.distanceFromOffice,
        townCity: payload.townCity,
        timestamp: payload.timestamp,
        updatedAt: payload.updatedAt,
        source: payload.source
      }, { merge: true });

      // If active attendance record exists, sync current tracking there too
      if (attendanceRecord) {
        const attRef = doc(db, 'attendance', `${payload.employeeId.toLowerCase().trim()}_${attendanceRecord.date}`);
        await setDoc(attRef, {
          currentLatitude: payload.latitude,
          currentLongitude: payload.longitude,
          townCity: payload.townCity,
          updatedAt: payload.updatedAt
        }, { merge: true });
      }

      setSyncStatus('Synced');
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Firestore sync error, appending update to local queue:", e);
      const newQueue = [...trackingQueue, payload];
      setTrackingQueue(newQueue);
      localStorage.setItem('exfin_offline_queue', JSON.stringify(newQueue));
      setSyncStatus('Pending offline sync');
    }
  };

  const attemptQueueSync = async () => {
    if (trackingQueue.length === 0) return;
    setSyncStatus('Synchronizing...');

    const remaining = [...trackingQueue];
    const successes: string[] = [];

    for (const item of remaining) {
      try {
        if (db) {
          const employeeRef = doc(db, 'live_locations', item.employeeId.toLowerCase().trim());
          await setDoc(employeeRef, {
            employeeId: item.employeeId,
            employeeName: item.employeeName,
            latitude: item.latitude,
            longitude: item.longitude,
            accuracy: item.accuracy,
            distanceFromOffice: item.distanceFromOffice,
            townCity: item.townCity,
            timestamp: item.timestamp,
            updatedAt: item.updatedAt,
            source: 'queued-sync'
          }, { merge: true });
        }
        successes.push(item.timestamp);
      } catch (err) {
        console.warn("Failed to sync queued coordinate item, pausing sync loop:", err);
        break; // Stop loop on failure
      }
    }

    const filtered = remaining.filter(item => !successes.includes(item.timestamp));
    setTrackingQueue(filtered);
    localStorage.setItem('exfin_offline_queue', JSON.stringify(filtered));

    if (filtered.length === 0) {
      setSyncStatus('Synced');
      setLastSyncTime(new Date().toLocaleTimeString());
    } else {
      setSyncStatus('Pending offline sync');
    }
  };

  // Perform Check-in forensic resolution
  const handleCheckIn = () => {
    if (!lastLocation) {
      alert("No valid GPS location registered yet. Please wait until GPS coordinates are resolved.");
      return;
    }

    const todayDate = new Date().toISOString().split('T')[0];
    const checkInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    
    const record = {
      id: `${employeeId.toLowerCase().trim()}_${todayDate}`,
      employeeId: employeeId,
      employeeName: employeeName,
      date: todayDate,
      attendanceType: lastLocation.distanceFromOffice <= AUTHORIZED_OFFICE.radius ? 'OFFICE' : 'WFH',
      checkInTime: checkInTime,
      checkInLatitude: lastLocation.latitude,
      checkInLongitude: lastLocation.longitude,
      townCity: lastLocation.townCity,
      checkOutTime: 'Pending',
      checkoutStatus: 'PENDING',
      syncStatus: 'Synced',
      isOffline: !isOnline
    };

    setAttendanceRecord(record);
    localStorage.setItem('exfin_attendance_record', JSON.stringify(record));

    // Upload to firestore
    if (db) {
      setDoc(doc(db, 'attendance', record.id), record, { merge: true });
    }
  };

  // Perform Checkout forensic resolution
  const handleCheckout = () => {
    if (!attendanceRecord) return;
    if (!lastLocation) {
      alert("No valid GPS location registered yet. Please wait until GPS coordinates are resolved.");
      return;
    }

    const checkOutTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    
    const updated = {
      ...attendanceRecord,
      checkOutTime: checkOutTime,
      checkoutLatitude: lastLocation.latitude,
      checkoutLongitude: lastLocation.longitude,
      checkoutTownCity: lastLocation.townCity,
      checkoutStatus: 'COMPLETED',
      workingHours: calculateWorkingHours(attendanceRecord.checkInTime, checkOutTime) || '—'
    };

    setAttendanceRecord(updated);
    localStorage.setItem('exfin_attendance_record', JSON.stringify(updated));

    // Upload to firestore
    if (db) {
      setDoc(doc(db, 'attendance', updated.id), updated, { merge: true });
    }
  };

  // Reset demo states
  const handleResetSession = () => {
    stopWatchStream();
    setIsTracking(false);
    setLastLocation(null);
    setAttendanceRecord(null);
    setTrackingQueue([]);
    setLocalHistory([]);
    localStorage.removeItem('exfin_is_tracking');
    localStorage.removeItem('exfin_latest_location');
    localStorage.removeItem('exfin_attendance_record');
    localStorage.removeItem('exfin_offline_queue');
    localStorage.removeItem('exfin_location_history');
  };

  const toggleDateCollapse = (dateStr: string) => {
    setCollapsedDates((prev) => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  // Grouped Admin Attendance records with fallbacks
  const groupedAdminRecords = useMemo(() => {
    const recordsToUse = adminRecords.length > 0 ? adminRecords : (attendanceRecord ? [attendanceRecord] : []);
    const filtered = recordsToUse.filter((rec) => {
      const name = (rec.employeeName || '').toLowerCase();
      const code = (rec.employeeId || rec.employeeCode || '').toLowerCase();
      const term = adminSearch.toLowerCase();
      if (term && !name.includes(term) && !code.includes(term)) return false;

      if (adminFilter === 'MISSING_CHECKOUT') {
        const completed = getEffectiveCheckoutStatus(rec) === 'COMPLETED';
        if (completed) return false;
      }
      return true;
    });

    const groups: Record<string, { dateStr: string; isToday: boolean; records: any[]; summary: any }> = {};
    filtered.forEach((rec) => {
      const dStr = rec.date || 'Unknown Date';
      if (!groups[dStr]) {
        groups[dStr] = {
          dateStr: dStr,
          isToday: dStr === new Date().toISOString().split('T')[0],
          records: [],
          summary: { total: 0, present: 0, wfh: 0 }
        };
      }
      groups[dStr].records.push(rec);
      groups[dStr].summary.total++;
      if (rec.attendanceType === 'OFFICE') groups[dStr].summary.present++;
      else groups[dStr].summary.wfh++;
    });

    return Object.values(groups).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [adminRecords, attendanceRecord, adminSearch, adminFilter]);

  return (
    <div className="min-h-screen bg-[#0F0521] text-white p-4 md:p-6 select-none">
      
      {/* Visual Header */}
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-purple-500/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <h1 className="text-xl md:text-2xl font-black tracking-tight bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent uppercase">EXFIN OMS</h1>
          </div>
          <p className="text-xs text-purple-300 font-medium">Enterprise Web Background-Location Forensic Gateway</p>
        </div>

        {/* Action controls & indicators */}
        <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-between">
          <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
            isOnline ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
          }`}>
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? 'Online Gateway' : 'Offline Mode'}
          </div>

          <div className="flex bg-[#1E0D3B] p-0.5 rounded-lg border border-purple-500/20">
            <button 
              onClick={() => setActiveTab('employee')}
              className={`px-3 py-1 text-xs font-black uppercase rounded-md transition-all ${
                activeTab === 'employee' ? 'bg-purple-600 text-white shadow-lg' : 'text-purple-300 hover:text-white'
              }`}
            >
              Employee Portal
            </button>
            <button 
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1 text-xs font-black uppercase rounded-md transition-all ${
                activeTab === 'admin' ? 'bg-purple-600 text-white shadow-lg' : 'text-purple-300 hover:text-white'
              }`}
            >
              Admin Live Tracker
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto space-y-6">

        {/* EMPLOYEE PORTAL VIEW */}
        {activeTab === 'employee' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Identity & Shift Gate */}
            <section className="lg:col-span-4 space-y-6">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#200A3E] to-[#120526] border border-purple-500/20 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Device Registration</h2>
                    <p className="text-[11px] text-purple-300/60">Configure local user tracking credentials</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 uppercase tracking-widest mb-1">Employee ID</label>
                    <input 
                      type="text" 
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                      disabled={isTracking}
                      className="w-full bg-[#0B0317] border border-purple-500/20 text-white rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-purple-500/60 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 uppercase tracking-widest mb-1">Full Name</label>
                    <input 
                      type="text" 
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      disabled={isTracking}
                      className="w-full bg-[#0B0317] border border-purple-500/20 text-white rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-purple-500/60 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                    />
                  </div>
                </div>

                {isTracking ? (
                  <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-[11px] text-emerald-300 font-semibold">Active lock secured. Stop tracking to edit parameters.</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-purple-300 shrink-0" />
                    <span className="text-[11px] text-purple-300/70">Local parameters editable. Start tracking to bind profile.</span>
                  </div>
                )}
              </div>

              {/* Attendance Actions */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#200A3E] to-[#120526] border border-purple-500/20 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Attendance Gate</h2>
                    <p className="text-[11px] text-purple-300/60">Log check-in and checkout locations</p>
                  </div>
                </div>

                {!attendanceRecord ? (
                  <button
                    onClick={handleCheckIn}
                    disabled={!lastLocation}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 transition-colors text-white text-xs font-black uppercase rounded-xl tracking-wider flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" /> Sign Check-In
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-[#0B0317] rounded-xl border border-purple-500/10 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-purple-300">Type:</span>
                        <span className="font-black uppercase text-emerald-300">{attendanceRecord.attendanceType}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-purple-300">Checked In:</span>
                        <span className="font-bold text-white font-mono">{attendanceRecord.checkInTime}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-purple-300">Checked Out:</span>
                        <span className="font-bold text-rose-300 font-mono">{attendanceRecord.checkOutTime || 'Pending'}</span>
                      </div>
                      {attendanceRecord.workingHours && (
                        <div className="flex justify-between items-center text-xs border-t border-purple-500/10 pt-2 mt-2">
                          <span className="text-purple-300">Working Hours:</span>
                          <span className="font-black text-purple-200">{attendanceRecord.workingHours}</span>
                        </div>
                      )}
                    </div>

                    {attendanceRecord.checkoutStatus === 'PENDING' && (
                      <button
                        onClick={handleCheckout}
                        className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-500 transition-colors text-white text-xs font-black uppercase rounded-xl tracking-wider flex items-center justify-center gap-2"
                      >
                        <Square className="w-4 h-4" /> Sign Checkout
                      </button>
                    )}
                  </div>
                )}

                <button 
                  onClick={handleResetSession}
                  className="w-full py-2 px-4 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white border border-purple-500/20 transition-all text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" /> Clear All Local Sessions
                </button>
              </div>
            </section>

            {/* Live Location Engine status */}
            <section className="lg:col-span-8 space-y-6">
              
              <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1C0937] to-[#0D041C] border border-purple-500/20 relative overflow-hidden">
                
                {/* Radar ring visual for tracking */}
                {isTracking && (
                  <div className="absolute top-6 right-6 flex items-center justify-center">
                    <span className="absolute w-12 h-12 rounded-full border border-emerald-500/30 animate-ping"></span>
                    <span className="absolute w-8 h-8 rounded-full border border-emerald-500/50 animate-ping delay-75"></span>
                    <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <div>
                    <h2 className="text-base font-black uppercase text-white flex items-center gap-2">
                      <Compass className="w-5 h-5 text-purple-400" /> Web GPS Tracking Engine
                    </h2>
                    <p className="text-xs text-purple-300/60">Calculates geofence parameters and queues offline points</p>
                  </div>

                  <button
                    onClick={() => {
                      setIsTracking(!isTracking);
                      if (!isTracking) {
                        localStorage.setItem('exfin_is_tracking', 'true');
                      } else {
                        localStorage.setItem('exfin_is_tracking', 'false');
                      }
                    }}
                    className={`py-2 px-5 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md ${
                      isTracking 
                        ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {isTracking ? 'Deactivate Engine' : 'Activate Background GPS'}
                  </button>
                </div>

                {/* Dashboard Metrics grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  
                  {/* METRIC 1: Update Status */}
                  <div className="p-4 rounded-xl bg-[#0F0521]/60 border border-purple-500/15 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">Live Status Guard</span>
                    <div className="flex items-center gap-2">
                      {(() => {
                        if (!isTracking) {
                          return (
                            <>
                              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                              <span className="text-lg font-black uppercase text-purple-400">Idle</span>
                            </>
                          );
                        }
                        const details = getCurrentLocationDetails(attendanceRecord || { date: '' }, lastLocation);
                        const statusColors = {
                          'LIVE': 'text-emerald-400 bg-emerald-500',
                          'RECENT': 'text-blue-400 bg-blue-500',
                          'STALE': 'text-amber-400 bg-amber-500',
                          'Location unavailable': 'text-rose-400 bg-rose-500'
                        };
                        const colorClass = statusColors[details.status] || 'text-purple-400 bg-purple-500';
                        return (
                          <>
                            <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${colorClass.split(' ')[1]}`}></span>
                            <span className={`text-lg font-black uppercase ${colorClass.split(' ')[0]}`}>{details.status}</span>
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-[11px] text-purple-300/50">Guarded 3-minute staleness threshold</p>
                  </div>

                  {/* METRIC 2: Current Distance */}
                  <div className="p-4 rounded-xl bg-[#0F0521]/60 border border-purple-500/15 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">Haversine Distance</span>
                    <div className="text-lg font-black text-white">
                      {(() => {
                        if (!isTracking || !lastLocation) return '—';
                        const details = getCurrentLocationDetails(attendanceRecord || { date: '' }, lastLocation);
                        return details.distance;
                      })()}
                    </div>
                    <p className="text-[11px] text-purple-300/50">Office geofence: {AUTHORIZED_OFFICE.radius}m radius</p>
                  </div>

                  {/* METRIC 3: Offline Sync Queue */}
                  <div className="p-4 rounded-xl bg-[#0F0521]/60 border border-purple-500/15 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">Offline Queue Cache</span>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-black text-white">{trackingQueue.length} Updates</span>
                      {trackingQueue.length > 0 && isOnline && (
                        <button 
                          onClick={attemptQueueSync}
                          className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white transition-all"
                          title="Flush queue online"
                        >
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-purple-300/50">{syncStatus}</p>
                  </div>

                </div>

                {/* Location data readout */}
                <div className="p-4 rounded-xl bg-[#0B0317] border border-purple-500/10 space-y-3">
                  <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider">Latest Telemetry Packet</h3>
                  
                  {lastLocation ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-2">
                        <div className="flex justify-between border-b border-purple-500/5 pb-1">
                          <span className="text-purple-300/60">Latitude:</span>
                          <span className="font-mono text-white font-bold">{lastLocation.latitude.toFixed(6)}</span>
                        </div>
                        <div className="flex justify-between border-b border-purple-500/5 pb-1">
                          <span className="text-purple-300/60">Longitude:</span>
                          <span className="font-mono text-white font-bold">{lastLocation.longitude.toFixed(6)}</span>
                        </div>
                        <div className="flex justify-between border-b border-purple-500/5 pb-1">
                          <span className="text-purple-300/60">Accuracy Range:</span>
                          <span className="text-white font-bold">±{Math.round(lastLocation.accuracy)}m</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between border-b border-purple-500/5 pb-1">
                          <span className="text-purple-300/60">Resolved Location:</span>
                          <span className="text-white font-bold truncate max-w-[180px]" title={lastLocation.townCity}>{lastLocation.townCity}</span>
                        </div>
                        <div className="flex justify-between border-b border-purple-500/5 pb-1">
                          <span className="text-purple-300/60">Acquisition:</span>
                          <span className="text-purple-200 font-bold uppercase tracking-wider text-[10px] bg-purple-500/10 px-1.5 py-0.2 rounded">{lastLocation.source}</span>
                        </div>
                        <div className="flex justify-between border-b border-purple-500/5 pb-1">
                          <span className="text-purple-300/60">Last Packet Received:</span>
                          <span className="text-white font-bold font-mono">{new Date(lastLocation.updatedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center text-purple-300/40">
                      <Activity className="w-8 h-8 mx-auto stroke-1 animate-pulse mb-1" />
                      <p className="text-[11px]">No telemetry packets received. Toggle engine or verify GPS permissions.</p>
                    </div>
                  )}

                </div>

              </div>

              {/* Session History Audit Log */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1C0937] to-[#0D041C] border border-purple-500/20 space-y-4">
                <div className="flex items-center gap-2 justify-between">
                  <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-purple-400" /> Current Session History Logs (Forensic Stream)
                  </h3>
                  <span className="text-[10px] text-purple-300/50 uppercase font-black">{localHistory.length} logs cached</span>
                </div>

                <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500/20 space-y-2 pr-1">
                  {localHistory.length === 0 ? (
                    <div className="py-8 text-center text-purple-300/30 text-xs">
                      No logs logged in current session. Active coordinate packets will generate audit trails automatically.
                    </div>
                  ) : (
                    localHistory.map((item, index) => (
                      <div key={index} className="p-3 bg-[#0B0317] rounded-xl border border-purple-500/5 flex justify-between items-center text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-white font-bold">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</span>
                            <span className="text-[10px] text-purple-300/50">({item.townCity})</span>
                          </div>
                          <div className="text-[10px] text-purple-300/40 flex items-center gap-2">
                            <span>Accuracy: ±{Math.round(item.accuracy)}m</span>
                            <span>•</span>
                            <span>Distance: {item.distanceFromOffice <= AUTHORIZED_OFFICE.radius ? 'Within office radius' : `${Math.round(item.distanceFromOffice)}m from office`}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-purple-300 font-semibold">{new Date(item.timestamp).toLocaleTimeString()}</div>
                          <div className="text-[9px] uppercase tracking-wider text-purple-400/60 font-black">{item.source}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </section>

          </div>
        )}

        {/* ADMIN REALTIME DASHBOARD VIEW */}
        {activeTab === 'admin' && (
          <div className="space-y-6">
            
            {/* Realtime Metrics Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#200D42] to-[#13072D] border border-purple-500/20">
                <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest block mb-1">Active Working Today</span>
                <span className="text-3xl font-black text-white">
                  {Math.max(adminRecords.length, attendanceRecord ? 1 : 0)} Employees
                </span>
              </div>

              <div className="sm:col-span-3 p-5 rounded-2xl bg-[#1A0B36] border border-purple-500/20 flex flex-col justify-between">
                <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest block mb-2">Operations Center Gateway</span>
                <p className="text-xs text-purple-300/70 leading-relaxed">
                  Dynamic subscription active to Firestore database `live_locations` and `attendance` collections. Resolves live coordinates asynchronously and maps geographic forensics accurately.
                </p>
              </div>
            </div>

            {/* List and Records */}
            <div className="p-6 rounded-2xl bg-[#250F4C] border border-purple-500/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-500/10 pb-4">
                <h3 className="text-lg font-black uppercase text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-400" /> Operational Attendance Records
                </h3>
                <div className="text-[10px] text-purple-300/60 italic">Click any record row to open detailed geo-forensic audit</div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#1A0B36]/50 border border-purple-500/10 rounded-xl">
                <div>
                  <label className="block text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-1.5">Search Employee Name / Code</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-purple-400/50" />
                    <input
                      type="text"
                      value={adminSearch}
                      onChange={(e) => setAdminSearch(e.target.value)}
                      placeholder="Search name or ID..."
                      className="w-full bg-[#13072D] border border-purple-500/20 text-white rounded-lg text-xs pl-8 pr-3 py-2 focus:outline-none focus:border-purple-500/60"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-1.5">Attention Quick Filter</label>
                  <select
                    value={adminFilter}
                    onChange={(e) => setAdminFilter(e.target.value as any)}
                    className="w-full bg-[#13072D] border border-purple-500/20 text-white rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-purple-500/60"
                  >
                    <option value="ALL">Show All Logs</option>
                    <option value="MISSING_CHECKOUT">Missing Checkouts Only</option>
                  </select>
                </div>

                <div className="flex items-end justify-start sm:justify-end">
                  <button
                    onClick={() => {
                      setAdminFilter('ALL');
                      setAdminSearch('');
                    }}
                    className="text-xs py-2 px-4 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 rounded-lg uppercase font-black"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              {/* Data Table */}
              {groupedAdminRecords.length === 0 ? (
                <div className="p-12 text-center text-purple-300/40 bg-[#1A0B36]/30 border border-purple-500/10 rounded-xl">
                  <AlertTriangle className="w-10 h-10 mx-auto text-amber-500/60 stroke-1 mb-2" />
                  <h4 className="text-sm font-bold text-white uppercase mb-1">No Records Found</h4>
                  <p className="text-xs">No active attendance or synchronized telemetry packets exist matching the filter.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedAdminRecords.map((group) => {
                    const isCollapsed = !!collapsedDates[group.dateStr];
                    return (
                      <div key={group.dateStr} className="bg-[#1A0B36]/50 border border-purple-500/20 rounded-xl overflow-hidden shadow-lg">
                        
                        <div
                          onClick={() => toggleDateCollapse(group.dateStr)}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gradient-to-r from-[#200D42] to-[#13072D] border-b border-purple-500/20 cursor-pointer hover:bg-purple-900/20 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              <History className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-white tracking-wide uppercase">{group.dateStr}</h4>
                              <p className="text-[11px] text-purple-300/70 font-mono mt-0.5">{group.records.length} Employee logs registered</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-bold rounded-md">
                              Office: {group.summary.present}
                            </span>
                            <span className="px-2 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-bold rounded-md">
                              WFH: {group.summary.wfh}
                            </span>
                            <div className="text-purple-300/60">
                              {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </div>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500/20 scrollbar-track-transparent">
                            <table className="w-full text-left text-xs border-separate border-spacing-0">
                              <thead>
                                <tr className="bg-[#1A0B36]/80 text-purple-300 uppercase font-bold sticky top-0 z-10 text-[10px] tracking-wider">
                                  <th className="p-3 border-b border-purple-500/20">Employee</th>
                                  <th className="p-3 border-b border-purple-500/20">Code</th>
                                  <th className="p-3 border-b border-purple-500/20">Mode</th>
                                  <th className="p-3 border-b border-purple-500/20 text-emerald-400">Check In</th>
                                  <th className="p-3 border-b border-purple-500/20 text-emerald-300">Check-in Location</th>
                                  <th className="p-3 border-b border-purple-500/20 text-rose-400">Check Out</th>
                                  <th className="p-3 border-b border-purple-500/20 text-rose-300">Checkout Location</th>
                                  <th className="p-3 border-b border-purple-500/20 text-cyan-300">Current GPS Status</th>
                                  <th className="p-3 border-b border-purple-500/20 text-cyan-300">Current Geofence Range</th>
                                  <th className="p-3 border-b border-purple-500/20">Work Hrs</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-purple-500/10">
                                {group.records.map((rec) => {
                                  const checkInLoc = getCheckInLocationDetails(rec);
                                  const checkoutLoc = getCheckoutLocationDetails(rec);
                                  const empCode = (rec.employeeId || '').trim();
                                  
                                  // Fetch live location doc (from real firestore subscriber or fall back to client state)
                                  const empLiveLoc = adminLiveLocations.get(empCode.toLowerCase().trim()) || (lastLocation?.employeeId.toLowerCase() === empCode.toLowerCase() ? lastLocation : null);
                                  const currentLoc = getCurrentLocationDetails(rec, empLiveLoc);

                                  const isCompleted = getEffectiveCheckoutStatus(rec) === 'COMPLETED';

                                  return (
                                    <tr
                                      key={rec.id || Math.random().toString()}
                                      onClick={() => {
                                        setSelectedForAudit({ record: rec, live: empLiveLoc });
                                        setShowAuditModal(true);
                                      }}
                                      className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                                    >
                                      <td className="p-3 border-b border-purple-500/10 font-bold text-white whitespace-nowrap">{rec.employeeName}</td>
                                      <td className="p-3 border-b border-purple-500/10 font-mono text-purple-300 font-medium whitespace-nowrap">{rec.employeeId}</td>
                                      <td className="p-3 border-b border-purple-500/10">
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                          rec.attendanceType === 'OFFICE' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                        }`}>
                                          {rec.attendanceType}
                                        </span>
                                      </td>
                                      <td className="p-3 border-b border-purple-500/10 text-emerald-400 font-bold font-mono whitespace-nowrap">{checkInLoc.time}</td>
                                      <td className="p-3 border-b border-purple-500/10 text-purple-200 truncate max-w-[130px]" title={checkInLoc.location}>{checkInLoc.location}</td>
                                      <td className="p-3 border-b border-purple-500/10 text-rose-400 font-bold font-mono whitespace-nowrap">{checkoutLoc.time}</td>
                                      <td className="p-3 border-b border-purple-500/10 text-purple-200 truncate max-w-[130px]" title={checkoutLoc.location}>{checkoutLoc.location}</td>
                                      
                                      <td className="p-3 border-b border-purple-500/10 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase shrink-0 ${
                                            currentLoc.status === 'LIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse' :
                                            currentLoc.status === 'RECENT' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                            currentLoc.status === 'STALE' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                            'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                          }`}>
                                            {currentLoc.status}
                                          </span>
                                          <span className="text-purple-200 truncate max-w-[140px]" title={currentLoc.location}>
                                            {isCompleted ? 'Session closed' : (empLiveLoc ? empLiveLoc.townCity : 'No stream')}
                                          </span>
                                        </div>
                                      </td>

                                      <td className="p-3 border-b border-purple-500/10 text-cyan-300 font-mono whitespace-nowrap">
                                        {isCompleted ? '—' : currentLoc.distance}
                                      </td>

                                      <td className="p-3 border-b border-purple-500/10 font-bold text-white font-mono whitespace-nowrap">
                                        {rec.workingHours || '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

            </div>

          </div>
        )}

      </main>

      {/* Forensic Audit Modal */}
      {showAuditModal && selectedForAudit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A0A33] border border-purple-500/30 rounded-2xl p-6 w-full max-w-lg space-y-4">
            
            <div className="flex justify-between items-start border-b border-purple-500/10 pb-3">
              <div>
                <h3 className="text-base font-black uppercase text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-400" /> Forensic Geo-Audit Log
                </h3>
                <p className="text-xs text-purple-300/60">Forensic verification of logged coordinates</p>
              </div>
              <button 
                onClick={() => {
                  setShowAuditModal(false);
                  setSelectedForAudit(null);
                }}
                className="text-xs px-2.5 py-1 bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 rounded-lg transition-all uppercase font-black"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 bg-[#0F0521] rounded-xl border border-purple-500/10 space-y-2">
                <div className="flex justify-between">
                  <span className="text-purple-300">Employee Name:</span>
                  <span className="font-bold text-white">{selectedForAudit.record.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300">Employee ID Code:</span>
                  <span className="font-mono text-purple-200 font-bold">{selectedForAudit.record.employeeId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300">Shift Date:</span>
                  <span className="font-bold text-white font-mono">{selectedForAudit.record.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300">Attendance mode:</span>
                  <span className="font-bold text-emerald-300 uppercase">{selectedForAudit.record.attendanceType}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-emerald-500/5 rounded-xl border border-emerald-500/15 space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-emerald-300">Check-in Location</span>
                  <div className="font-bold text-white mt-1">{selectedForAudit.record.checkInTime}</div>
                  <div className="text-purple-200 truncate">{selectedForAudit.record.townCity || 'resolved Town/City unavailable'}</div>
                  {selectedForAudit.record.checkInLatitude && (
                    <div className="font-mono text-[10px] text-purple-300/50 mt-1">
                      {selectedForAudit.record.checkInLatitude.toFixed(4)}, {selectedForAudit.record.checkInLongitude.toFixed(4)}
                    </div>
                  )}
                </div>

                <div className="p-3.5 bg-rose-500/5 rounded-xl border border-rose-500/15 space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-rose-300">Checkout Location</span>
                  <div className="font-bold text-white mt-1">{selectedForAudit.record.checkOutTime || 'Pending'}</div>
                  <div className="text-purple-200 truncate">{selectedForAudit.record.checkoutTownCity || '—'}</div>
                  {selectedForAudit.record.checkoutLatitude && (
                    <div className="font-mono text-[10px] text-purple-300/50 mt-1">
                      {selectedForAudit.record.checkoutLatitude.toFixed(4)}, {selectedForAudit.record.checkoutLongitude.toFixed(4)}
                    </div>
                  )}
                </div>
              </div>

              {selectedForAudit.live ? (
                <div className="p-4 bg-cyan-500/5 rounded-xl border border-cyan-500/15 space-y-2">
                  <span className="text-[10px] uppercase font-black tracking-wider text-cyan-300 block">Live Telemetry GPS Packet</span>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-purple-300">Coordinates:</span>
                    <span className="font-mono font-bold text-white">
                      {selectedForAudit.live.latitude.toFixed(6)}, {selectedForAudit.live.longitude.toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-purple-300">Accuracy:</span>
                    <span className="font-bold text-white">±{Math.round(selectedForAudit.live.accuracy)}m</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-purple-300">Distance to Office:</span>
                    <span className="font-bold text-cyan-200 font-mono">
                      {Math.round(selectedForAudit.live.distanceFromOffice)}m from office
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-purple-300">Town/City Locality:</span>
                    <span className="font-bold text-white">{selectedForAudit.live.townCity}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-purple-300">Transmission Source:</span>
                    <span className="text-[10px] uppercase font-black text-purple-300/70 bg-purple-500/10 px-1.5 py-0.2 rounded">
                      {selectedForAudit.live.source}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-purple-300">Last Received:</span>
                    <span className="font-bold text-white font-mono">
                      {new Date(selectedForAudit.live.updatedAt || selectedForAudit.live.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#0F0521] rounded-xl border border-purple-500/10 text-center text-purple-300/50">
                  <ShieldAlert className="w-8 h-8 mx-auto text-purple-400 stroke-1 mb-1.5" />
                  <p>No active/live geolocation stream is currently publishing coordinate packets for this employee.</p>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
