import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Loader2, Mic, MicOff, PhoneIncoming, PhoneOff, Video, VideoOff, X } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { auth } from '../../services/firebase/config';
import { buildApiUrl } from '../../utils/apiConfig';
import { initNativePushNotifications } from '../../services/notification/nativePushNotificationService';
import {
  ConferenceSnapshot,
  SfuPublication,
  createConference,
  endConference,
  getConferenceIceServers,
  getConferenceSnapshot,
  joinConference,
  leaveConference,
  publishConferenceMedia,
  subscribeConferenceMedia,
  waitForConnection,
  waitForIceGathering,
} from '../../services/calling/cloudflareSfuVideoService';

type Recipient = { uid: string; name: string; employeeCode?: string; role: string; email?: string };
type Participant = { uid: string; name: string; role: string; status: string };
type NativeAction = { callId?: string; action?: string; eventId?: string };

async function apiGet(path: string) {
  const currentUser = auth.currentUser; if (!currentUser) throw new Error('Please sign in again.');
  const token = await currentUser.getIdToken(); const response = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json().catch(() => ({})); if (!response.ok || result.success === false) throw new Error(result.error || 'Video conference service is temporarily unavailable.'); return result;
}

export const VideoConferenceCenter: React.FC = () => {
  const { user, role, loginId } = useAdminAuth();
  const isAdmin = String(role || '').toUpperCase() !== 'EMPLOYEE';
  const displayName = user?.displayName || loginId || user?.email || 'EXFIN OMS';
  const [open, setOpen] = useState(false); const [recipients, setRecipients] = useState<Recipient[]>([]); const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [title, setTitle] = useState(''); const [incoming, setIncoming] = useState<Array<{ conferenceId: string; title: string; callerName?: string }>>([]);
  const [conferenceId, setConferenceId] = useState(''); const [conferenceTitle, setConferenceTitle] = useState(''); const [participants, setParticipants] = useState<Participant[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [pushStatus, setPushStatus] = useState(''); const [muted, setMuted] = useState(false); const [cameraOff, setCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null); const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const publishPcRef = useRef<RTCPeerConnection | null>(null); const subscribePcRef = useRef<RTCPeerConnection | null>(null); const localStreamRef = useRef<MediaStream | null>(null);
  const subscribeSessionRef = useRef(''); const subscribedTracksRef = useRef(new Set<string>()); const trackToUidRef = useRef(new Map<string, string>()); const subscribeBusyRef = useRef(false); const conferenceIdRef = useRef('');
  useEffect(() => { conferenceIdRef.current = conferenceId; }, [conferenceId]);

  useEffect(() => {
    if (!user?.uid || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    let employeeCode = ''; try { const cached = JSON.parse(localStorage.getItem('cached_registration_data') || '{}'); employeeCode = String(cached.employeeCode || cached.employeeId || localStorage.getItem('registrationId') || '').trim(); } catch { employeeCode = String(localStorage.getItem('registrationId') || '').trim(); }
    void initNativePushNotifications({ userId: user.uid, uid: user.uid, employeeCode, role: role || 'EMPLOYEE' });
  }, [user?.uid, role]);

  const loadRecipients = async () => {
    setBusy(true); setError(''); try { const result = await apiGet('/api/video/recipients'); const people = Array.isArray(result.recipients) ? result.recipients as Recipient[] : []; setRecipients(people.filter((person) => String(person.role).toUpperCase() === 'EMPLOYEE')); }
    catch (err: any) { setError(err?.message || 'Could not load employees.'); } finally { setBusy(false); }
  };
  useEffect(() => { if (open && isAdmin) void loadRecipients(); }, [open, isAdmin]);
  const activeParticipantCount = useMemo(() => participants.filter((p) => p.status !== 'LEFT').length, [participants]);

  const resetMedia = () => {
    publishPcRef.current?.close(); subscribePcRef.current?.close(); publishPcRef.current = null; subscribePcRef.current = null; subscribeSessionRef.current = ''; subscribeBusyRef.current = false;
    subscribedTracksRef.current.clear(); trackToUidRef.current.clear(); localStreamRef.current?.getTracks().forEach((track) => track.stop()); localStreamRef.current = null; setLocalStream(null); setRemoteStreams({});
  };

  const attachRemoteTrack = (event: RTCTrackEvent) => {
    const uid = trackToUidRef.current.get(event.track.id) || event.track.id;
    setRemoteStreams((previous) => { const stream = previous[uid] || new MediaStream(); if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track); return { ...previous, [uid]: stream }; });
  };

  const renegotiateSubscription = async (id: string, response: Awaited<ReturnType<typeof subscribeConferenceMedia>>) => {
    const pc = subscribePcRef.current; if (!pc || !response.sessionDescription) return;
    await pc.setRemoteDescription(response.sessionDescription); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await waitForIceGathering(pc);
    const currentUser = auth.currentUser; if (!currentUser) throw new Error('Please sign in again.'); const token = await currentUser.getIdToken(); const local = pc.localDescription || answer;
    const result = await fetch(buildApiUrl(`/api/video-conference/${encodeURIComponent(id)}/renegotiate`), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: response.sessionId, sessionDescription: { type: local.type, sdp: local.sdp } }) });
    const body = await result.json().catch(() => ({})); if (!result.ok || body.success === false) throw new Error(body.error || 'Video subscription negotiation failed.'); subscribeSessionRef.current = response.sessionId;
  };

  const syncSubscriptions = async (id: string, snapshot: ConferenceSnapshot) => {
    if (subscribeBusyRef.current) return; const newPublications: SfuPublication[] = [];
    snapshot.publications.forEach((publication) => { const tracks = publication.tracks.filter((track) => { if (!track.trackName || subscribedTracksRef.current.has(track.trackName)) return false; subscribedTracksRef.current.add(track.trackName); trackToUidRef.current.set(track.trackName, publication.uid); return true; }); if (tracks.length) newPublications.push({ ...publication, tracks }); });
    if (!newPublications.length) return; subscribeBusyRef.current = true;
    try {
      if (!subscribePcRef.current) { const iceServers = await getConferenceIceServers(); const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' }); pc.addEventListener('track', attachRemoteTrack); subscribePcRef.current = pc; }
      const response = await subscribeConferenceMedia(id, newPublications, subscribeSessionRef.current || undefined); await renegotiateSubscription(id, response); await waitForConnection(subscribePcRef.current);
    } finally { subscribeBusyRef.current = false; }
  };

  const startMedia = async (id: string) => {
    resetMedia(); const iceServers = await getConferenceIceServers();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 }, frameRate: { ideal: 20, max: 24 } } });
    localStreamRef.current = stream; setLocalStream(stream);
    const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' }); publishPcRef.current = pc;
    const transceivers = stream.getTracks().map((track) => track.kind === 'video' ? pc.addTransceiver(track, { direction: 'sendonly', sendEncodings: [{ scaleResolutionDownBy: 1, rid: 'f' }, { scaleResolutionDownBy: 2, rid: 'h' }, { scaleResolutionDownBy: 4, rid: 'q' }] }) : pc.addTransceiver(track, { direction: 'sendonly' }));
    await publishConferenceMedia(id, pc, transceivers); await waitForConnection(pc);
  };

  const enterConference = async (id: string): Promise<boolean> => {
    setBusy(true); setError('');
    try {
      // A notification can cold-start the WebView before Firebase restores auth.
      // Never attempt the conference API until the authenticated Firebase user exists.
      if (!auth.currentUser || !user?.uid) throw new Error('Restoring your sign-in. Please tap Join again in a moment.');
      const joined = await joinConference(id, displayName); setConferenceId(id); setConferenceTitle(joined.title || 'EXFIN OMS video conference'); setOpen(false);
      const snapshot = await getConferenceSnapshot(id); setParticipants(snapshot.participants || []); await startMedia(id); await syncSubscriptions(id, snapshot);
      return true;
    } catch (err: any) { resetMedia(); setConferenceId(''); setError(err?.message || 'Could not join the video conference. Check camera and microphone permissions.'); setOpen(true); return false; }
    finally { setBusy(false); }
  };

  const startConference = async () => {
    if (!selectedUids.length) { setError('Select at least one employee.'); return; } if (selectedUids.length > 30) { setError('A conference can include up to 30 employees.'); return; }
    setBusy(true); setError(''); setPushStatus('');
    try {
      const created = await createConference(selectedUids, title.trim() || 'EXFIN OMS video conference', displayName);
      const summary = created.pushSummary;
      if (summary && Array.isArray(summary.recipients)) {
        const details = summary.recipients.map((r: any) => {
          const errors = Array.isArray(r.errors) && r.errors.length ? r.errors.join('; ') : '';
          const result = r.sent > 0 ? `FCM accepted (${r.sent}/${r.tokenCount} token(s))` : errors || (r.tokenCount === 0 ? 'NO REGISTERED FCM TOKEN' : 'No successful FCM send reported');
          return `${r.uid}: ${result}`;
        }).join(' | ');
        setPushStatus(`Call-alert delivery report — invited: ${summary.invited}; FCM accepted: ${summary.sent}; failed: ${summary.failed}. ${details || 'No recipient diagnostics returned.'}`);
      } else {
        setPushStatus('Call-alert delivery report unavailable: the deployed API did not return push diagnostics. Check that the latest Video API Worker is deployed.');
      }
      const joined = await enterConference(created.conferenceId);
    } catch (err: any) {
      setError(err?.message || 'Could not start the conference.');
      setBusy(false);
    }
  };

  const leave = async () => {
    const id = conferenceIdRef.current; setBusy(true); try { if (id) { if (isAdmin) await endConference(id); else await leaveConference(id); } }
    catch (err: any) { setError(err?.message || 'Could not end the conference cleanly.'); } finally { resetMedia(); setConferenceId(''); setParticipants([]); setBusy(false); setMuted(false); setCameraOff(false); }
  };
  const toggleMute = () => { const track = localStreamRef.current?.getAudioTracks()[0]; if (!track) return; track.enabled = !track.enabled; setMuted(!track.enabled); };
  const toggleCamera = () => { const track = localStreamRef.current?.getVideoTracks()[0]; if (!track) return; track.enabled = !track.enabled; setCameraOff(!track.enabled); };

  useEffect(() => {
    if (!user?.uid || isAdmin) return; let cancelled = false;
    const loadInvites = async () => { try { const result = await apiGet('/api/video-conference/invitations'); if (!cancelled) setIncoming(Array.isArray(result.invitations) ? result.invitations : []); } catch {} };
    void loadInvites(); const timer = window.setInterval(() => void loadInvites(), 5000); return () => { cancelled = true; window.clearInterval(timer); };
  }, [user?.uid, isAdmin]);

  useEffect(() => {
    if (!conferenceId) return; let stopped = false;
    const sync = async () => { try { const snapshot = await getConferenceSnapshot(conferenceId); if (stopped) return; setParticipants(snapshot.participants || []); await syncSubscriptions(conferenceId, snapshot); } catch (err: any) { if (!stopped && /ended|expired/i.test(err?.message || '')) await leave(); } };
    void sync(); const timer = window.setInterval(() => void sync(), 3500); return () => { stopped = true; window.clearInterval(timer); };
  }, [conferenceId]);

  const [pendingNativeAction, setPendingNativeAction] = useState<NativeAction | null>(null);
  const [authStateVersion, setAuthStateVersion] = useState(0);
  const seenNativeActionsRef = useRef(new Set<string>());
  const processingNativeActionRef = useRef(false);
  const enterConferenceRef = useRef(enterConference);
  enterConferenceRef.current = enterConference;

  useEffect(() => {
    const onNativeAction = (event: Event) => {
      const detail = (event as CustomEvent<NativeAction>).detail || {};
      const id = String(detail.callId || '').trim();
      const action = String(detail.action || '').toLowerCase();
      const eventId = String(detail.eventId || `${id}:${action}`);
      if (!id || !['open', 'answer', 'decline'].includes(action) || seenNativeActionsRef.current.has(eventId)) return;
      if (action === 'decline') {
        seenNativeActionsRef.current.add(eventId);
        setIncoming((previous) => previous.filter((item) => item.conferenceId !== id));
        return;
      }
      // Retain the action until Firebase auth and the React video UI are ready.
      // Do not mark it consumed here: a cold-start event can precede auth restoration.
      setPendingNativeAction(detail);
    };
    window.addEventListener('exfin:native-video-call-action', onNativeAction);
    const pendingWindow = window as Window & { __exfinPendingVideoCallActions?: NativeAction[] };
    const pending = Array.isArray(pendingWindow.__exfinPendingVideoCallActions)
      ? pendingWindow.__exfinPendingVideoCallActions.slice() : [];
    pendingWindow.__exfinPendingVideoCallActions = [];
    pending.forEach((detail) =>
      window.dispatchEvent(new CustomEvent('exfin:native-video-call-action', { detail }))
    );
    return () => window.removeEventListener('exfin:native-video-call-action', onNativeAction);
  }, []);

  useEffect(() => {
    // Firebase may restore its persisted session after the notification event has
    // already been queued. Subscribe explicitly so a pending join is retried when
    // Firebase reports the authenticated user, even if React's user context did
    // not change at the same moment.
    const unsubscribe = auth.onAuthStateChanged(() => setAuthStateVersion((value) => value + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const detail = pendingNativeAction;
    const id = String(detail?.callId || '').trim();
    const action = String(detail?.action || '').toLowerCase();
    const eventId = String(detail?.eventId || `${id}:${action}`);
    if (!detail || !id || !['open', 'answer'].includes(action)
      || !user?.uid || !auth.currentUser
      || seenNativeActionsRef.current.has(eventId)
      || processingNativeActionRef.current) return;

    let cancelled = false;
    processingNativeActionRef.current = true;
    void (async () => {
      try {
        setIncoming((previous) => previous.filter((item) => item.conferenceId !== id));
        const joined = await enterConferenceRef.current(id);
        if (joined) {
          seenNativeActionsRef.current.add(eventId);
          setPendingNativeAction((current) => {
            const currentId = String(current?.callId || '').trim();
            const currentEventId = String(current?.eventId || `${currentId}:${String(current?.action || '').toLowerCase()}`);
            return currentEventId === eventId ? null : current;
          });
        }
        // On failure leave the action unconsumed. The error UI stays visible, and
        // the employee can retry by tapping the invitation or notification again.
      } finally {
        processingNativeActionRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [pendingNativeAction, user?.uid, authStateVersion]);

  const incomingInvite = incoming[0]; const remoteEntries = Object.entries(remoteStreams);
  return <>
    {!conferenceId && <button type="button" onClick={() => { setOpen(true); setError(''); }} aria-label="Open EXFIN video conferences" className="fixed bottom-20 right-4 z-[80] flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-xl hover:bg-indigo-700"><Video className="h-5 w-5" /> Video conference{incoming.length > 0 && !isAdmin && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs">{incoming.length}</span>}</button>}

    {!isAdmin && incomingInvite && !conferenceId && <div className="fixed inset-x-3 top-4 z-[150] mx-auto max-w-md rounded-2xl border border-indigo-200 bg-white p-4 text-slate-900 shadow-2xl" role="alertdialog" aria-modal="true"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><PhoneIncoming /></span><div className="min-w-0 flex-1"><div className="font-black">{incomingInvite.callerName || 'EXFIN OMS Admin'} started a conference</div><div className="truncate text-sm text-slate-500">{incomingInvite.title}</div></div></div><div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => { setIncoming((previous) => previous.filter((item) => item.conferenceId !== incomingInvite.conferenceId)); void enterConference(incomingInvite.conferenceId); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 font-bold text-white disabled:opacity-50"><PhoneIncoming size={18} /> Join</button><button disabled={busy} onClick={() => setIncoming((previous) => previous.filter((item) => item.conferenceId !== incomingInvite.conferenceId))} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-200 px-3 py-3 font-bold text-slate-800 disabled:opacity-50"><PhoneOff size={18} /> Later</button></div></div>}

    {open && !conferenceId && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3"><div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><div><div className="text-lg font-black">EXFIN OMS video conference</div><div className="text-xs text-slate-500">Admin: select up to 30 employees</div></div><button onClick={() => setOpen(false)} aria-label="Close video conferences" className="rounded-xl p-2 hover:bg-slate-100"><X /></button></div><div className="space-y-4 p-5">{isAdmin ? <><div className="flex items-center justify-between"><div className="text-sm font-bold">Employees ({selectedUids.length}/30)</div><button className="text-xs font-bold text-indigo-600" onClick={() => setSelectedUids(selectedUids.length === recipients.length ? [] : recipients.slice(0, 30).map((person) => person.uid))}>{selectedUids.length === recipients.length ? 'Clear all' : 'Select all'}</button></div><div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border p-2">{recipients.map((person) => <label key={person.uid} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50"><input type="checkbox" checked={selectedUids.includes(person.uid)} onChange={() => setSelectedUids((previous) => previous.includes(person.uid) ? previous.filter((uid) => uid !== person.uid) : previous.length < 30 ? [...previous, person.uid] : previous)} /><span className="text-sm font-semibold">{person.name}{person.employeeCode ? ` · ${person.employeeCode}` : ''}</span></label>)}</div><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Conference title (optional)" className="w-full rounded-xl border p-3" /><button disabled={busy || !selectedUids.length} onClick={() => void startConference()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" /> : <Video />} {busy ? 'Starting conference…' : `Start conference (${selectedUids.length})`}</button></> : <div className="space-y-3"><p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">When an admin starts a conference, Android will show an incoming alert even if EXFIN OMS is in the background. You can join from the alert or here.</p>{incoming.map((invite) => <button key={invite.conferenceId} onClick={() => void enterConference(invite.conferenceId)} className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:bg-slate-50"><span><b>{invite.callerName || 'EXFIN OMS Admin'}</b><span className="block text-sm text-slate-500">{invite.title}</span></span><PhoneIncoming /></button>)}</div>}{pushStatus && <div role="status" aria-live="polite" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{pushStatus}</div>}{error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}</div></div></div>}

    {conferenceId && <div className="fixed inset-0 z-[180] flex flex-col bg-slate-950 p-3 text-white sm:p-5"><div className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><div className="font-black">{conferenceTitle}</div><div className="text-sm text-slate-300">{activeParticipantCount} participant{activeParticipantCount === 1 ? '' : 's'} connected</div></div><div className="flex items-center gap-2"><button onClick={toggleMute} className="rounded-xl bg-slate-800 p-3" title={muted ? 'Unmute' : 'Mute'}>{muted ? <MicOff /> : <Mic />}</button><button onClick={toggleCamera} className="rounded-xl bg-slate-800 p-3" title={cameraOff ? 'Turn camera on' : 'Turn camera off'}>{cameraOff ? <VideoOff /> : <Video />}</button><button disabled={busy} onClick={() => void leave()} className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 font-bold"><PhoneOff size={18} /> {isAdmin ? 'End' : 'Leave'}</button></div></div><div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto py-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{remoteEntries.map(([uid, stream]) => <RemoteTile key={uid} uid={uid} stream={stream} name={participants.find((person) => person.uid === uid)?.name || 'Employee'} />)}{localStream && <LocalTile stream={localStream} name={`${displayName} (You)`} />}</div>{pushStatus && <div role="status" aria-live="polite" className="rounded-xl border border-amber-300 bg-amber-950 p-3 text-sm text-amber-100">{pushStatus}</div>}{error && <div role="alert" className="rounded-xl bg-red-900/80 p-3 text-sm text-white">{error}</div>}</div>}
  </>;
};

const RemoteTile: React.FC<{ uid: string; stream: MediaStream; name: string }> = ({ stream, name }) => { const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]); return <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900"><video ref={ref} autoPlay playsInline className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-bold">{name}</span></div>; };
const LocalTile: React.FC<{ stream: MediaStream; name: string }> = ({ stream, name }) => { const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]); return <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-800"><video ref={ref} autoPlay muted playsInline className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-bold">{name}</span></div>; };
