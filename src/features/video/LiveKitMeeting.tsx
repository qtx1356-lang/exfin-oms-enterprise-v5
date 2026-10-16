import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, PhoneOff } from 'lucide-react';

declare global {
  interface Window { LivekitClient?: any; }
}

const LIVEKIT_CLIENT_SCRIPT = 'https://cdn.jsdelivr.net/npm/livekit-client@2.15.6/dist/livekit-client.umd.js';
let liveKitScriptPromise: Promise<any> | null = null;

function loadLiveKitClient(): Promise<any> {
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  if (liveKitScriptPromise) return liveKitScriptPromise;

  liveKitScriptPromise = new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-exfin-livekit="true"]');
    // A previously failed script element cannot emit another load event. Remove it so
    // Retry can genuinely reload the pinned client instead of hanging forever.
    if (script?.dataset.exfinLivekitFailed === 'true') {
      script.remove();
      script = null;
    }

    const fail = () => {
      if (script) {
        script.dataset.exfinLivekitFailed = 'true';
        script.remove();
      }
      liveKitScriptPromise = null;
      reject(new Error('Could not load the video calling library. Check the connection and retry.'));
    };

    if (script?.dataset.exfinLivekitLoaded === 'true') {
      if (window.LivekitClient) resolve(window.LivekitClient);
      else fail();
      return;
    }

    if (!script) {
      script = document.createElement('script');
      script.src = LIVEKIT_CLIENT_SCRIPT;
      script.async = true;
      script.dataset.exfinLivekit = 'true';
    }

    const activeScript = script;
    activeScript.addEventListener('load', () => {
      if (window.LivekitClient) {
        activeScript.dataset.exfinLivekitLoaded = 'true';
        resolve(window.LivekitClient);
      } else {
        fail();
      }
    }, { once: true });
    activeScript.addEventListener('error', fail, { once: true });

    if (!activeScript.isConnected) document.head.appendChild(activeScript);
  });

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
        // Start audio and video independently. A camera capture failure should not
        // tear down an otherwise valid meeting, and should leave the camera control
        // available for the user to retry after closing another app using the camera.
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (mediaError: any) {
          console.warn('[VideoCalls] Could not start microphone:', mediaError);
          if (!disposed) setError('You joined the call, but the microphone could not start. Check the browser microphone permission and close other apps using the microphone. Details: ' + (mediaError?.message || 'microphone unavailable'));
        }
        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch (mediaError: any) {
          console.warn('[VideoCalls] Could not start camera:', mediaError);
          if (!disposed) {
            setCameraEnabled(false);
            const name = String(mediaError?.name || '');
            let guidance = 'Check that the camera is connected, allowed for this website, and not being used by another app.';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') guidance = 'Allow camera access for this website in the browser address-bar permissions, then retry.';
            else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') guidance = 'No available camera was detected. Connect or enable a camera, then retry.';
            else if (name === 'NotReadableError' || name === 'TrackStartError') guidance = 'The camera may be busy or blocked by another app. Close other apps or tabs using it, then retry.';
            else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') guidance = 'The camera rejected its requested settings. Try another camera or browser.';
            setError('You joined the call, but the camera could not start. ' + guidance + ' Details: ' + (mediaError?.message || name || 'camera unavailable'));
          }
        }
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
          console.error('[VideoCalls] Meeting connection failed:', cause);
          const name = String(cause?.name || '');
          let message = cause?.message || 'Could not connect to the video meeting.';
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError') message = 'Browser blocked camera or microphone access. Allow both permissions for this website and retry. Details: ' + message;
          else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') message = 'No camera or microphone was detected. Connect or enable the devices and retry. Details: ' + message;
          setError(message + ' If camera capture alone fails, you can still stay in the call and retry the camera control.');
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
