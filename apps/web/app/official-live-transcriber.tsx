'use client';

import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const AUTO_STOP_SILENCE_MS = 1800;

type Props = {
  token: string;
  disabled?: boolean;
  onDelta: (text: string) => void;
  onFinal: (text: string) => void | Promise<void>;
  onError: (message: string) => void;
  onListeningChange?: (listening: boolean) => void;
};

type LiveSessionResponse = { sessionId: string; sdp: string };
type LiveServerEvent = { type?: string; delta?: string; error?: { message?: string } };

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

export function OfficialLiveTranscriber({ token, disabled, onDelta, onFinal, onError, onListeningChange }: Props) {
  const [connecting, setConnecting] = useState(false);
  const [listening, setListening] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const transcriptRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }

  function cleanup() {
    clearSilenceTimer();
    dataChannelRef.current?.close(); dataChannelRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    setConnecting(false); setListening(false); onListeningChange?.(false);
  }

  useEffect(() => cleanup, []);

  async function stop() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const finalText = transcriptRef.current.trim();
    cleanup();
    try { if (finalText) await onFinal(finalText); }
    finally { stoppingRef.current = false; }
  }

  function scheduleAutoStop() {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => void stop(), AUTO_STOP_SILENCE_MS);
  }

  async function start() {
    if (disabled || connecting || listening) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      onError('La transcription Live n’est pas disponible sur ce navigateur.'); return;
    }
    setConnecting(true); transcriptRef.current = ''; onDelta('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream;
      const pc = new RTCPeerConnection(); pcRef.current = pc;
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
      const dc = pc.createDataChannel('oai-events'); dataChannelRef.current = dc;
      dc.onopen = () => { setConnecting(false); setListening(true); onListeningChange?.(true); };
      dc.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as LiveServerEvent;
          if (payload.type === 'session.input_transcript.delta' && typeof payload.delta === 'string') {
            transcriptRef.current += payload.delta;
            onDelta(transcriptRef.current);
            scheduleAutoStop();
          } else if (payload.type === 'error') onError(payload.error?.message ?? 'Erreur de transcription Live.');
        } catch { /* ignore */ }
      };
      dc.onerror = () => onError('La connexion Live a rencontré une erreur.');
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await waitForIceGathering(pc);
      const localSdp = pc.localDescription?.sdp; if (!localSdp) throw new Error('Offre WebRTC indisponible');
      const response = await fetch(`${API}/official-assistant/transcriptions`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: localSdp, language: 'fr' }),
      });
      const payload = await response.json().catch(() => ({})) as Partial<LiveSessionResponse> & { message?: string | string[] };
      if (!response.ok || typeof payload.sdp !== 'string') {
        const raw = payload.message; const message = Array.isArray(raw) ? raw.join(' · ') : raw;
        throw new Error(message ?? 'Impossible de démarrer la transcription Live');
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
    } catch (reason) {
      cleanup(); onError(reason instanceof Error ? reason.message : 'Impossible de démarrer la transcription Live');
    }
  }

  return <button type="button" disabled={disabled || connecting} onClick={() => void (listening ? stop() : start())}>
    {connecting ? 'Connexion Live…' : listening ? '■ Terminer maintenant' : '🎤 Dicter en direct'}
  </button>;
}
