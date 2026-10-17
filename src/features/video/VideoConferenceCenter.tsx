import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { diagnoseAndRepairNativePushRegistration } from '../../services/notification/nativePushNotificationService';
import { PhoneCall, X, Users, PhoneIncoming, PhoneOff, Loader2, ShieldCheck } from 'lucide-react';
import { LiveKitMeeting } from './LiveKitMeeting';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { auth } from '../../services/firebase/config';
import { buildApiUrl } from '../../utils/apiConfig';

type Recipient = { uid: string; name: string; employeeCode?: string; role: string; email?: string };
type IncomingCall = {
  id: string;
  callId: string;
  recipientUid: string;
  senderUid: string;
  senderName: string;
  senderRole: string;
  roomUrl: string;
  title: string;
  mode: 'direct' | 'group';
  status: string;
  createdAt?: string;
  expiresAt?: string;
};
type ActiveCall = { callId: string; roomUrl: string; token: string; title: string; peerName: string };
type PushDiagnostic = { recipientUid: string; employeeName: string; tokenCount: number; attempted: number; sent: number; failed: number; errors: string[] };

async function videoApi(path: string, body?: Record<string, unknown>) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Please sign in again to use video calls.');
  const idToken = await currentUser.getIdToken();
  const response = await fetch(buildApiUrl(path), {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + idToken,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || 'Video calling is temporarily unavailable.');
  }
  return payload;
}

export const VideoConferenceCenter: React.FC = () => {
  const { user, role, loginId } = useAdminAuth();
  const isAdmin = role !== 'EMPLOYEE';
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [title, setTitle] = useState('');
  const [incoming, setIncoming] = useState<IncomingCall[]>([]);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pushAlert, setPushAlert] = useState('');
  const [pushAlertCopyStatus, setPushAlertCopyStatus] = useState('');
  const [pushRepairBusy, setPushRepairBusy] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [nativeCallAction, setNativeCallAction] = useState<{ callId: string; action: string; eventId: string } | null>(null);
  const seenNativeCallEventsRef = useRef<Set<string>>(new Set());

  const displayName = user?.displayName || loginId || user?.email || 'EXFIN OMS user';
  const selectedRecipients = useMemo(
    () => recipients.filter((person) => selected.includes(person.uid)),
    [recipients, selected],
  );

  useEffect(() => {
    const openVideoCalls = () => {
      setOpen(true);
      setError('');
    };
    window.addEventListener('exfin:open-video-calls', openVideoCalls);
    return () => window.removeEventListener('exfin:open-video-calls', openVideoCalls);
  }, []);

  useEffect(() => {
    const handleNativeCallAction = (event: Event) => {
      const detail = (event as CustomEvent<{ callId?: string; action?: string; eventId?: string }>).detail;
      const callId = String(detail?.callId || '');
      const action = String(detail?.action || '').toLowerCase();
      const eventId = String(detail?.eventId || callId + ':' + action);
      if (!callId || !['open', 'answer', 'decline'].includes(action)) return;
      if (seenNativeCallEventsRef.current.has(eventId)) return;
      seenNativeCallEventsRef.current.add(eventId);
      if (seenNativeCallEventsRef.current.size > 50) {
        seenNativeCallEventsRef.current = new Set(Array.from(seenNativeCallEventsRef.current).slice(-25));
      }
      if (action === 'open') {
        setOpen(true);
        setError('');
        return;
      }
      setNativeCallAction({ callId, action, eventId });
    };
    window.addEventListener('exfin:native-video-call-action', handleNativeCallAction);
    return () => window.removeEventListener('exfin:native-video-call-action', handleNativeCallAction);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setIncoming([]);
      return;
    }
    // Use the authenticated video API as the fallback source of truth rather than
    // relying only on the client Firestore listener. The API resolves canonical and
    // legacy employee identity IDs server-side, so a UID mismatch cannot hide an invite.
    let disposed = false;
    let polling = false;
    const refreshIncoming = async () => {
      if (disposed || polling || document.visibilityState === 'hidden') return;
      polling = true;
      try {
        const response = await videoApi('/api/video/incoming');
        if (!disposed && Array.isArray(response.invites)) {
          setIncoming(response.invites.slice(0, 5) as IncomingCall[]);
        }
      } catch (err: any) {
        console.warn('[VideoCalls] Incoming-call fallback check failed:', err?.message || err);
      } finally {
        polling = false;
      }
    };
    void refreshIncoming();
    const interval = window.setInterval(() => void refreshIncoming(), 4000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshIncoming(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.uid]);

  const loadRecipients = useCallback(async () => {
    setLoadingRecipients(true);
    setError('');
    try {
      const response = await videoApi('/api/video/recipients');
      setRecipients(Array.isArray(response.recipients) ? response.recipients : []);
    } catch (err: any) {
      setError(err?.message || 'Could not load call recipients.');
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  useEffect(() => {
    if (open && user) void loadRecipients();
  }, [open, user, loadRecipients]);

  const toggleRecipient = (uid: string) => {
    setSelected((previous) => {
      if (previous.includes(uid)) return previous.filter((id) => id !== uid);
      if (mode === 'direct') return [uid];
      return [...previous, uid];
    });
  };

  const changeMode = (nextMode: 'direct' | 'group') => {
    setMode(nextMode);
    if (nextMode === 'direct') setSelected((previous) => previous.slice(0, 1));
  };

  const startCall = async () => {
    if (selectedRecipients.length === 0) {
      setError('Select at least one person to call.');
      return;
    }
    if (mode === 'direct' && selectedRecipients.length !== 1) {
      setError('A direct call can have one recipient.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await videoApi('/api/video/calls', {
        recipientUids: selectedRecipients.map((person) => person.uid),
        mode,
        title: title.trim() || (mode === 'group' ? 'EXFIN OMS group meeting' : 'EXFIN OMS video call'),
      });
      const pushDiagnostics = Array.isArray(response.pushDiagnostics)
        ? response.pushDiagnostics as PushDiagnostic[]
        : [];
      const pushProblems = pushDiagnostics.filter((item) => item.sent === 0);
      if (isAdmin && pushProblems.length > 0) {
        const details = pushProblems.map((item) => {
          if (item.tokenCount === 0) {
            const diagnostic = item.errors?.find((entry) => entry.startsWith('FCM_TOKEN_DIAGNOSTIC'));
            return `${item.employeeName}: no Android FCM token was found. Ask the employee to open EXFIN OMS and keep it open briefly.\n${diagnostic ? 'Backend lookup: ' + diagnostic : ''}`;
          }
          const reason = item.errors?.[0] || 'FCM did not accept the notification.';
          return `${item.employeeName}: ${reason}`;
        }).join('\n');
        setPushAlert('The video call was created, but the employee alert was not sent.\n\n' + details);
        setPushAlertCopyStatus('');
      }
      setActiveCall({
        callId: response.callId,
        roomUrl: response.roomUrl,
        token: response.token,
        title: response.title || 'EXFIN OMS video call',
        peerName: selectedRecipients.map((person) => person.name).join(', '),
      });
      setOpen(false);
      setSelected([]);
      setTitle('');
    } catch (err: any) {
      setError(err?.message || 'Could not start the call.');
    } finally {
      setBusy(false);
    }
  };


  const enableBrowserNotifications = async () => {
    setBusy(true);
    setError('');
    try {
      let publicKey = String((import.meta as any).env?.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
      // Read the public key at runtime as well, so Cloudflare Pages environment changes
      // do not depend on a Vite build-time variable being embedded in the bundle.
      if (!publicKey) {
        const pushConfig = await videoApi('/api/video/push-config');
        publicKey = String(pushConfig.publicKey || '').trim();
      }
      if (!publicKey) throw new Error('Web Push public key is missing. Set VAPID_PUBLIC_KEY in Cloudflare Pages production environment variables and redeploy.');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('This browser does not support push notifications.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to receive incoming calls.');
      const registration = await navigator.serviceWorker.register('/video-call-notifications/sw.js', { scope: '/video-call-notifications/' });
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const padding = '='.repeat((4 - publicKey.length % 4) % 4);
        const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = window.atob(base64);
        const applicationServerKey = new Uint8Array(raw.length);
        for (let index = 0; index < raw.length; index += 1) applicationServerKey[index] = raw.charCodeAt(index);
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
      await videoApi('/api/video/push-subscription', { subscription: subscription.toJSON() as unknown as Record<string, unknown> });
      setError('');
      window.alert('Browser call notifications are enabled on this device.');
    } catch (err: any) {
      setError(err?.message || 'Could not enable browser notifications.');
    } finally {
      setBusy(false);
    }
  };

  const repairAndroidCallAlerts = async () => {
    setPushRepairBusy(true);
    setPushAlertCopyStatus('');
    try {
      const result = await diagnoseAndRepairNativePushRegistration();
      setPushAlert(result);
    } catch (err: any) {
      setPushAlert('Android FCM diagnostic failed: ' + String(err?.message || err));
    } finally {
      setPushRepairBusy(false);
    }
  };

  const acceptCall = async (invite: IncomingCall) => {
    setBusy(true);
    setError('');
    try {
      const response = await videoApi('/api/video/calls/' + encodeURIComponent(invite.callId) + '/accept', {});
      setActiveCall({
        callId: invite.callId,
        roomUrl: response.roomUrl || invite.roomUrl,
        token: response.token,
        title: response.title || invite.title || 'EXFIN OMS video call',
        peerName: response.callerName || invite.senderName || 'EXFIN OMS user',
      });
      setIncoming((previous) => previous.filter((item) => item.id !== invite.id));
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Could not join the call.');
    } finally {
      setBusy(false);
    }
  };

  const declineCall = async (invite: IncomingCall) => {
    setBusy(true);
    try {
      await videoApi('/api/video/calls/' + encodeURIComponent(invite.callId) + '/decline', {});
      setIncoming((previous) => previous.filter((item) => item.id !== invite.id));
    } catch (err: any) {
      setError(err?.message || 'Could not decline the call.');
    } finally {
      setBusy(false);
    }
  };

  // Native notification actions arrive even when the app was previously backgrounded.
  // Wait until Firestore's authenticated invite listener has hydrated the matching call.
  useEffect(() => {
    if (!nativeCallAction || nativeCallAction.action === 'open') return;
    const invite = incoming.find((item) => item.callId === nativeCallAction.callId);
    if (!invite) return;
    const action = nativeCallAction.action;
    setNativeCallAction(null);
    if (action === 'answer') void acceptCall(invite);
    else if (action === 'decline') void declineCall(invite);
  }, [nativeCallAction, incoming, acceptCall, declineCall]);

  const leaveCall = async () => {
    if (!activeCall) return;
    setBusy(true);
    try {
      await videoApi('/api/video/calls/' + encodeURIComponent(activeCall.callId) + '/leave', {});
    } catch (err) {
      console.warn('[VideoCalls] Leave request failed:', err);
    } finally {
      setActiveCall(null);
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {isAdmin && !open && !activeCall && (
        <button
          type="button"
          onClick={() => { setOpen(true); setError(''); }}
          aria-label="Open video calls"
          title="Video calls"
          className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-xl ring-2 ring-white/80 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300"
        >
          <PhoneCall className="h-5 w-5" />
          <span>Video call</span>
        </button>
      )}
      {incoming.length > 0 && !activeCall && (
        <div className="fixed bottom-20 right-4 z-[95] w-[min(92vw,360px)] space-y-3">
          {incoming.map((invite) => (
            <div key={invite.id} className="rounded-2xl border border-indigo-200 bg-white p-4 text-slate-900 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-indigo-100 p-3 text-indigo-700"><PhoneIncoming className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">Incoming video call</div>
                  <div className="truncate text-sm">{invite.senderName || 'EXFIN OMS user'}</div>
                  <div className="mt-1 text-xs text-slate-500">{invite.title || 'EXFIN OMS video call'}{invite.mode === 'group' ? ' · Group meeting' : ''}</div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={busy} onClick={() => void acceptCall(invite)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><PhoneCall className="h-4 w-4" /> Answer</button>
                <button type="button" disabled={busy} onClick={() => void declineCall(invite)} className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><PhoneOff className="h-4 w-4" /> Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && !activeCall && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-2 sm:items-center sm:p-6">
          <div className="max-h-[92vh] w-full max-w-xl overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-lg font-black">EXFIN OMS video calls</div>
                <div className="text-xs text-slate-500">Signed in as {displayName}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close video calls" className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[calc(92vh-80px)] space-y-4 overflow-y-auto p-5">
              <div className="flex items-center gap-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900"><ShieldCheck className="h-4 w-4 shrink-0" /> Private rooms and short-lived participant tokens are issued by the authenticated server.</div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy} onClick={() => void enableBrowserNotifications()} className="rounded-xl border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">Enable browser call notifications</button>
                <span className="text-xs text-slate-500">For browser alerts when this tab is in the background.</span>
              </div>
              {!isAdmin && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-sm font-bold text-amber-950">Android incoming-call alerts</div>
                  <p className="mt-1 text-xs text-amber-900">Run a fresh Firebase token check and securely retry server registration. The token itself is never displayed.</p>
                  <button
                    type="button"
                    disabled={busy || pushRepairBusy}
                    onClick={() => void repairAndroidCallAlerts()}
                    className="mt-2 rounded-xl bg-amber-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {pushRepairBusy ? 'Checking Android alerts…' : 'Repair / diagnose Android call alerts'}
                  </button>
                </div>
              )}
              {isAdmin && (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                  <button type="button" onClick={() => changeMode('direct')} className={'rounded-lg px-3 py-2 text-sm font-bold ' + (mode === 'direct' ? 'bg-white shadow' : 'text-slate-500')}>Direct call</button>
                  <button type="button" onClick={() => changeMode('group')} className={'rounded-lg px-3 py-2 text-sm font-bold ' + (mode === 'group' ? 'bg-white shadow' : 'text-slate-500')}>Group meeting</button>
                </div>
              )}
              <label className="block text-sm font-bold">Meeting title (optional)
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="e.g. Weekly operations review" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal outline-none focus:border-indigo-500" />
              </label>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-bold">{isAdmin ? 'Choose employee(s)' : 'Choose an administrator'}</div>
                  <button type="button" onClick={() => void loadRecipients()} className="text-xs font-bold text-indigo-600">Refresh</button>
                </div>
                {loadingRecipients ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading people…</div>
                ) : recipients.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No eligible recipients were found.</div>
                ) : (
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
                    {recipients.map((person) => (
                      <label key={person.uid} className="flex cursor-pointer items-center gap-3 rounded-xl p-3 hover:bg-slate-50">
                        <input type="checkbox" checked={selected.includes(person.uid)} onChange={() => toggleRecipient(person.uid)} className="h-4 w-4 accent-indigo-600" />
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">{person.role === 'EMPLOYEE' ? <Users className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{person.name}</span>
                          <span className="block truncate text-xs text-slate-500">{person.employeeCode || person.role}{person.email ? ' · ' + person.email : ''}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {mode === 'group' && <div className="text-xs text-slate-500">Group meetings can include multiple employees. Each invitee receives an individual, room-scoped token after answering.</div>}
              {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <button type="button" disabled={busy || loadingRecipients || selectedRecipients.length === 0} onClick={() => void startCall()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === 'group' ? <Users className="h-5 w-5" /> : <PhoneCall className="h-5 w-5" />}
                {busy ? 'Connecting…' : mode === 'group' ? 'Start group meeting' : 'Start video call'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pushAlert && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-3" role="alertdialog" aria-modal="true" aria-labelledby="push-alert-title">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 id="push-alert-title" className="text-lg font-black">Video call alert diagnostic</h2>
              <button type="button" onClick={() => setPushAlert('')} aria-label="Close diagnostic" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <pre className="mt-3 max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-relaxed">{pushAlert}</pre>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={async () => {
                try {
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(pushAlert);
                  } else {
                    const field = document.createElement('textarea');
                    field.value = pushAlert;
                    field.setAttribute('readonly', '');
                    field.style.position = 'fixed';
                    field.style.opacity = '0';
                    document.body.appendChild(field);
                    field.select();
                    const copied = document.execCommand('copy');
                    document.body.removeChild(field);
                    if (!copied) throw new Error('Clipboard unavailable');
                  }
                  setPushAlertCopyStatus('Copied. Paste the diagnostic into this chat.');
                } catch {
                  setPushAlertCopyStatus('Automatic copy was blocked. Press and hold the diagnostic text above, then choose Copy.');
                }
              }} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">Copy diagnostic</button>
              <button type="button" onClick={() => setPushAlert('')} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50">Close</button>
            </div>
            {pushAlertCopyStatus && <p role="status" className="mt-3 text-sm text-slate-600">{pushAlertCopyStatus}</p>}
          </div>
        </div>
      )}

      {activeCall && (
        <LiveKitMeeting
          serverUrl={activeCall.roomUrl}
          token={activeCall.token}
          title={activeCall.title}
          peerName={activeCall.peerName}
          onLeave={() => void leaveCall()}
        />
      )}
    </>
  );
};
