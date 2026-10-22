import { auth } from '../firebase/config';
import { buildApiUrl } from '../../utils/apiConfig';

export type SfuPublication = {
  publicationId?: string;
  uid: string;
  sessionId: string;
  tracks: Array<{ trackName: string; kind?: string; mid?: string }>;
};

export type ConferenceSnapshot = {
  conference: { conferenceId: string; title: string; callerUid: string; status: string; expiresAt: string };
  participants: Array<{ uid: string; name: string; role: string; status: string }>;
  publications: SfuPublication[];
};

type ApiResult = any;

async function api(path: string, init: RequestInit = {}): Promise<ApiResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Please sign in again before joining the video conference.');
  const token = await currentUser.getIdToken();
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error || 'Video conference service is temporarily unavailable.');
  return body;
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 5000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(cleanup, timeoutMs);
    const onState = () => { if (pc.iceGatheringState === 'complete') cleanup(); };
    const cleanup = () => { window.clearTimeout(timeout); pc.removeEventListener('icegatheringstatechange', onState); resolve(); };
    pc.addEventListener('icegatheringstatechange', onState);
  });
}

export async function getConferenceSnapshot(conferenceId: string): Promise<ConferenceSnapshot> { return api(`/api/video-conference/${encodeURIComponent(conferenceId)}/snapshot`); }
export async function joinConference(conferenceId: string, displayName: string) { return api(`/api/video-conference/${encodeURIComponent(conferenceId)}/join`, { method: 'POST', body: JSON.stringify({ displayName }) }); }
export async function createConference(participantUids: string[], title: string, adminName: string) { return api('/api/video-conference/create', { method: 'POST', body: JSON.stringify({ participantUids, title, adminName }) }); }

export async function publishConferenceMedia(conferenceId: string, peerConnection: RTCPeerConnection, tracks: RTCRtpTransceiver[]) {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await waitForIceGathering(peerConnection);
  const local = peerConnection.localDescription || offer;
  const result = await api(`/api/video-conference/${encodeURIComponent(conferenceId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ sessionDescription: { type: local.type, sdp: local.sdp }, tracks: tracks.map(({ mid, sender }) => ({ location: 'local', mid, trackName: sender.track?.id, kind: sender.track?.kind })) }),
  });
  await peerConnection.setRemoteDescription(result.sessionDescription);
  return result as { sessionId: string; tracks: Array<{ trackName: string; mid: string; kind: string }> };
}

export async function subscribeConferenceMedia(conferenceId: string, publications: SfuPublication[], sessionId?: string) {
  return api(`/api/video-conference/${encodeURIComponent(conferenceId)}/subscribe`, { method: 'POST', body: JSON.stringify({ publications, sessionId }) }) as Promise<{
    sessionId: string; sessionDescription: RTCSessionDescriptionInit | null; requiresImmediateRenegotiation: boolean;
    tracks: Array<{ mid: string; trackName: string; kind?: string }>; empty?: boolean;
  }>;
}
export async function leaveConference(conferenceId: string) { return api(`/api/video-conference/${encodeURIComponent(conferenceId)}/leave`, { method: 'POST' }); }
export async function endConference(conferenceId: string) { return api(`/api/video-conference/${encodeURIComponent(conferenceId)}/end`, { method: 'POST' }); }

export async function getConferenceIceServers(): Promise<RTCIceServer[]> {
  try {
    const result = await api('/api/native-webrtc/ice-servers');
    if (Array.isArray(result.iceServers) && result.iceServers.length) return result.iceServers as RTCIceServer[];
  } catch { /* fall back to Cloudflare public STUN */ }
  return [{ urls: ['stun:stun.cloudflare.com:3478'] }];
}

export function waitForConnection(pc: RTCPeerConnection, timeoutMs = 15000): Promise<void> {
  if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Video connection timed out. Check camera, microphone and network permissions.')); }, timeoutMs);
    const check = () => {
      if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') { cleanup(); resolve(); }
      else if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') { cleanup(); reject(new Error('Video network connection failed.')); }
    };
    const cleanup = () => { window.clearTimeout(timeout); pc.removeEventListener('connectionstatechange', check); pc.removeEventListener('iceconnectionstatechange', check); };
    pc.addEventListener('connectionstatechange', check); pc.addEventListener('iceconnectionstatechange', check); check();
  });
}

export { waitForIceGathering };
