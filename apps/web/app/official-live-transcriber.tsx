'use client';

import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const AUTO_STOP_SILENCE_MS = 7000;
const OFFLINE_DB = 'lfpb-official-match-voice-v2';
const OFFLINE_STORE = 'match-voice-queue';

type Props = {
  token: string;
  queueScope: string;
  captureMinute?: number;
  disabled?: boolean;
  autoStartKey?: number;
  onDelta: (text: string) => void;
  onFinal: (text: string, capturedMinute?: number) => void | Promise<void>;
  onError: (message: string) => void;
  onListeningChange?: (listening: boolean) => void;
};

type LiveSessionResponse = {
  sessionId: string;
  sdp: string;
};

type LiveServerEvent = {
  type?: string;
  delta?: string;
  error?: { message?: string };
};

type QueuedVoice = {
  id: string;
  scope: string;
  audioDataUrl: string;
  browserTranscript: string;
  capturedMinute?: number;
  createdAt: string;
};

type RecognitionEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
};

async function waitForIceGathering(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return;

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 2500);

    const handler = () => {
      if (pc.iceGatheringState === 'complete') {
        window.clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', handler);
        resolve();
      }
    };

    pc.addEventListener('icegatheringstatechange', handler);
  });
}

function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OFFLINE_STORE)) {
        request.result.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveQueuedVoice(item: QueuedVoice) {
  const database = await openOfflineDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_STORE, 'readwrite');
    transaction.objectStore(OFFLINE_STORE).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
}

async function readQueuedVoices(scope: string): Promise<QueuedVoice[]> {
  const database = await openOfflineDatabase();

  const items = await new Promise<QueuedVoice[]>((resolve, reject) => {
    const request = database.transaction(OFFLINE_STORE).objectStore(OFFLINE_STORE).getAll();
    request.onsuccess = () => resolve(request.result as QueuedVoice[]);
    request.onerror = () => reject(request.error);
  });

  database.close();

  return items
    .filter((item) => item.scope === scope)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function deleteQueuedVoice(id: string) {
  const database = await openOfflineDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_STORE, 'readwrite');
    transaction.objectStore(OFFLINE_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function preferredAudioMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];

  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) ?? '';
}

export function OfficialLiveTranscriber({
  token,
  queueScope,
  captureMinute,
  disabled,
  autoStartKey,
  onDelta,
  onFinal,
  onError,
  onListeningChange,
}: Props) {
  const [connecting, setConnecting] = useState(false);
  const [listening, setListening] = useState(false);
  const [offlineRecording, setOfflineRecording] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const offlineRecorderRef = useRef<MediaRecorder | null>(null);
  const offlineStreamRef = useRef<MediaStream | null>(null);
  const offlineChunksRef = useRef<Blob[]>([]);
  const offlineRecognitionRef = useRef<Recognition | null>(null);
  const offlineBrowserTranscriptRef = useRef('');
  const offlineMinuteRef = useRef<number | undefined>(undefined);

  const transcriptRef = useRef('');
  const liveMinuteRef = useRef<number | undefined>(undefined);
  const silenceTimerRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const syncingRef = useRef(false);
  const lastAutoStartKeyRef = useRef<number | undefined>(undefined);

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
    }

    silenceTimerRef.current = null;
  }

  function cleanupLive() {
    clearSilenceTimer();

    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    setConnecting(false);
    setListening(false);
    onListeningChange?.(false);
  }

  function cleanupOffline() {
    offlineRecognitionRef.current?.stop();
    offlineRecognitionRef.current = null;

    if (
      offlineRecorderRef.current &&
      offlineRecorderRef.current.state !== 'inactive'
    ) {
      offlineRecorderRef.current.stop();
    }

    offlineRecorderRef.current = null;

    offlineStreamRef.current?.getTracks().forEach((track) => track.stop());
    offlineStreamRef.current = null;

    setOfflineRecording(false);
    onListeningChange?.(false);
  }

  async function refreshQueue() {
    try {
      setPending((await readQueuedVoices(queueScope)).length);
    } catch {
      setPending(0);
    }
  }

  async function transcribeQueuedAudio(item: QueuedVoice) {
    const response = await fetch(`${API}/official-assistant/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioDataUrl: item.audioDataUrl,
        language: 'fr',
      }),
    });

    const payload = await response.json().catch(() => ({})) as {
      text?: string;
      message?: string | string[];
    };

    if (!response.ok) {
      const raw = payload.message;
      const message = Array.isArray(raw) ? raw.join(' · ') : raw;
      throw new Error(message ?? `Erreur ${response.status}`);
    }

    return payload.text?.trim() ?? '';
  }

  async function syncNextQueuedVoice() {
    if (!navigator.onLine || syncingRef.current) return;

    const items = await readQueuedVoices(queueScope);
    const item = items[0];

    if (!item) {
      await refreshQueue();
      return;
    }

    syncingRef.current = true;
    setSyncing(true);

    try {
      let text = '';

      try {
        text = await transcribeQueuedAudio(item);
      } catch (reason) {
        if (item.browserTranscript.trim()) {
          text = item.browserTranscript.trim();
        } else {
          throw reason;
        }
      }

      if (!text) {
        throw new Error('La dictée synchronisée ne contient aucune transcription exploitable.');
      }

      await onFinal(text, item.capturedMinute);
      await deleteQueuedVoice(item.id);
      await refreshQueue();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? `${reason.message}. La dictée reste conservée localement.`
          : 'Synchronisation impossible. La dictée reste conservée localement.',
      );
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshQueue();

    const update = () => {
      const connected = navigator.onLine;
      setOnline(connected);

      if (connected) {
        void syncNextQueuedVoice();
      }
    };

    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [queueScope]);

  useEffect(() => {
    return () => {
      cleanupLive();

      offlineRecognitionRef.current?.stop();
      offlineRecognitionRef.current = null;

      offlineStreamRef.current?.getTracks().forEach((track) => track.stop());
      offlineStreamRef.current = null;
    };
  }, []);

  async function stopLive() {
    if (stoppingRef.current) return;

    stoppingRef.current = true;

    const finalText = transcriptRef.current.trim();
    const capturedMinute = liveMinuteRef.current;

    cleanupLive();
    liveMinuteRef.current = undefined;

    try {
      if (finalText) {
        await onFinal(finalText, capturedMinute);
      }
    } finally {
      stoppingRef.current = false;
    }
  }

  function scheduleAutoStop() {
    clearSilenceTimer();

    silenceTimerRef.current = window.setTimeout(
      () => void stopLive(),
      AUTO_STOP_SILENCE_MS,
    );
  }

  async function startOfflineRecording() {
    if (
      disabled ||
      offlineRecording ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        onError('L’enregistrement vocal hors ligne n’est pas disponible sur ce navigateur.');
      }

      return;
    }

    offlineBrowserTranscriptRef.current = '';
    offlineMinuteRef.current = captureMinute;
    onDelta('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      offlineStreamRef.current = stream;

      const mimeType = preferredAudioMimeType();

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      offlineRecorderRef.current = recorder;
      offlineChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          offlineChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const actualMimeType =
            recorder.mimeType ||
            offlineChunksRef.current[0]?.type ||
            mimeType ||
            'audio/mp4';

          const blob = new Blob(offlineChunksRef.current, {
            type: actualMimeType,
          });

          if (!blob.size) {
            throw new Error('Aucun son n’a été enregistré.');
          }

          if (blob.size > 5_000_000) {
            throw new Error(
              'La dictée dépasse 5 Mo. Faites un enregistrement plus court.',
            );
          }

          const audioDataUrl = await blobToDataUrl(blob);

          await saveQueuedVoice({
            id: crypto.randomUUID(),
            scope: queueScope,
            audioDataUrl,
            browserTranscript: offlineBrowserTranscriptRef.current,
            capturedMinute: offlineMinuteRef.current,
            createdAt: new Date().toISOString(),
          });

          await refreshQueue();

          if (navigator.onLine) {
            void syncNextQueuedVoice();
          }
        } catch (reason) {
          onError(
            reason instanceof Error
              ? reason.message
              : 'Impossible de conserver la dictée localement.',
          );
        } finally {
          offlineStreamRef.current?.getTracks().forEach((track) => track.stop());
          offlineStreamRef.current = null;
          offlineRecorderRef.current = null;
          setOfflineRecording(false);
          onListeningChange?.(false);
        }
      };

      const speechWindow = window as unknown as {
        SpeechRecognition?: new () => Recognition;
        webkitSpeechRecognition?: new () => Recognition;
      };

      const RecognitionClass =
        speechWindow.SpeechRecognition ??
        speechWindow.webkitSpeechRecognition;

      if (RecognitionClass) {
        const recognition = new RecognitionClass();

        recognition.lang = 'fr-FR';
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onresult = (event) => {
          const text = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join(' ')
            .trim();

          offlineBrowserTranscriptRef.current = text;
          onDelta(text);
        };

        offlineRecognitionRef.current = recognition;

        try {
          recognition.start();
        } catch {
          offlineRecognitionRef.current = null;
        }
      }

      recorder.start(500);
      setOfflineRecording(true);
      onListeningChange?.(true);
    } catch (reason) {
      offlineStreamRef.current?.getTracks().forEach((track) => track.stop());
      offlineStreamRef.current = null;
      setOfflineRecording(false);
      onListeningChange?.(false);

      onError(
        reason instanceof Error
          ? reason.message
          : 'Autorisation du microphone refusée.',
      );
    }
  }

  function stopOfflineRecording() {
    offlineRecognitionRef.current?.stop();
    offlineRecognitionRef.current = null;

    if (
      offlineRecorderRef.current &&
      offlineRecorderRef.current.state !== 'inactive'
    ) {
      offlineRecorderRef.current.stop();
    }

    setOfflineRecording(false);
  }

  async function startLive() {
    if (disabled || connecting || listening) return;

    if (!navigator.onLine) {
      await startOfflineRecording();
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      await startOfflineRecording();
      return;
    }

    setConnecting(true);
    transcriptRef.current = '';
    liveMinuteRef.current = captureMinute;
    onDelta('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

      const dataChannel = pc.createDataChannel('oai-events');
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        setConnecting(false);
        setListening(true);
        onListeningChange?.(true);
        scheduleAutoStop();
      };

      dataChannel.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as LiveServerEvent;

          if (
            payload.type === 'session.input_transcript.delta' &&
            typeof payload.delta === 'string'
          ) {
            transcriptRef.current += payload.delta;
            onDelta(transcriptRef.current);
            scheduleAutoStop();
          } else if (payload.type === 'error') {
            onError(
              payload.error?.message ??
                'Erreur de transcription Live.',
            );
          }
        } catch {
          return;
        }
      };

      dataChannel.onerror = () => {
        onError('La connexion Live a rencontré une erreur.');
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const localSdp = pc.localDescription?.sdp;

      if (!localSdp) {
        throw new Error('Offre WebRTC indisponible');
      }

      const response = await fetch(`${API}/official-assistant/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sdp: localSdp,
          language: 'fr',
        }),
      });

      const payload = await response.json().catch(() => ({})) as
        Partial<LiveSessionResponse> & {
          message?: string | string[];
        };

      if (!response.ok || typeof payload.sdp !== 'string') {
        const raw = payload.message;
        const message = Array.isArray(raw) ? raw.join(' · ') : raw;

        throw new Error(
          message ?? 'Impossible de démarrer la transcription Live',
        );
      }

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: payload.sdp,
      });
    } catch (reason) {
      cleanupLive();

      onError(
        reason instanceof Error
          ? reason.message
          : 'Impossible de démarrer la transcription Live',
      );
    }
  }

  useEffect(() => {
    if (
      autoStartKey === undefined ||
      autoStartKey === lastAutoStartKeyRef.current ||
      disabled
    ) {
      return;
    }

    lastAutoStartKeyRef.current = autoStartKey;
    void startLive();
  }, [autoStartKey, disabled]);

  function toggleVoice() {
    if (offlineRecording) {
      stopOfflineRecording();
      return;
    }

    if (listening) {
      void stopLive();
      return;
    }

    void startLive();
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        disabled={disabled || connecting || syncing}
        onClick={toggleVoice}
      >
        {connecting
          ? 'Connexion Live…'
          : syncing
            ? 'Synchronisation…'
            : offlineRecording
              ? '■ Terminer hors ligne'
              : listening
                ? '■ Terminer maintenant'
                : online
                  ? '🎤 Dicter en direct'
                  : '🎤 Dicter hors ligne'}
      </button>

      <small
        style={{
          fontWeight: 800,
          color: online ? '#27704d' : '#9a6700',
        }}
      >
        {online ? '● En ligne' : '● Hors ligne'}
      </small>

      {pending > 0 && (
        <button
          type="button"
          disabled={!online || syncing || offlineRecording || listening}
          onClick={() => void syncNextQueuedVoice()}
        >
          ↻ Synchroniser 1/{pending}
        </button>
      )}
    </span>
  );
}
