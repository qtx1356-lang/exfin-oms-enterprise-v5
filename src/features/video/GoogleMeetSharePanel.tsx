import React, { useEffect, useState } from 'react';
import { CalendarPlus, Copy, ExternalLink, Loader2, MessageCircle, Video } from 'lucide-react';

type MeetRecipient = { uid: string; name: string; phone?: string; mobile?: string; mobileNumber?: string; whatsapp?: string; email?: string };
type Props = { recipients: MeetRecipient[]; selectedUids: string[]; title: string; adminName: string };

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initTokenClient: (config: any) => { requestAccessToken: (options?: any) => void } } } };
  }
}

const GOOGLE_CLIENT_ID = String((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in. Check your internet connection.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your internet connection.'));
    document.head.appendChild(script);
  });
}

function getAccessToken(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!GOOGLE_CLIENT_ID) throw new Error('Google Meet is not configured yet. Add VITE_GOOGLE_CLIENT_ID to the Cloudflare Pages environment variables and redeploy.');
      await loadGoogleIdentity();
      const oauth = window.google?.accounts?.oauth2;
      if (!oauth) throw new Error('Google authorization could not be initialized.');
      const client = oauth.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_CALENDAR_SCOPE,
        callback: (response: any) => response?.access_token ? resolve(String(response.access_token)) : reject(new Error(response?.error_description || response?.error || 'Google Calendar authorization was cancelled.')),
        error_callback: (error: any) => reject(new Error(error?.message || 'Google authorization popup was blocked. Allow popups and try again.')),
      });
      client.requestAccessToken({ prompt: 'consent' });
    } catch (error) { reject(error); }
  });
}

function normalizedPhone(recipient: MeetRecipient): string {
  const raw = String(recipient.phone || recipient.mobile || recipient.mobileNumber || recipient.whatsapp || '').trim();
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export const GoogleMeetSharePanel: React.FC<Props> = ({ recipients, selectedUids, title, adminName }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [meetUrl, setMeetUrl] = useState('');
  const [eventUrl, setEventUrl] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const selected = recipients.filter((person) => selectedUids.includes(person.uid));

  useEffect(() => { void loadGoogleIdentity().catch(() => {}); }, []);

  const createMeet = async () => {
    if (!selected.length) { setError('Select at least one employee first.'); return; }
    setBusy(true); setError('');
    try {
      const token = await getAccessToken();
      const now = new Date();
      const start = new Date(now.getTime() + 2 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const eventTitle = title.trim() || 'EXFIN OMS Google Meet';
      const attendees = selected.filter((person) => person.email && person.email.includes('@')).map((person) => ({ email: person.email }));
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: eventTitle,
          description: `EXFIN OMS meeting created by ${adminName}. Invitees selected in EXFIN OMS: ${selected.map((person) => person.name).join(', ')}.`,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees,
          conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) throw new Error('Google authorization expired. Select Create Google Meet again and approve Calendar access.');
        throw new Error(result?.error?.message || 'Google Calendar could not create a Meet link. Check that Calendar API is enabled for the Google Cloud project.');
      }
      const videoLink = String(result?.hangoutLink || result?.conferenceData?.entryPoints?.find((entry: any) => entry.entryPointType === 'video')?.uri || '');
      if (!videoLink) throw new Error('Google created the calendar event but has not returned a Meet link yet. Wait a few seconds and try creating a new meeting.');
      setMeetUrl(videoLink);
      setEventUrl(String(result?.htmlLink || ''));
      setMeetingTitle(eventTitle);
    } catch (err: any) { setError(err?.message || 'Could not create the Google Meet.'); }
    finally { setBusy(false); }
  };

  const shareOnWhatsApp = (recipient: MeetRecipient) => {
    if (!meetUrl) return;
    const phone = normalizedPhone(recipient);
    const message = `Hello ${recipient.name},\n\nYou are invited to: ${meetingTitle}\nGoogle Meet: ${meetUrl}\n\nPlease join at the scheduled time.\n— ${adminName}, EXFIN OMS`;
    const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(meetUrl); }
    catch { setError('Clipboard access is unavailable. Please copy the link manually: ' + meetUrl); }
  };

  return <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
    <div className="flex items-start gap-3">
      <span className="rounded-xl bg-emerald-100 p-2 text-emerald-800"><Video size={20} /></span>
      <div className="min-w-0 flex-1">
        <div className="font-black text-slate-900">Google Meet + WhatsApp</div>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">Create a real Google Meet link, then open WhatsApp for each selected employee. EXFIN OMS will not use its current in-app calling/FCM flow for this meeting.</p>
      </div>
    </div>
    <button type="button" disabled={busy || !selected.length} onClick={() => void createMeet()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50">
      {busy ? <Loader2 className="animate-spin" size={18} /> : <CalendarPlus size={18} />}
      {busy ? 'Creating Google Meet…' : `Create Google Meet (${selected.length} selected)`}
    </button>
    {meetUrl && <div className="space-y-3 rounded-xl border border-emerald-200 bg-white p-3">
      <div className="text-sm font-bold text-slate-900">Meeting link ready</div>
      <a href={meetUrl} target="_blank" rel="noreferrer" className="break-all text-sm font-semibold text-emerald-800 underline">{meetUrl}</a>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void copyLink()} className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold text-slate-800"><Copy size={16} /> Copy link</button>
        {eventUrl && <a href={eventUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold text-slate-800"><ExternalLink size={16} /> Calendar event</a>}
      </div>
      <div className="text-xs font-bold text-slate-700">Share with selected employees</div>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {selected.map((person) => <div key={person.uid} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2">
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-900">{person.name}</div><div className="text-xs text-slate-500">{normalizedPhone(person) ? 'WhatsApp number available' : 'WhatsApp will ask you to choose a contact'}</div></div>
          <button type="button" onClick={() => shareOnWhatsApp(person)} className="flex shrink-0 items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white"><MessageCircle size={15} /> WhatsApp</button>
        </div>)}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">WhatsApp requires the sender to confirm each message. EXFIN OMS cannot silently send messages or select multiple WhatsApp chats automatically.</p>
    </div>}
    {error && <div role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
  </section>;
};
