'use client';

import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const DB_NAME = 'lfpb-official-pwa';
const STORE = 'voice-queue';

type VoiceDraft = {
  type: string;
  minute?: number;
  playerNumber?: number;
  replacementPlayerNumber?: number;
  transcript: string;
  confidence: number;
  needsConfirmation: true;
};

type QueuedVoice = { id: string; audioDataUrl: string; browserTranscript: string; createdAt: string };

type RecognitionEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueVoice(item: QueuedVoice): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function queuedVoices(): Promise<QueuedVoice[]> {
  const database = await openDatabase();
  const items = await new Promise<QueuedVoice[]>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as QueuedVoice[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return items;
}

async function deleteQueuedVoice(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(id);
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

async function apiRequest<T>(path: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { message?: string }).message ?? `Erreur ${response.status}`);
  return payload as T;
}

export function OfficialVoiceAssistant({ token }: { token: string }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const chunks = useRef<Blob[]>([]);
  const browserTranscript = useRef('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [message, setMessage] = useState('Prêt à enregistrer une dictée.');
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);

  async function refreshQueue() { setPending((await queuedVoices()).length); }

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshQueue();
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) void syncQueue(); };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  async function interpret(text: string) {
    const clean = text.trim();
    if (!clean) throw new Error('Aucune transcription à analyser');
    const result = await apiRequest<VoiceDraft>('/official-assistant/interpretations', token, { transcript: clean });
    setTranscript(clean);
    setDraft(result);
    setMessage('Brouillon préparé : vérifiez chaque information avant confirmation.');
  }

  async function processAudio(audioDataUrl: string, recognizedText: string, queueId?: string) {
    if (!navigator.onLine) {
      const id = queueId ?? crypto.randomUUID();
      await queueVoice({ id, audioDataUrl, browserTranscript: recognizedText, createdAt: new Date().toISOString() });
      await refreshQueue();
      setMessage('Enregistrement conservé hors ligne. Il sera transcrit au retour du réseau.');
      return;
    }
    try {
      const result = await apiRequest<{ text: string }>('/official-assistant/transcriptions', token, { audioDataUrl, language: 'fr' });
      await interpret(result.text);
      if (queueId) await deleteQueuedVoice(queueId);
    } catch (reason) {
      if (recognizedText.trim()) {
        await interpret(recognizedText);
        if (queueId) await deleteQueuedVoice(queueId);
        setMessage('Transcription navigateur utilisée. Vérifiez-la attentivement avant confirmation.');
      } else {
        const id = queueId ?? crypto.randomUUID();
        await queueVoice({ id, audioDataUrl, browserTranscript: '', createdAt: new Date().toISOString() });
        setMessage(reason instanceof Error ? `${reason.message}. L’audio reste dans la file locale.` : 'Transcription indisponible.');
      }
    } finally {
      await refreshQueue();
    }
  }

  async function startRecording() {
    setDraft(null); setTranscript(''); setMessage('Écoute en cours…'); browserTranscript.current = '';
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const mediaRecorder = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      recorder.current = mediaRecorder; chunks.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        setBusy(true);
        try {
          const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || 'audio/webm' });
          if (blob.size > 5_000_000) throw new Error('La dictée dépasse 5 Mo. Faites un enregistrement plus court.');
          await processAudio(await blobToDataUrl(blob), browserTranscript.current);
        } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Traitement de la dictée impossible'); }
        finally { setBusy(false); stream.current?.getTracks().forEach((track) => track.stop()); }
      };

      const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
      const RecognitionClass = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
      if (RecognitionClass) {
        const speechRecognition = new RecognitionClass();
        speechRecognition.lang = 'fr-FR'; speechRecognition.interimResults = false; speechRecognition.continuous = true;
        speechRecognition.onresult = (event) => {
          browserTranscript.current = Array.from(event.results).map((result) => result[0].transcript).join(' ');
          setTranscript(browserTranscript.current);
        };
        recognition.current = speechRecognition;
        try { speechRecognition.start(); } catch { recognition.current = null; }
      }
      mediaRecorder.start(500); setRecording(true);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Autorisation du microphone refusée'); }
  }

  function stopRecording() {
    recognition.current?.stop(); recognition.current = null;
    recorder.current?.stop(); recorder.current = null; setRecording(false);
  }

  async function syncQueue() {
    if (!navigator.onLine || busy) return;
    const items = await queuedVoices();
    if (!items.length) return;
    setBusy(true); setMessage(`Synchronisation de ${items.length} dictée(s)…`);
    try {
      for (const item of items) await processAudio(item.audioDataUrl, item.browserTranscript, item.id);
      setMessage('File hors ligne synchronisée. Vérifiez le dernier brouillon généré.');
    } finally { setBusy(false); await refreshQueue(); }
  }

  function confirmDraft() {
    if (!draft) return;
    setMessage('Brouillon confirmé localement. Il sera rattaché à la feuille de match lorsque le module officiel sera activé.');
    setDraft(null); setTranscript('');
  }

  return <section className="voice-assistant">
    <div className="voice-heading"><div><label>ASSISTANT TERRAIN</label><h2>Dictée vocale</h2><p>La voix prépare un brouillon. L’officiel conserve toujours la décision finale.</p></div><span className={online ? 'network-online' : 'network-offline'}>{online ? 'En ligne' : 'Hors ligne'}</span></div>
    <div className="voice-grid"><div className="recorder-card"><button className={recording ? 'mic recording' : 'mic'} onClick={recording ? stopRecording : startRecording} disabled={busy}>{recording ? '■' : '●'}</button><strong>{recording ? 'Appuyez pour arrêter' : busy ? 'Traitement…' : 'Appuyez pour dicter'}</strong><small>But, carton, remplacement, incident ou observation</small><p>{message}</p>{pending > 0 && <button className="sync-button" onClick={() => void syncQueue()} disabled={!online || busy}>Synchroniser {pending} dictée(s)</button>}</div>
      <div className="transcript-card"><label>TRANSCRIPTION MODIFIABLE</label><textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setDraft(null); }} placeholder="La transcription apparaîtra ici. Vous pouvez aussi saisir ou corriger le texte." rows={5} /><button onClick={() => void interpret(transcript)} disabled={busy || !transcript.trim()}>Analyser le texte</button></div></div>
    {draft && <div className="voice-draft"><div><label>ÉVÉNEMENT PROPOSÉ</label><h3>{voiceTypeLabel(draft.type)}</h3></div><dl><div><dt>Minute</dt><dd>{draft.minute ?? 'À préciser'}</dd></div><div><dt>Joueur</dt><dd>{draft.playerNumber ? `N° ${draft.playerNumber}` : 'À sélectionner'}</dd></div>{draft.replacementPlayerNumber && <div><dt>Second joueur</dt><dd>N° {draft.replacementPlayerNumber}</dd></div>}<div><dt>Confiance</dt><dd>{Math.round(draft.confidence * 100)} %</dd></div></dl><p>« {draft.transcript} »</p><div className="draft-warning">Confirmation humaine obligatoire : vérifiez le joueur, la minute et la nature de l’événement.</div><button onClick={confirmDraft}>Confirmer le brouillon</button></div>}
  </section>;
}

function voiceTypeLabel(value: string) {
  return ({ GOAL: 'But', YELLOW_CARD: 'Carton jaune', RED_CARD: 'Carton rouge', SUBSTITUTION: 'Remplacement', INCIDENT: 'Incident', FINAL_SCORE: 'Score final', NOTE: 'Observation' } as Record<string, string>)[value] ?? value;
}
