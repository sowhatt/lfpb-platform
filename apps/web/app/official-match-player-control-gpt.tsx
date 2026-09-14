'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type MatchPlayer = {
  registrationId: string;
  club: { organizationId: string; name: string };
  fullName: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  federationId?: string | null;
  photoDataUrl?: string | null;
  shirtNumber?: number | null;
  license?: { number?: string | null; season: string; status: string } | null;
  eligibility: 'ELIGIBLE' | 'CHECK_REQUIRED';
};

type MatchContext = {
  id: string;
  season: string;
  competition: string;
  homeClub: { id: string; name: string };
  awayClub: { id: string; name: string };
};

type PlayersResponse = { match: MatchContext; players: MatchPlayer[] };
type ResolveResponse = {
  matchContext: MatchContext;
  query: string;
  match: (MatchPlayer & { score?: number }) | null;
  alternatives: Array<MatchPlayer & { score?: number }>;
  ambiguous: boolean;
};
type PlayerControl = {
  registrationId: string;
  clubId: string;
  status: 'PENDING' | 'VERIFIED' | 'ANOMALY' | string;
  controlledAt?: string | null;
  reason?: string | null;
};
type ControlSummary = { controls: PlayerControl[] };
type TranscriptionResponse = { text: string };

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = (payload as { message?: string | string[] }).message;
    throw new Error(Array.isArray(raw) ? raw.join(' · ') : raw ?? `Erreur ${response.status}`);
  }
  return payload as T;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Lecture de l’enregistrement impossible'));
    reader.readAsDataURL(blob);
  });
}

const statusLabel: Record<string, string> = {
  ISSUED_BY_FBF: 'Délivrée par la FBF',
  APPROVED_BY_LEAGUE: 'Validée par la Ligue',
  PENDING_FBF: 'En attente FBF',
  REJECTED: 'Rejetée',
};

export function OfficialMatchPlayerControlGpt({ token, matchId }: { token: string; matchId: string }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MatchPlayer | null>(null);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [matchContext, setMatchContext] = useState<MatchContext | null>(null);
  const [teamId, setTeamId] = useState('');
  const [controls, setControls] = useState<Record<string, PlayerControl>>({});
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function refreshControls() {
    const summary = await apiRequest<ControlSummary>(`/matches/${encodeURIComponent(matchId)}/sheet/player-controls`, token);
    setControls(Object.fromEntries(summary.controls.map((control) => [control.registrationId, control])));
  }

  useEffect(() => {
    void apiRequest<PlayersResponse>(`/official-match-access/${encodeURIComponent(matchId)}/players`, token)
      .then(async (response) => {
        setPlayers(response.players ?? []);
        setMatchContext(response.match);
        setTeamId(response.match.homeClub.id);
        await refreshControls();
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Chargement impossible'));
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [matchId, token]);

  const sheetPlayers = useMemo(
    () => players.filter((player) => Boolean(controls[player.registrationId])),
    [players, controls],
  );
  const teamPlayers = useMemo(
    () => sheetPlayers
      .filter((player) => player.club.organizationId === teamId)
      .sort((a, b) => (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999)),
    [sheetPlayers, teamId],
  );
  const verifiedCount = teamPlayers.filter((player) => controls[player.registrationId]?.status === 'VERIFIED').length;
  const anomalyCount = teamPlayers.filter((player) => controls[player.registrationId]?.status === 'ANOMALY').length;

  async function resolve(text: string) {
    const value = text.trim();
    if (!value) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await apiRequest<ResolveResponse>(`/official-match-access/${encodeURIComponent(matchId)}/players/resolve?q=${encodeURIComponent(value)}`, token);
      const validMatch = response.match && controls[response.match.registrationId] ? response.match : null;
      const sheetAlternatives = response.alternatives.filter((candidate) => controls[candidate.registrationId]);
      const fallback = !validMatch && sheetAlternatives.length === 1 ? sheetAlternatives[0] : null;
      const chosen = validMatch ?? fallback;
      if (chosen) {
        setSelected(chosen);
        setTeamId(chosen.club.organizationId);
      } else if (sheetAlternatives.length > 1) {
        setMessage(`Plusieurs joueurs possibles : ${sheetAlternatives.map((item) => item.fullName).join(' · ')}`);
      } else {
        setError('Aucun joueur de la feuille ne correspond suffisamment à la dictée.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recherche impossible');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void resolve(query);
  }

  async function transcribeRecording(blob: Blob) {
    setVoiceBusy(true); setError(''); setMessage('Transcription GPT en cours…');
    try {
      const audioDataUrl = await blobToDataUrl(blob);
      const context = sheetPlayers
        .map((player) => `${player.fullName}, numéro ${player.shirtNumber ?? 'inconnu'}, ${player.club.name}`)
        .join(' ; ');
      const response = await apiRequest<TranscriptionResponse>('/official-assistant/transcriptions', token, {
        method: 'POST',
        body: JSON.stringify({ audioDataUrl, language: 'fr', context }),
      });
      const transcript = response.text?.trim();
      if (!transcript) throw new Error('La dictée n’a produit aucun texte.');
      setQuery(transcript);
      setMessage(`GPT a entendu : « ${transcript} »`);
      await resolve(transcript);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Transcription GPT impossible');
    } finally {
      setVoiceBusy(false);
    }
  }

  async function toggleVoice() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (voiceBusy) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('L’enregistrement audio n’est pas disponible sur ce navigateur.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
      const mimeType = preferred.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setRecording(false);
        setError('Enregistrement audio interrompu.');
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/mp4' });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (blob.size > 0) void transcribeRecording(blob);
      };
      recorder.start();
      setRecording(true);
      setMessage('Parlez maintenant, puis touchez « Terminer »…');
    } catch {
      setError('Autorisez le microphone pour utiliser GPT-Transcribe.');
    }
  }

  function openPlayer(player: MatchPlayer) {
    setSelected(player);
    setQuery(player.fullName);
    setTeamId(player.club.organizationId);
    setError(''); setMessage('');
  }

  async function saveControl(player: MatchPlayer, status: 'VERIFIED' | 'ANOMALY', reason?: string) {
    setControlBusy(true); setError(''); setMessage('');
    try {
      await apiRequest(`/matches/${encodeURIComponent(matchId)}/sheet/players/${encodeURIComponent(player.registrationId)}/control`, token, {
        method: 'POST',
        body: JSON.stringify({ status, reason }),
      });
      await refreshControls();
      setMessage(status === 'VERIFIED' ? `${player.fullName} a été vérifié.` : `Anomalie enregistrée pour ${player.fullName}.`);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Contrôle impossible');
    } finally {
      setControlBusy(false);
    }
  }

  function reportAnomaly(player: MatchPlayer) {
    const reason = window.prompt('Motif de l’anomalie constatée pour ce joueur :')?.trim();
    if (reason) void saveControl(player, 'ANOMALY', reason);
  }

  const selectedControl = selected ? controls[selected.registrationId] : undefined;
  const initials = selected ? `${selected.firstName?.[0] ?? ''}${selected.lastName?.[0] ?? ''}` : '';

  return <section className="data-panel" style={{ padding: 20 }}>
    <div style={{ padding: '20px 22px', borderRadius: 14, background: '#0b2c48', color: '#fff' }}>
      <label style={{ color: '#dfba54', fontSize: 9, fontWeight: 900, letterSpacing: '.13em' }}>AVANT-MATCH · CONTRÔLE OFFICIEL · GPT-TRANSCRIBE</label>
      <h2 style={{ margin: '7px 0 4px', fontSize: 24 }}>Appeler le joueur, afficher sa licence, contrôler</h2>
      <p style={{ margin: 0, color: '#b8c6d1', fontSize: 11 }}>La dictée est transcrite par GPT avec les noms des joueurs de la feuille comme contexte.</p>
    </div>

    {matchContext && <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
      {[matchContext.homeClub, matchContext.awayClub].map((club) => {
        const clubPlayers = sheetPlayers.filter((player) => player.club.organizationId === club.id);
        const done = clubPlayers.filter((player) => controls[player.registrationId]?.status === 'VERIFIED').length;
        const anomalies = clubPlayers.filter((player) => controls[player.registrationId]?.status === 'ANOMALY').length;
        return <button key={club.id} type="button" onClick={() => { setTeamId(club.id); setSelected(null); }} style={{ padding: '10px 14px', border: teamId === club.id ? '2px solid #d7af47' : '1px solid #dce3e7', borderRadius: 9, background: teamId === club.id ? '#0b2c48' : '#fff', color: teamId === club.id ? '#fff' : '#203147', fontWeight: 900 }}>
          {club.name} · {done}/{clubPlayers.length}{anomalies ? ` · ⚠ ${anomalies}` : ''}
        </button>;
      })}
    </div>}

    {teamPlayers.length > 0 && <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#f7f9fa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Progression du contrôle</strong><strong>{verifiedCount}/{teamPlayers.length} vérifiés{anomalyCount ? ` · ${anomalyCount} anomalie(s)` : ''}</strong></div>
    </div>}

    {error && <div className="api-error">{error}</div>}
    {message && <div className="success-message">{message}</div>}

    <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) auto auto', gap: 8, alignItems: 'end', marginTop: 14, padding: 14, border: '1px solid #e2e7ea', borderRadius: 12, background: '#fff' }}>
      <label style={{ display: 'grid', gap: 6, color: '#596879', fontSize: 10, fontWeight: 800 }}>Nom du joueur<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. Rodrigue Hountondji" autoComplete="off" style={{ width: '100%', padding: '10px 11px', border: '1px solid #dce3e7', borderRadius: 8 }} /></label>
      <button type="submit" disabled={loading || voiceBusy} style={{ padding: '10px 13px', border: 0, borderRadius: 8, background: '#d7af47', color: '#102a43', fontWeight: 900 }}>{loading ? '…' : 'Rechercher'}</button>
      <button type="button" onClick={() => void toggleVoice()} disabled={voiceBusy} style={{ padding: '10px 13px', border: 0, borderRadius: 8, background: recording ? '#9e3933' : '#0d3150', color: '#fff', fontWeight: 900 }}>{voiceBusy ? 'GPT…' : recording ? '■ Terminer' : '🎤 Parler GPT'}</button>
    </form>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,240px) minmax(0,1fr)', gap: 16, marginTop: 14 }}>
      <div style={{ border: '1px solid #e2e7ea', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ padding: '11px 13px', background: '#f7f9fa', color: '#596879', fontSize: 10, fontWeight: 900 }}>JOUEURS DE LA FEUILLE</div>
        {teamPlayers.map((player) => {
          const control = controls[player.registrationId];
          const verified = control?.status === 'VERIFIED';
          const anomaly = control?.status === 'ANOMALY';
          return <button key={player.registrationId} type="button" onClick={() => openPlayer(player)} style={{ width: '100%', display: 'grid', gridTemplateColumns: '38px 1fr auto', gap: 9, alignItems: 'center', padding: '10px 12px', border: 0, borderBottom: '1px solid #edf0f2', background: selected?.registrationId === player.registrationId ? '#f8f1dc' : '#fff', textAlign: 'left' }}>
            <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 8, background: '#0b2c48', color: '#fff', fontWeight: 900 }}>#{player.shirtNumber ?? '—'}</span>
            <span><strong style={{ display: 'block', color: '#203147', fontSize: 11 }}>{player.fullName}</strong><small style={{ color: '#84909e' }}>{player.license?.number ?? 'Licence à contrôler'}</small></span>
            <span style={{ color: anomaly ? '#b33b35' : verified ? '#27704d' : '#a3adb6', fontWeight: 900 }}>{anomaly ? '⚠' : verified ? '✓' : '○'}</span>
          </button>;
        })}
      </div>

      {selected ? <section style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 22, padding: 20, border: selectedControl?.status === 'ANOMALY' ? '1px solid #d66b64' : '1px solid #e2e7ea', borderRadius: 14, background: '#fff' }}>
        <div>
          <div style={{ width: 145, height: 172, borderRadius: 12, overflow: 'hidden', display: 'grid', placeItems: 'center', background: '#e8edf2', color: '#0b2c48', fontSize: 38, fontWeight: 900 }}>
            {selected.photoDataUrl ? <img src={selected.photoDataUrl} alt={selected.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{initials}</span>}
          </div>
          <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: selected.eligibility === 'ELIGIBLE' ? '#e7f4ec' : '#fbf1d9', color: selected.eligibility === 'ELIGIBLE' ? '#27704d' : '#916b18', textAlign: 'center', fontSize: 10, fontWeight: 900 }}>{selected.eligibility === 'ELIGIBLE' ? '✓ LICENCE ÉLIGIBLE' : '⚠ À CONTRÔLER'}</div>
        </div>
        <div>
          <span style={{ color: '#a37c22', fontSize: 9, fontWeight: 900 }}>{selected.club.name}</span>
          <h2 style={{ margin: '5px 0', fontSize: 27 }}>{selected.fullName}</h2>
          <strong style={{ display: 'inline-block', padding: '7px 11px', borderRadius: 8, background: '#0b2c48', color: '#fff' }}>N° {selected.shirtNumber ?? '—'}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9, marginTop: 15 }}>
            {[
              ['Date de naissance', selected.birthDate ? new Date(selected.birthDate).toLocaleDateString('fr-FR') : '—'],
              ['Identifiant fédéral', selected.federationId ?? '—'],
              ['N° licence', selected.license?.number ?? '—'],
              ['Statut', selected.license?.status ? statusLabel[selected.license.status] ?? selected.license.status : 'Aucune licence'],
            ].map(([label, value]) => <div key={label} style={{ padding: 11, borderRadius: 9, background: '#f7f9fa' }}><small style={{ display: 'block', color: '#84909e', fontWeight: 800 }}>{label}</small><strong style={{ display: 'block', marginTop: 4, color: '#203147', fontSize: 12 }}>{value}</strong></div>)}
          </div>
          {selectedControl?.status === 'ANOMALY' && <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: '#fae8e6', color: '#9e3933', fontSize: 11 }}><strong>⚠ Anomalie signalée</strong><div>{selectedControl.reason ?? 'Motif non renseigné'}</div></div>}
          {selectedControl?.status === 'VERIFIED' && <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: '#e7f4ec', color: '#27704d', fontSize: 11 }}><strong>✓ Contrôle terrain validé</strong>{selectedControl.controlledAt && <div>Contrôlé le {new Date(selectedControl.controlledAt).toLocaleString('fr-FR')}</div>}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => void saveControl(selected, 'VERIFIED')} disabled={controlBusy || selectedControl?.status === 'VERIFIED'} style={{ padding: 13, border: 0, borderRadius: 9, background: selectedControl?.status === 'VERIFIED' ? '#e7f4ec' : '#d7af47', color: selectedControl?.status === 'VERIFIED' ? '#27704d' : '#102a43', fontWeight: 900 }}>{selectedControl?.status === 'VERIFIED' ? '✓ Joueur vérifié' : '✓ Photo et licence contrôlées — Valider'}</button>
            <button type="button" onClick={() => reportAnomaly(selected)} disabled={controlBusy} style={{ padding: '13px 15px', border: '1px solid #d66b64', borderRadius: 9, background: '#fff', color: '#9e3933', fontWeight: 900 }}>⚠ Anomalie</button>
          </div>
        </div>
      </section> : <div style={{ display: 'grid', placeItems: 'center', minHeight: 300, border: '1px dashed #dce3e7', borderRadius: 14, color: '#84909e' }}><strong>Appelez un joueur ou utilisez « Parler GPT ».</strong></div>}
    </div>
  </section>;
}
