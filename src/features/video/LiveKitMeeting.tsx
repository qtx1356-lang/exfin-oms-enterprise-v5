import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, PhoneOff } from 'lucide-react';

declare global {
  interface Window { LivekitClient?: any; }
}

let liveKitScriptPromise: Promise<any> | null = null;
function loadLiveKitClient(): Promise<any> {
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  if (!liveKitScriptPromise) {
    liveKitScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-exfin-livekit="true"]');
      const script = existing || document.createElement('script');
      const fail = () => { liveKitScriptPromise = null; reject(new Error('Could not load the video calling library. Check your internet connection and retry.')); };
      script.addEventListener('load', () => window.LivekitClient ? resolve(window.LivekitClient) : fail(), { once: true });
      script.addEventListener('error', fail, { once: true });
      if (!existing) {
        script.src = 'https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js';
        script.async = true;
        script.dataset.exfinLivekit = 'true';
        document.head.appendChild(script);
      }
    });
  }
  return liveKitScriptPromise;
}

type Props = { serverUrl: string; token: string; title: string; peerName: string; onLeave: () => void };
export const LiveKitMeeting: React.FC<Props> = ({ serverUrl, token, title, peerName, onLeave }) => {
  const videoGridRef = useRef<HTMLDivElement>(null);
  const audioGridRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<any>(null);
  const tileMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  useEffect(() => {
    let disposed = false;
    const tileMap = tileMapRef.current;
    const attachTrack = (track: any, identity: string, displayName: string) => {
      if (disposed || !videoGridRef.current || !audioGridRef.current) return;
      const key = identity + ':' + (track.sid || track.kind);
      if (track.kind === window.LivekitClient?.Track?.Kind?.Audio) {
        const audio = track.attach() as HTMLAudioElement;
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        audioGridRef.current.appendChild(audio);
        return;
      }
      if (track.kind !== window.LivekitClient?.Track?.Kind?.Video || tileMap.has(key)) return;
      const tile = document.createElement('div');
      tile.className = 'relative min-h-[180px] aspect-video overflow-hidden rounded-xl bg-slate-800';
      const video = track.attach() as HTMLVideoElement;
      video.autoplay = true;
      video.playsInline = true;
      video.className = 'h-full w-full object-contain';
      tile.appendChild(video);
      const label = document.createElement('div');
      label.className = 'absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white';
      label.textContent = displayName || identity;
      tile.appendChild(label);
      videoGridRef.current.appendChild(tile);
      tileMap.set(key, tile);
    };
    const detachTrack = (track: any, identity: string) => {
      track.detach().forEach((element: HTMLElement) => element.remove());
      const key = identity + ':' + (track.sid || track.kind);
      const tile = tileMap.get(key);
      if (tile) { tile.remove(); tileMap.delete(key); }
    };
    const connect = async () => {
      try {
        const client = await loadLiveKitClient();
        if (disposed) return;
        const room = new client.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        room.on(client.RoomEvent.TrackSubscribed, (track: any, _publication: any, participant: any) => attachTrack(track, participant.identity, participant.name || participant.identity));
        room.on(client.RoomEvent.TrackUnsubscribed, (track: any, _publication: any, participant: any) => detachTrack(track, participant.identity));
        room.on(client.RoomEvent.ParticipantDisconnected, (participant: any) => {
          for (const [key, tile] of tileMap.entries()) if (key.startsWith(participant.identity + ':')) { tile.remove(); tileMap.delete(key); }
        });
        room.on(client.RoomEvent.Disconnected, () => {
          if (!disposed) setError('The call disconnected. Leave and start or answer the call again.');
        });
        room.prepareConnection(serverUrl, token);
        await room.connect(serverUrl, token);
        if (disposed) { await room.disconnect(); return; }
        await room.localParticipant.enableCameraAndMicrophone();
        for (const publication of room.localParticipant.trackPublications.values()) {
          if (publication.track && publication.track.kind === client.Track.Kind.Video) attachTrack(publication.track, room.localParticipant.identity, 'You');
        }
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track && publication.isSubscribed) attachTrack(publication.track, participant.identity, participant.name || participant.identity);
          }
        }
        setConnecting(false);
      } catch (cause: any) {
        if (!disposed) {
          setConnecting(false);
          setError(cause?.message || 'Could not connect to the video meeting. Check camera/microphone permissions and LiveKit configuration.');
        }
      }
    };
    void connect();
    return () => {
      disposed = true;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.disconnect();
      tileMap.forEach((tile) => tile.remove());
      tileMap.clear();
      if (audioGridRef.current) audioGridRef.current.replaceChildren();
    };
  }, [serverUrl, token]);

  const toggleMic = async () => {
    try { await roomRef.current?.localParticipant.setMicrophoneEnabled(!micEnabled); setMicEnabled((value) => !value); }
    catch (cause: any) { setError(cause?.message || 'Could not change microphone state.'); }
  };
  const toggleCamera = async () => {
    try { await roomRef.current?.localParticipant.setCameraEnabled(!cameraEnabled); setCameraEnabled((value) => !value); }
    catch (cause: any) { setError(cause?.message || 'Could not change camera state.'); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
        <div className="min-w-0"><div className="truncate text-sm font-bold">{title || "EXFIN OMS secure video call"}</div><div className="truncate text-xs text-slate-300">With {peerName || "EXFIN OMS user"}</div></div>
        <span className="text-xs text-slate-300">{connecting ? 'Connecting…' : 'Connected'}</span>
      </div>
      {error && <div role="alert" className="mx-3 mt-3 rounded-xl bg-red-950 p-3 text-sm text-red-200">{error}</div>}
      {connecting && !error && <div className="p-6 text-center text-sm text-slate-300">Connecting to the meeting and requesting camera/microphone access…</div>}
      <div ref={videoGridRef} className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-auto p-3 sm:grid-cols-2" />
      <div ref={audioGridRef} className="hidden" />
      <div className="flex items-center justify-center gap-3 bg-slate-900 px-3 py-3">
        <button type="button" onClick={() => void toggleMic()} aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'} className="rounded-full bg-slate-700 p-3 hover:bg-slate-600">{micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}</button>
        <button type="button" onClick={() => void toggleCamera()} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} className="rounded-full bg-slate-700 p-3 hover:bg-slate-600">{cameraEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}</button>
        <button type="button" onClick={onLeave} className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold hover:bg-red-700"><PhoneOff className="h-5 w-5" /> Leave call</button>
      </div>
    </div>
  );
};
