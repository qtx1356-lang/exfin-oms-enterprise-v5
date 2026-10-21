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
const ICE_SERVERS = (() => {
  const configured = String(import.meta.env.VITE_WEBRTC_ICE_SERVERS || '').trim();
  if (!configured) {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  try {
    const parsed = JSON.parse(configured);
    return Array.isArray(parsed) && parsed.length ? parsed : [{ urls: 'stun:stun.l.google.com:19302' }];
  } catch {
    console.warn('[NativeWebRTC] Invalid VITE_WEBRTC_ICE_SERVERS; using public STUN only.');
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
})();

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

function applyRemoteCandidates(
  callId: string,
  side: 'callerCandidates' | 'calleeCandidates',
  peer: RTCPeerConnection,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(collection(callRef(callId), side), (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added') continue;
      const candidate = change.doc.data().candidate;
      if (!candidate) continue;
      void peer.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      });
    }
  }, (error) => onError?.(error));
}

export async function createNativeWebRtcCall(params: {
  recipientUid: string;
  recipientEmployeeCode: string;
  recipientName: string;
  title?: string;
  handlers?: NativeWebRtcCallHandlers;
}) {
  const callerUid = currentUid();
  const handlers = params.handlers || {};
  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  for (const track of localStream.getTracks()) peer.addTrack(track, localStream);

  const callDoc = doc(collection(db.concrete || db, CALL_COLLECTION));
  const callId = callDoc.id;
  const remoteCandidatesUnsub = applyRemoteCandidates(callId, 'calleeCandidates', peer, handlers.onError);

  peer.onicecandidate = (event) => {
    if (event.candidate) void addIceCandidate(callId, 'callerCandidates', event.candidate).catch(handlers.onError);
  };
  peer.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) handlers.onRemoteStream?.(stream);
  };
  peer.onconnectionstatechange = () => handlers.onStateChange?.(peer.connectionState);

  const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await peer.setLocalDescription(offer);

  await setDoc(callDoc, {
    callId,
    callerUid,
    callerName: params.recipientName ? 'EXFIN OMS Admin' : 'EXFIN OMS user',
    recipientUid: params.recipientUid,
    recipientEmployeeCode: params.recipientEmployeeCode,
    recipientName: params.recipientName,
    title: String(params.title || 'EXFIN OMS video call').slice(0, 100),
    offer: { type: offer.type, sdp: offer.sdp },
    status: 'ringing',
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const statusUnsub = onSnapshot(callDoc, async (snapshot) => {
    const data = snapshot.data() as any;
    if (!data?.answer || peer.currentRemoteDescription) return;
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
      handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, (error) => handlers.onError?.(error));

  return {
    callId,
    peer,
    localStream,
    close: async () => {
      remoteCandidatesUnsub();
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
  if (!data.offer?.sdp) throw new Error('The caller offer is missing.');

  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  for (const track of localStream.getTracks()) peer.addTrack(track, localStream);

  const remoteCandidatesUnsub = applyRemoteCandidates(callId, 'callerCandidates', peer, handlers.onError);
  peer.onicecandidate = (event) => {
    if (event.candidate) void addIceCandidate(callId, 'calleeCandidates', event.candidate).catch(handlers.onError);
  };
  peer.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) handlers.onRemoteStream?.(stream);
  };
  peer.onconnectionstatechange = () => handlers.onStateChange?.(peer.connectionState);

  await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
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
      remoteCandidatesUnsub();
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
  await updateDoc(ref, { status: 'declined', declinedAt: serverTimestamp(), declinedBy: uid });
}
