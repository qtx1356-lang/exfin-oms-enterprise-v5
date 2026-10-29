import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Copy, Loader2, Share2, Video } from 'lucide-react';

type MeetRecipient = { uid: string; name: string; phone?: string; mobile?: string; mobileNumber?: string; whatsapp?: string; email?: string };
type Props = { recipients: MeetRecipient[]; selectedUids: string[]; title: string; adminName: string };

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initTokenClient: (config: any) => { requestAccessToken: (options?: any) => void } } } };
  }
}

const GOOGLE_CLIENT_ID = String((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
let cachedAccessToken = '';
let tokenExpiresAt = 0;
const GOOGLE_CALENDAR_SCOPE_GRANTED = 'EXFIN_GOOGLE_CALENDAR_SCOPE_GRANTED';

function toLocalDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) return Promise.resolve(cachedAccessToken);
  return new Promise(async (resolve, reject) => {
    try {
      if (!GOOGLE_CLIENT_ID) throw new Error('Google Meet is not configured yet. Add VITE_GOOGLE_CLIENT_ID to the Cloudflare Pages environment variables and redeploy.');
      await loadGoogleIdentity();
      const oauth = window.google?.accounts?.oauth2;
      if (!oauth) throw new Error('Google authorization could not be initialized.');
      const client = oauth.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_CALENDAR_SCOPE,
        callback: (response: any) => {
          if (response?.access_token) {
            cachedAccessToken = String(response.access_token);
            tokenExpiresAt = Date.now() + Math.max(60, Number(response.expires_in) || 3600) * 1000;
            try { sessionStorage.setItem(GOOGLE_CALENDAR_SCOPE_GRANTED, 'yes'); } catch { /* session storage may be disabled */ }
            resolve(cachedAccessToken);
          } else reject(new Error(response?.error_description || response?.error || 'Google Calendar authorization was cancelled.'));
        },
        error_callback: (error: any) => reject(new Error(error?.message || 'Google authorization popup was blocked. Allow popups and try again.')),
      });
      client.requestAccessToken();
    } catch (error) { reject(error); }
  });
}

export const GoogleMeetSharePanel: React.FC<Props> = ({ recipients, selectedUids, title, adminName }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [meetUrl, setMeetUrl] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDateTime, setMeetingDateTime] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 1000)));
  const selected = recipients.filter((person) => selectedUids.includes(person.uid));
  const minimumDateTime = useMemo(() => toLocalDateTimeInput(new Date()), []);

  useEffect(() => { void loadGoogleIdentity().catch(() => {}); }, []);

  const createMeet = async () => {
    if (!selected.length) { setError('Select at least one employee first.'); return; }
    if (!meetingDateTime) { setError('Select the meeting date and time first.'); return; }
    const start = new Date(meetingDateTime);
    if (Number.isNaN(start.getTime())) { setError('The selected meeting date and time is invalid.'); return; }
    if (start.getTime() < Date.now()) { setError('Please select a future meeting date and time.'); return; }

    setBusy(true); setError('');
    try {
      let token = await getAccessToken();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const eventTitle = title.trim() || 'EXFIN OMS Google Meet';
      const attendees = selected.filter((person) => person.email && person.email.includes('@')).map((person) => ({ email: person.email }));
      const eventBody = {
        summary: eventTitle,
        description: `EXFIN OMS meeting created by ${adminName}. Invitees selected in EXFIN OMS: ${selected.map((person) => person.name).join(', ')}.`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees,
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      };
      let response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody),
      });
      if (response.status === 401) {
        cachedAccessToken = ''; tokenExpiresAt = 0; token = await getAccessToken(true);
        response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody),
        });
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message || 'Google Calendar could not create a Meet link. Check that Calendar API is enabled and Calendar access is authorized.');
      let eventResult = result;
      let videoLink = String(eventResult?.hangoutLink || eventResult?.conferenceData?.entryPoints?.find((entry: any) => entry.entryPointType === 'video')?.uri || '');
      for (let attempt = 0; !videoLink && eventResult?.id && attempt < 5; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        const check = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(String(eventResult.id))}?conferenceDataVersion=1`, { headers: { Authorization: `Bearer ${token}` } });
        if (check.ok) {
          eventResult = await check.json().catch(() => eventResult);
          videoLink = String(eventResult?.hangoutLink || eventResult?.conferenceData?.entryPoints?.find((entry: any) => entry.entryPointType === 'video')?.uri || '');
        }
      }
      if (!videoLink) throw new Error('Google created the calendar event but has not returned a Meet link yet. Check Google Calendar before retrying to avoid duplicate events.');
      setMeetUrl(videoLink);
      setMeetingTitle(eventTitle);
    } catch (err: any) { setError(err?.message || 'Could not create the Google Meet.'); }
    finally { setBusy(false); }
  };

  const shareWithSelected = async () => {
    if (!meetUrl) return;
    const names = selected.map((person) => person.name).filter(Boolean);
    const scheduled = new Date(meetingDateTime);
    const scheduledText = Number.isNaN(scheduled.getTime()) ? meetingDateTime : scheduled.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const message = `EXFIN OMS Google Meet: ${meetingTitle}\n\nScheduled: ${scheduledText}\n\nSelected employees: ${names.join(', ')}\n\nMeet link: ${meetUrl}\n\nPlease join at the scheduled time.\n— ${adminName}, EXFIN OMS`;
    try {
      if (typeof navigator.share === 'function') await navigator.share({ title: meetingTitle, text: message, url: meetUrl });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(message); setError('Meeting invitation copied. Open WhatsApp, choose a group or recipient, and paste it.'); }
      else setError('Sharing is unavailable in this browser. Copy the Meet link and share it manually: ' + meetUrl);
    } catch (err: any) { if (err?.name !== 'AbortError') setError(err?.message || 'Could not open the share menu. Copy the link and share it manually.'); }
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
        <p className="mt-1 text-xs leading-relaxed text-slate-600">Choose the meeting date and time, create the Google Meet link, and share one invitation containing the selected employees' names.</p>
      </div>
    </div>

    <div className="rounded-xl border border-emerald-200 bg-white p-3">
      <label htmlFor="google-meet-datetime" className="mb-1 block text-sm font-bold text-slate-800">Meeting date &amp; time</label>
      <input id="google-meet-datetime" type="datetime-local" min={minimumDateTime} value={meetingDateTime} onChange={(event) => setMeetingDateTime(event.target.value)} disabled={busy || !!meetUrl} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100" />
      <p className="mt-1 text-xs text-slate-500">The meeting will be scheduled for 1 hour from the selected start time.</p>
    </div>

    <button type="button" disabled={busy || !!meetUrl || !selected.length} onClick={() => void createMeet()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50">
      {busy ? <Loader2 className="animate-spin" size={18} /> : <CalendarPlus size={18} />}
      {busy ? 'Creating Google Meet…' : `Create Google Meet (${selected.length} selected)`}
    </button>

    {meetUrl && <div className="space-y-3 rounded-xl border border-emerald-200 bg-white p-3">
      <div className="text-sm font-bold text-slate-900">Meeting link ready</div>
      <div className="text-xs font-semibold text-slate-600">Scheduled: {new Date(meetingDateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
      <a href={meetUrl} target="_blank" rel="noreferrer" className="break-all text-sm font-semibold text-emerald-800 underline">{meetUrl}</a>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void copyLink()} className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold text-slate-800"><Copy size={16} /> Copy link</button>
        <button type="button" onClick={() => void shareWithSelected()} className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white"><Share2 size={16} /> Share invitation</button>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">This opens your device's share menu so you can choose WhatsApp and send the invitation to a group or contact. WhatsApp does not let a website automatically send separate messages to multiple individual chats; that requires the WhatsApp Business API.</p>
    </div>}
    {error && <div role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
  </section>;
};
