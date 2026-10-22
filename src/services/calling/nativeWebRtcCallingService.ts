import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { buildApiUrl } from '../../utils/apiConfig';

export type NativeWebRtcCall = {
  callId: string;
  callerUid: string;
  callerName: string;
  recipientUid: string;
  recipientEmployeeCode: string;
  title: string;
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'expired';
  createdAt?: unknown;
  expiresAt?: unknown;
};

export type NativeWebRtcCallHandlers = {
  onRemoteStream?: (stream: MediaStream) => void;
  onStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (error: Error) => void;
};

const CALL_COLLECTION = 'native_webrtc_calls';
async function loadIceServers(): Promise<RTCIceServer[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Firebase authentication is required for video calls.');
  const token = await currentUser.getIdToken();
  const response = await fetch(buildApiUrl('/api/native-webrtc/ice-servers'), {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!response.ok) throw new Error('Could not load secure WebRTC connectivity settings.');
  const result = await response.json() as { iceServers?: RTCIceServer[]; turnConfigured?: boolean };
  if (!Array.isArray(result.iceServers) || result.iceServers.length === 0) {
    throw new Error('WebRTC ICE server configuration is empty.');
  }
  if (!result.turnConfigured) {
    console.warn('[NativeWebRTC] TURN is not configured; calls may fail behind restrictive NAT/firewalls.');
  }
  return result.iceServers;
}

function currentUid(): string {
  const uid = auth.currentUser?.uid || '';
  if (!uid) throw new Error('Firebase authentication is required for video calls.');
  return uid;
}

function callRef(callId: string) {
  return doc(db.concrete || db, CALL_COLLECTION, callId);
}

async function addIceCandidate(callId: string, side: 'callerCandidates' | 'calleeCandidates', candidate: RTCIceCandidate) {
  await addDoc(collection(callRef(callId), side), {
    candidate: candidate.toJSON(),
    createdAt: serverTimestamp(),
  });
}

function watchRemoteCandidates(
  callId: string,
  side: 'callerCandidates' | 'calleeCandidates',
  peer: RTCPeerConnection,
  onError?: (error: Error) => void,
): { unsubscribe: Unsubscribe; markRemoteDescriptionReady: () => Promise<void> } {
  const pending: RTCIceCandidateInit[] = [];
  let remoteDescriptionReady = !!peer.remoteDescription;

  const addCandidate = async (candidate: RTCIceCandidateInit) => {
    if (!remoteDescriptionReady) {
      pending.push(candidate);
      return;
    }
    try {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const unsubscribe = onSnapshot(collection(callRef(callId), side), (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added') continue;
      const candidate = change.doc.data().candidate;
      if (candidate) void addCandidate(candidate);
    }
  }, (error) => onError?.(error));

  return {
    unsubscribe,
    markRemoteDescriptionReady: async () => {
      remoteDescriptionReady = true;
      while (pending.length) {
        const candidate = pending.shift();
        if (candidate) await addCandidate(candidate);
      }
    },
  };
}

function attachPeerHandlers(peer: RTCPeerConnection, handlers: NativeWebRtcCallHandlers) {
  peer.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) handlers.onRemoteStream?.(stream);
  };
  peer.onconnectionstatechange = () => handlers.onStateChange?.(peer.connectionState);
}

export async function createNativeWebRtcCall(params: {
  recipientUid: string;
  recipientEmployeeCode: string;
  recipientName: string;
  callerName: string;
  title?: string;
  handlers?: NativeWebRtcCallHandlers;
}) {
  const callerUid = currentUid();
  const handlers = params.handlers || {};
  const peer = new RTCPeerConnection({ iceServers: await loadIceServers() });
  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  for (const track of localStream.getTracks()) peer.addTrack(track, localStream);

  const callDoc = doc(collection(db.concrete || db, CALL_COLLECTION));
  const callId = callDoc.id;
  const pendingLocalCandidates: RTCIceCandidate[] = [];
  let callDocumentReady = false;

  peer.onicecandidate = (event) => {
    if (!event.candidate) return;
    if (!callDocumentReady) {
      pendingLocalCandidates.push(event.candidate);
      return;
    }
    void addIceCandidate(callId, 'callerCandidates', event.candidate).catch(handlers.onError);
  };
  attachPeerHandlers(peer, handlers);

  const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await peer.setLocalDescription(offer);

  await setDoc(callDoc, {
    callId,
    callerUid,
    callerName: String(params.callerName || 'EXFIN OMS Admin').slice(0, 80),
    recipientUid: params.recipientUid,
    recipientEmployeeCode: params.recipientEmployeeCode,
    recipientName: params.recipientName,
    title: String(params.title || 'EXFIN OMS video call').slice(0, 100),
    offer: { type: offer.type, sdp: offer.sdp },
    status: 'ringing',
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  callDocumentReady = true;
  for (const candidate of pendingLocalCandidates.splice(0)) {
    void addIceCandidate(callId, 'callerCandidates', candidate).catch(handlers.onError);
  }
  // The parent signaling document must exist before participant-scoped candidate reads begin.
  const remoteCandidates = watchRemoteCandidates(callId, 'calleeCandidates', peer, handlers.onError);

  const statusUnsub = onSnapshot(callDoc, async (snapshot) => {
    const data = snapshot.data() as any;
    if (!data) return;
    if (data.status === 'declined' || data.status === 'ended' || data.status === 'expired') return;
    if (!data.answer || peer.remoteDescription) return;
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
      await remoteCandidates.markRemoteDescriptionReady();
    } catch (error) {
      handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, (error) => handlers.onError?.(error));

  return {
    callId,
    peer,
    localStream,
    close: async () => {
      remoteCandidates.unsubscribe();
      statusUnsub();
      localStream.getTracks().forEach((track) => track.stop());
      peer.close();
      await updateDoc(callDoc, { status: 'ended', endedAt: serverTimestamp() }).catch(() => {});
    },
  };
}

export async function acceptNativeWebRtcCall(callId: string, handlers: NativeWebRtcCallHandlers = {}) {
  const uid = currentUid();
  const callDoc = callRef(callId);
  const snapshot = await getDoc(callDoc);
  if (!snapshot.exists()) throw new Error('This video call no longer exists.');
  const data = snapshot.data() as any;
  if (data.recipientUid !== uid) throw new Error('This call is not addressed to the signed-in employee.');
  if (data.status !== 'ringing') throw new Error('This call is no longer ringing.');
  if (!data.expiresAt || new Date(data.expiresAt).getTime() <= Date.now()) throw new Error('This video call has expired.');
  if (!data.offer?.sdp) throw new Error('The caller offer is missing.');

  const peer = new RTCPeerConnection({ iceServers: await loadIceServers() });
  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  for (const track of localStream.getTracks()) peer.addTrack(track, localStream);

  const remoteCandidates = watchRemoteCandidates(callId, 'callerCandidates', peer, handlers.onError);
  peer.onicecandidate = (event) => {
    if (event.candidate) void addIceCandidate(callId, 'calleeCandidates', event.candidate).catch(handlers.onError);
  };
  attachPeerHandlers(peer, handlers);

  await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
  await remoteCandidates.markRemoteDescriptionReady();
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await updateDoc(callDoc, {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'accepted',
    acceptedAt: serverTimestamp(),
  });

  return {
    callId,
    peer,
    localStream,
    callerName: String(data.callerName || 'EXFIN OMS user'),
    title: String(data.title || 'EXFIN OMS video call'),
    close: async () => {
      remoteCandidates.unsubscribe();
      localStream.getTracks().forEach((track) => track.stop());
      peer.close();
      await updateDoc(callDoc, { status: 'ended', endedAt: serverTimestamp() }).catch(() => {});
    },
  };
}

export async function declineNativeWebRtcCall(callId: string) {
  const uid = currentUid();
  const ref = callRef(callId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  const data = snapshot.data() as any;
  if (data.recipientUid !== uid) throw new Error('This call is not addressed to the signed-in employee.');
  await updateDoc(ref, { status: 'declined', declinedAt: serverTimestamp() });
}
