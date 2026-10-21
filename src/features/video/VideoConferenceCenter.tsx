import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { PhoneCall, PhoneIncoming, PhoneOff, Video, X, Loader2 } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { auth, db } from '../../services/firebase/config';
import { buildApiUrl } from '../../utils/apiConfig';
import { acceptNativeWebRtcCall, createNativeWebRtcCall, declineNativeWebRtcCall } from '../../services/calling/nativeWebRtcCallingService';
import { initNativePushNotifications } from '../../services/notification/nativePushNotificationService';

type Recipient = { uid: string; name: string; employeeCode?: string; role: string; email?: string };
type CallDoc = { callId: string; callerUid: string; callerName?: string; recipientUid: string; recipientEmployeeCode?: string; recipientName?: string; title?: string; status: string; expiresAt?: string };
type ActiveCall = { callId: string; peer: RTCPeerConnection; localStream: MediaStream; close: () => Promise<void>; title: string; peerName: string };

async function apiPost(path: string, body: Record<string, unknown> = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Please sign in again before using video calls.');
  const token = await currentUser.getIdToken();
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.error || 'Video calling is temporarily unavailable.');
  return result;
}

export const VideoConferenceCenter: React.FC = () => {
  const { user, role, loginId } = useAdminAuth();
  const isAdmin = String(role || '').toUpperCase() !== 'EMPLOYEE';
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [title, setTitle] = useState('');
  const [incoming, setIncoming] = useState<CallDoc[]>([]);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const displayName = user?.displayName || loginId || user?.email || 'EXFIN OMS';

  useEffect(() => {
    if (!user?.uid || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    let employeeCode = '';
    try {
      const cached = JSON.parse(localStorage.getItem('cached_registration_data') || '{}');
      employeeCode = String(cached.employeeCode || cached.employeeId || localStorage.getItem('registrationId') || '').trim();
    } catch { employeeCode = String(localStorage.getItem('registrationId') || '').trim(); }
    void initNativePushNotifications({ userId: user.uid, uid: user.uid, employeeCode, role: role || 'EMPLOYEE' });
  }, [user?.uid, role]);

  useEffect(() => {
    if (!user?.uid || isAdmin) { setIncoming([]); return; }
    const calls = query(
      collection(db.concrete || db, 'native_webrtc_calls'),
      where('recipientUid', '==', user.uid),
      where('status', '==', 'ringing'),
    );
    return onSnapshot(calls, (snapshot) => {
      const now = Date.now();
      setIncoming(snapshot.docs.map((item) => item.data() as CallDoc).filter((call) =>
        !call.expiresAt || new Date(call.expiresAt).getTime() > now
      ).slice(0, 3));
    }, (err) => console.warn('[NativeWebRTC] Incoming call listener failed:', err));
  }, [user?.uid, isAdmin]);

  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localStream;
  }, [localStream, active]);
  useEffect(() => {
    if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream;
  }, [remoteStream, active]);

  useEffect(() => {
    const openCalls = () => setOpen(true);
    window.addEventListener('exfin:open-video-calls', openCalls);
    return () => window.removeEventListener('exfin:open-video-calls', openCalls);
  }, []);

  const loadRecipients = async () => {
    setBusy(true); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch(buildApiUrl('/api/video/recipients'), { headers: { Authorization: 'Bearer ' + token } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load employees.');
      const people = Array.isArray(result.recipients) ? result.recipients as Recipient[] : [];
      setRecipients(people.filter((person) => person.role === 'EMPLOYEE'));
      setSelectedUid((previous) => previous || people.find((person) => person.role === 'EMPLOYEE')?.uid || '');
    } catch (err: any) { setError(err?.message || 'Could not load employees.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (open && isAdmin) void loadRecipients(); }, [open, isAdmin]);

  const startCall = async () => {
    const recipient = recipients.find((person) => person.uid === selectedUid);
    if (!recipient) { setError('Select an employee first.'); return; }
    setBusy(true); setError('');
    let created: Awaited<ReturnType<typeof createNativeWebRtcCall>> | null = null;
    try {
      created = await createNativeWebRtcCall({
        recipientUid: recipient.uid,
        recipientEmployeeCode: recipient.employeeCode || '',
        recipientName: recipient.name,
        callerName: displayName,
        title: title.trim() || 'EXFIN OMS video call',
        handlers: {
          onRemoteStream: setRemoteStream,
          onError: (err) => setError(err.message || 'WebRTC connection error.'),
        },
      });
      const ring = await apiPost('/api/native-webrtc/calls/' + encodeURIComponent(created.callId) + '/ring');
      if (!ring.success) throw new Error('The employee call alert could not be delivered.');
      setActive({ ...created, title: title.trim() || 'EXFIN OMS video call', peerName: recipient.name });
      setLocalStream(created.localStream);
      setOpen(false);
    } catch (err: any) {
      if (created) await created.close().catch(() => {});
      setError(err?.message || 'Could not start the video call. Check camera and microphone permissions.');
    } finally { setBusy(false); }
  };

  const answerCall = async (call: CallDoc) => {
    setBusy(true); setError('');
    try {
      const accepted = await acceptNativeWebRtcCall(call.callId, {
        onRemoteStream: setRemoteStream,
        onError: (err) => setError(err.message || 'WebRTC connection error.'),
      });
      setActive({ ...accepted, title: accepted.title, peerName: accepted.callerName });
      setLocalStream(accepted.localStream);
      setIncoming((previous) => previous.filter((item) => item.callId !== call.callId));
    } catch (err: any) { setError(err?.message || 'Could not answer the call. Check camera and microphone permissions.'); }
    finally { setBusy(false); }
  };

  const declineCall = async (call: CallDoc) => {
    try { await declineNativeWebRtcCall(call.callId); }
    catch (err: any) { setError(err?.message || 'Could not decline the call.'); }
    setIncoming((previous) => previous.filter((item) => item.callId !== call.callId));
  };

  const endCall = async () => {
    const current = active;
    setActive(null); setLocalStream(null); setRemoteStream(null);
    if (current) await current.close().catch(() => {});
  };

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setError(''); }} aria-label="Open EXFIN video calls"
        className="fixed bottom-20 right-4 z-[80] flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-xl hover:bg-indigo-700">
        <Video className="h-5 w-5" /> Video calls
        {!isAdmin && incoming.length > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs">{incoming.length}</span>}
      </button>

      {!isAdmin && incoming.map((call) => (
        <div key={call.callId} className="fixed inset-x-3 top-4 z-[150] mx-auto max-w-md rounded-2xl border border-indigo-200 bg-white p-4 text-slate-900 shadow-2xl" role="alertdialog" aria-modal="true">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><PhoneIncoming /></span>
            <div className="min-w-0 flex-1"><div className="font-black">{call.callerName || 'EXFIN OMS Admin'} is calling</div><div className="truncate text-sm text-slate-500">{call.title || 'Video call'}</div></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={busy} onClick={() => void answerCall(call)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 font-bold text-white disabled:opacity-50"><PhoneIncoming size={18} /> Answer</button>
            <button disabled={busy} onClick={() => void declineCall(call)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-3 font-bold text-white disabled:opacity-50"><PhoneOff size={18} /> Decline</button>
          </div>
        </div>
      ))}

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div><div className="text-lg font-black">EXFIN OMS video calls</div><div className="text-xs text-slate-500">Signed in as {displayName}</div></div>
              <button onClick={() => setOpen(false)} aria-label="Close video calls" className="rounded-xl p-2 hover:bg-slate-100"><X /></button>
            </div>
            <div className="space-y-4 p-5">
              {isAdmin ? <>
                <label className="block text-sm font-bold">Employee
                  <select value={selectedUid} onChange={(event) => setSelectedUid(event.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal">
                    <option value="">Select employee</option>
                    {recipients.map((person) => <option key={person.uid} value={person.uid}>{person.name}{person.employeeCode ? ' · ' + person.employeeCode : ''}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-bold">Call title (optional)
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="EXFIN OMS video call" className="mt-1 w-full rounded-xl border p-3 font-normal" />
                </label>
                <button disabled={busy || !selectedUid} onClick={() => void startCall()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin" /> : <PhoneCall />} {busy ? 'Starting call…' : 'Call employee'}
                </button>
              </> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Incoming calls will appear here automatically. Keep Android notifications enabled to receive call alerts when the app is in the background.</p>}
              {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            </div>
          </div>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-[180] flex flex-col bg-slate-950 p-3 text-white sm:p-5">
          <div className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><div className="font-black">{active.title}</div><div className="text-sm text-slate-300">Connected to {active.peerName}</div></div><button onClick={() => void endCall()} className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 font-bold"><PhoneOff size={18} /> End</button></div>
          <div className="grid min-h-0 flex-1 gap-3 py-3 md:grid-cols-2">
            <div className="relative min-h-48 overflow-hidden rounded-2xl bg-slate-900"><video ref={remoteVideo} autoPlay playsInline className="h-full w-full object-contain" /><span className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-2 py-1 text-sm">{active.peerName}</span></div>
            <div className="relative min-h-40 overflow-hidden rounded-2xl bg-slate-900"><video ref={localVideo} autoPlay muted playsInline className="h-full w-full object-contain" /><span className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-2 py-1 text-sm">You</span></div>
          </div>
        </div>
      )}
    </>
  );
};
