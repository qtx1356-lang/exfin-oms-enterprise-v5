import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PhoneCall, Video, X, Users, PhoneIncoming, PhoneOff, Loader2, ShieldCheck, Mic, Camera } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { auth, db } from '../../services/firebase/config';
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
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const displayName = user?.displayName || loginId || user?.email || 'EXFIN OMS user';
  const selectedRecipients = useMemo(
    () => recipients.filter((person) => selected.includes(person.uid)),
    [recipients, selected],
  );

  useEffect(() => {
    if (!user?.uid) {
      setIncoming([]);
      return;
    }
    const activeDb = (db as any).concrete || db;
    const invitesQuery = query(
      collection(activeDb, 'video_call_invites'),
      where('recipientUid', '==', user.uid),
    );
    return onSnapshot(invitesQuery, (snapshot) => {
      const now = Date.now();
      const pending = snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<IncomingCall, 'id'>) }))
        .filter((item) => item.status === 'pending' && (!item.expiresAt || new Date(item.expiresAt).getTime() > now))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setIncoming(pending.slice(0, 5));
    }, (err) => console.warn('[VideoCalls] Incoming call listener unavailable:', err.message));
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
      <button
        type="button"
        onClick={() => { setOpen((value) => !value); setError(''); }}
        aria-label="Open EXFIN OMS video calls"
        className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-2xl hover:bg-indigo-700"
      >
        <Video className="h-5 w-5" />
        <span>Video calls</span>
        {incoming.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs">{incoming.length}</span>}
      </button>

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

      {activeCall && (
        <div className="fixed inset-0 z-[110] flex flex-col bg-slate-950">
          <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
            <div className="min-w-0">
              <div className="truncate text-sm font-black">{activeCall.title}</div>
              <div className="truncate text-xs text-slate-300">With {activeCall.peerName}</div>
            </div>
            <button type="button" disabled={busy} onClick={() => void leaveCall()} className="flex shrink-0 items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold disabled:opacity-50"><PhoneOff className="h-4 w-4" /> Leave</button>
          </div>
          <iframe
            title="EXFIN OMS Daily video meeting"
            src={activeCall.roomUrl + '?t=' + encodeURIComponent(activeCall.token)}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            allowFullScreen
            className="min-h-0 flex-1 border-0 bg-black"
          />
          <div className="flex items-center justify-center gap-4 bg-slate-900 px-3 py-2 text-xs text-slate-300"><span className="flex items-center gap-1"><Mic className="h-3.5 w-3.5" /> Microphone</span><span className="flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> Camera</span><span>Encrypted transport · private room</span></div>
        </div>
      )}
    </>
  );
};
