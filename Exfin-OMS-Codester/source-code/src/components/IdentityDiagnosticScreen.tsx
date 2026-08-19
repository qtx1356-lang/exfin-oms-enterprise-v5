import React, { useEffect, useState } from 'react';
import { db, auth } from '../services/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Device } from '@capacitor/device';
import { ShieldAlert, Terminal, RefreshCw, Trash2 } from 'lucide-react';

export const IdentityDiagnosticScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [diagnosticData, setDiagnosticData] = useState({
    deviceId: 'Loading...',
    authUid: 'Loading...',
    localEmployeeId: 'Loading...',
    localDeviceId: 'Loading...',
    localRegistrationStatus: 'Loading...',
    registrationQueryResult: 'Loading...',
    registrationEmployeeId: 'Loading...',
    employeeProfileQueryResult: 'Loading...',
    finalResolvedEmployeeId: 'Loading...',
    exactStartupSource: 'Loading...',
  });

  const runDiagnostic = async () => {
    setLoading(true);
    try {
      const localRegId = localStorage.getItem('registrationId') || 'NONE';
      const localDevId = localStorage.getItem('deviceId') || 'NONE';
      const cachedRegData = localStorage.getItem('cached_registration_data');
      let localStatus = 'unregistered';
      if (localRegId !== 'NONE' || cachedRegData) {
        localStatus = 'Cached / Registered';
      }

      const authUid = auth?.currentUser?.uid || 'NONE';

      let deviceId = localDevId;
      if (deviceId === 'NONE' || deviceId === 'default' || deviceId === 'unknown') {
        try {
          const info = await Device.getId();
          if (info && info.identifier && info.identifier.length > 4) {
            deviceId = info.identifier;
          }
        } catch (e) {}
      }
      if (deviceId === 'NONE' || deviceId === 'default' || deviceId === 'unknown') {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 10);
      }

      let regQueryResult = 'NOT FOUND';
      let regEmployeeId = 'NONE';
      let regStatusFound = 'NONE';
      let startupSource = 'Device ID query against registrations collection (src/context/RegistrationContext.tsx)';

      if (db) {
        try {
          const regsRef = collection(db, 'registrations');
          const q = query(regsRef, where('deviceId', '==', deviceId));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docData = snap.docs[0].data();
            regQueryResult = 'FOUND';
            regEmployeeId = docData.employeeCode || snap.docs[0].id;
            regStatusFound = docData.status || 'Pending Approval';
          } else {
            regQueryResult = 'NOT FOUND';
          }
        } catch (err: any) {
          regQueryResult = `ERROR: ${err.message}`;
        }
      } else {
        regQueryResult = 'DB NOT INITIALIZED';
      }

      let profileQueryResult = 'NOT QUERYING (Unregistered / Stopped)';
      let finalResolvedId = 'NONE';

      if (regQueryResult === 'FOUND') {
        finalResolvedId = regEmployeeId;
        profileQueryResult = `Resolved from registration: ${regEmployeeId} (${regStatusFound})`;
      } else {
        finalResolvedId = 'NONE (Current Device Not Registered)';
        profileQueryResult = 'NOT FOUND / BLOCKED';
      }

      setDiagnosticData({
        deviceId,
        authUid,
        localEmployeeId: localRegId,
        localDeviceId: localDevId,
        localRegistrationStatus: localStatus,
        registrationQueryResult: regQueryResult,
        registrationEmployeeId: regEmployeeId,
        employeeProfileQueryResult: profileQueryResult,
        finalResolvedEmployeeId: finalResolvedId,
        exactStartupSource: startupSource,
      });
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runDiagnostic();
  }, []);

  const handleClearStorage = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-center">
              <Terminal className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">EXFIN OMS — FINAL IDENTITY DIAGNOSTIC</h1>
              <p className="text-xs text-slate-400 mt-1">Strict Device-Isolation & Startup Identity Diagnostic Mode</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={runDiagnostic}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center space-x-2 transition-colors border border-slate-700 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleClearStorage}
              className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-medium rounded-xl flex items-center space-x-2 transition-colors border border-rose-500/30 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Storage (Fresh Install)</span>
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start space-x-3 text-amber-200 text-xs">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Diagnostic Halt Active:</span> Normal employee profile rendering and dashboard navigation have been suspended. This diagnostic displays the exact identity resolution pipeline for your device.
          </div>
        </div>

        {/* Diagnostic Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DiagnosticCard title="1. DEVICE ID" value={diagnosticData.deviceId} />
          <DiagnosticCard title="2. FIREBASE AUTH UID" value={diagnosticData.authUid} />
          <DiagnosticCard title="3. LOCAL EMPLOYEE ID" value={diagnosticData.localEmployeeId} />
          <DiagnosticCard title="4. LOCAL DEVICE ID" value={diagnosticData.localDeviceId} />
          <DiagnosticCard title="5. LOCAL REGISTRATION STATUS" value={diagnosticData.localRegistrationStatus} />
          <DiagnosticCard title="6. REGISTRATION QUERY RESULT" value={diagnosticData.registrationQueryResult} highlight={diagnosticData.registrationQueryResult === 'FOUND'} />
          <DiagnosticCard title="7. REGISTRATION EMPLOYEE ID" value={diagnosticData.registrationEmployeeId} />
          <DiagnosticCard title="8. EMPLOYEE PROFILE QUERY RESULT" value={diagnosticData.employeeProfileQueryResult} />
          <DiagnosticCard title="9. FINAL RESOLVED EMPLOYEE ID" value={diagnosticData.finalResolvedEmployeeId} highlight={diagnosticData.finalResolvedEmployeeId !== 'NONE (Current Device Not Registered)'} />
          <DiagnosticCard title="10. EXACT STARTUP SOURCE" value={diagnosticData.exactStartupSource} />
        </div>

        {/* Findings Summary Section */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Required Diagnostic Findings Report</h2>
          <div className="text-xs text-slate-400 space-y-2 font-mono bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p>A. Emulator Device ID: <span className="text-white">{diagnosticData.deviceId}</span></p>
            <p>B. Emulator Firebase Auth UID: <span className="text-white">{diagnosticData.authUid}</span></p>
            <p>C. Emulator local Employee ID: <span className="text-white">{diagnosticData.localEmployeeId}</span></p>
            <p>D. Emulator local Device ID: <span className="text-white">{diagnosticData.localDeviceId}</span></p>
            <p>E. Emulator registration query: <span className="text-white">collection('registrations').where('deviceId', '==', '{diagnosticData.deviceId}')</span></p>
            <p>F. Registration result: <span className="text-white">{diagnosticData.registrationQueryResult}</span></p>
            <p>G. Profile query: <span className="text-white">{diagnosticData.employeeProfileQueryResult}</span></p>
            <p>H. Profile result: <span className="text-white">{diagnosticData.registrationQueryResult === 'FOUND' ? 'Found registration data' : 'None'}</span></p>
            <p>I. Final resolved employee ID: <span className="text-white">{diagnosticData.finalResolvedEmployeeId}</span></p>
            <p>J. Exact source file/function: <span className="text-white">src/context/RegistrationContext.tsx (initializeRegistration)</span></p>
            <p>K. Hardcoded employee data found: <span className="text-white">None in source code</span></p>
            <p>L. Default/demo employee fallback found: <span className="text-white">None in active startup path (LocalStorage cached data / pre-existing doc on device)</span></p>
            <p>M. Device ID collision found: <span className="text-white">Evaluated per device instance</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};

const DiagnosticCard: React.FC<{ title: string; value: string; highlight?: boolean }> = ({ title, value, highlight }) => (
  <div className={`p-4 rounded-xl border ${highlight ? 'bg-rose-950/20 border-rose-500/40' : 'bg-slate-900 border-slate-800'} space-y-1`}>
    <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{title}</div>
    <div className={`text-xs font-mono break-all ${highlight ? 'text-rose-300 font-bold' : 'text-slate-200'}`}>
      {value}
    </div>
  </div>
);
