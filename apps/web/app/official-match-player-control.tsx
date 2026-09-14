'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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
  position?: string | null;
  shirtNumber?: number | null;
  registrationStatus: string;
  license?: { number?: string | null; season: string; status: string } | null;
  eligibility: 'ELIGIBLE' | 'CHECK_REQUIRED';
  score?: number;
};

type MatchContext = {
  id: string;
  season: string;
  competition: string;
  homeClub: { id: string; name: string };
  awayClub: { id: string; name: string };
};

type PlayersResponse = { match: MatchContext; players: MatchPlayer[] };
type ResolveResponse = { matchContext: MatchContext; query: string; match: MatchPlayer | null; alternatives: MatchPlayer[]; ambiguous: boolean };
type PlayerControl = {
  registrationId: string;
  clubId: string;
  status: 'PENDING' | 'VERIFIED' | 'ANOMALY' | string;
  controlledAt?: string | null;
  controlledByUserId?: string | null;
  reason?: string | null;
};
type ControlSummary = {
  total: number;
  verified: number;
  anomalies: number;
  pending: number;
  complete: boolean;
  controls: PlayerControl[];
};
type SpeechRecognitionResultLike = { 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

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

const statusLabel: Record<string, string> = {
  ISSUED_BY_FBF: 'Délivrée par la FBF',
  APPROVED_BY_LEAGUE: 'Validée par la Ligue',
  PENDING_FBF: 'En attente FBF',
  REJECTED: 'Rejetée',
};

export function OfficialMatchPlayerControl({ token, matchId }: { token: string; matchId: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [selected, setSelected] = useState<MatchPlayer | null>(null);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [matchContext, setMatchContext] = useState<MatchContext | null>(null);
  const [teamId, setTeamId] = useState('');
  const [controls, setControls] = useState<Record<string, PlayerControl>>({});
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
        try {
          await refreshControls();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Chargement du contrôle impossible');
        }
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Chargement des joueurs impossible'));
  }, [matchId, token]);

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
  }, []);

  const teamPlayers = useMemo(
    () => players
      .filter((player) => player.club.organizationId === teamId)
      .sort((a, b) => (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999)),
    [players, teamId],
  );
  const verifiedCount = teamPlayers.filter((player) => controls[player.registrationId]?.status === 'VERIFIED').length;
  const anomalyCount = teamPlayers.filter((player) => controls[player.registrationId]?.status === 'ANOMALY').length;

  async function resolve(text: string) {
    const value = text.trim();
    if (!value) return;
    setLoading(true); setError(''); setMessage(''); setSelected(null);
    try {
      const response = await apiRequest<ResolveResponse>(`/official-match-access/${encodeURIComponent(matchId)}/players/resolve?q=${encodeURIComponent(value)}`, token);
      setResult(response);
      if (response.match) {
        setSelected(response.match);
        setTeamId(response.match.club.organizationId);
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

  function startVoice() {
    if (!speechSupported || listening) return;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.trim() ?? '';
      if (transcript) {
        setQuery(transcript);
        void resolve(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError('Reconnaissance vocale interrompue.');
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  function openPlayer(player: MatchPlayer) {
    setSelected(player);
    setQuery(player.fullName);
    setTeamId(player.club.organizationId);
    setError('');
    setMessage('');
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

      if (status === 'VERIFIED') {
        const index = teamPlayers.findIndex((item) => item.registrationId === player.registrationId);
        const next = teamPlayers.slice(index + 1).find((item) => controls[item.registrationId]?.status !== 'VERIFIED');
        if (next) {
          setSelected(next);
          setQuery(next.fullName);
        }
      }
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Contrôle impossible');
    } finally {
      setControlBusy(false);
    }
  }

  function reportAnomaly(player: MatchPlayer) {
    const reason = window.prompt('Motif de l’anomalie constatée pour ce joueur :')?.trim();
    if (!reason) return;
    void saveControl(player, 'ANOMALY', reason);
  }

  const initials = selected ? `${selected.firstName?.[0] ?? ''}${selected.lastName?.[0] ?? ''}` : '';
  const eligible = selected?.eligibility === 'ELIGIBLE';
  const selectedControl = selected ? controls[selected.registrationId] : undefined;

  return <section className="data-panel" style={{ padding: 20 }}>
    <div style={{ padding: '20px 22px', borderRadius: 14, background: '#0b2c48', color: '#fff' }}>
      <label style={{ color: '#dfba54', fontSize: 9, fontWeight: 900, letterSpacing: '.13em' }}>AVANT-MATCH · CONTRÔLE OFFICIEL DE LA FEUILLE</label>
      <h2 style={{ margin: '7px 0 4px', fontSize: 24 }}>Appeler le joueur, afficher sa licence, contrôler</h2>
      <p style={{ margin: 0, color: '#b8c6d1', fontSize: 11 }}>L’officiel compare le joueur présent avec la photo officielle et valide le contrôle terrain.</p>
    </div>

    {matchContext && <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
      {[matchContext.homeClub, matchContext.awayClub].map((club) => {
        const clubPlayers = players.filter((player) => player.club.organizationId === club.id);
        const done = clubPlayers.filter((player) => controls[player.registrationId]?.status === 'VERIFIED').length;
        const anomalies = clubPlayers.filter((player) => controls[player.registrationId]?.status === 'ANOMALY').length;
        return <button key={club.id} type="button" onClick={() => { setTeamId(club.id); setSelected(null); }} style={{ padding: '10px 14px', border: teamId === club.id ? '2px solid #d7af47' : '1px solid #dce3e7', borderRadius: 9, background: teamId === club.id ? '#0b2c48' : '#fff', color: teamId === club.id ? '#fff' : '#203147', fontWeight: 900 }}>
          {club.name} · {done}/{clubPlayers.length}{anomalies ? ` · ⚠ ${anomalies}` : ''}
        </button>;
      })}
    </div>}

    {teamPlayers.length > 0 && <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#f7f9fa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong>Progression du contrôle</strong>
        <strong style={{ color: anomalyCount ? '#9e3933' : verifiedCount === teamPlayers.length ? '#27704d' : '#a37c22' }}>{verifiedCount}/{teamPlayers.length} vérifiés{anomalyCount ? ` · ${anomalyCount} anomalie(s)` : ''}</strong>
      </div>
      <div style={{ height: 8, marginTop: 9, borderRadius: 20, overflow: 'hidden', background: '#e3e8eb' }}>
        <div style={{ height: '100%', width: `${teamPlayers.length ? (verifiedCount / teamPlayers.length) * 100 : 0}%`, background: verifiedCount === teamPlayers.length ? '#4f9068' : '#d7af47', transition: 'width .2s' }} />
      </div>
    </div>}

    {error && <div className="api-error">{error}</div>}
    {message && <div className="success-message">{message}</div>}

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
            <span title={anomaly ? control.reason ?? 'Anomalie' : verified ? 'Vérifié' : 'À contrôler'} style={{ color: anomaly ? '#b33b35' : verified ? '#27704d' : '#a3adb6', fontWeight: 900 }}>{anomaly ? '⚠' : verified ? '✓' : '○'}</span>
          </button>;
        })}
      </div>

      <div>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) auto auto', gap: 8, alignItems: 'end', padding: 14, border: '1px solid #e2e7ea', borderRadius: 12, background: '#fff' }}>
          <label style={{ display: 'grid', gap: 6, color: '#596879', fontSize: 10, fontWeight: 800 }}>Nom du joueur<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. Cédric Dossou" autoComplete="off" style={{ width: '100%', padding: '10px 11px', border: '1px solid #dce3e7', borderRadius: 8 }} /></label>
          <button type="submit" disabled={loading} style={{ padding: '10px 13px', border: 0, borderRadius: 8, background: '#d7af47', color: '#102a43', fontWeight: 900 }}>{loading ? '…' : 'Rechercher'}</button>
          <button type="button" onClick={startVoice} disabled={!speechSupported || listening} style={{ padding: '10px 13px', border: 0, borderRadius: 8, background: '#0d3150', color: '#fff', fontWeight: 900 }}>{listening ? '🎙' : '🎤 Parler'}</button>
        </form>

        {result?.ambiguous && <div style={{ marginTop: 10 }}>{result.alternatives.map((candidate) => <button key={candidate.registrationId} type="button" onClick={() => openPlayer(candidate)} style={{ margin: 4, padding: '8px 10px' }}>{candidate.fullName}</button>)}</div>}

        {selected ? <section style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 22, padding: 20, marginTop: 12, border: selectedControl?.status === 'ANOMALY' ? '1px solid #d66b64' : '1px solid #e2e7ea', borderRadius: 14, background: '#fff' }}>
          <div>
            <div style={{ width: 145, height: 172, borderRadius: 12, overflow: 'hidden', display: 'grid', placeItems: 'center', background: '#e8edf2', color: '#0b2c48', fontSize: 38, fontWeight: 900 }}>
              {selected.photoDataUrl ? <img src={selected.photoDataUrl} alt={selected.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{initials}</span>}
            </div>
            <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: eligible ? '#e7f4ec' : '#fbf1d9', color: eligible ? '#27704d' : '#916b18', textAlign: 'center', fontSize: 10, fontWeight: 900 }}>{eligible ? '✓ LICENCE ÉLIGIBLE' : '⚠ À CONTRÔLER'}</div>
          </div>
          <div>
            <span style={{ color: '#a37c22', fontSize: 9, fontWeight: 900 }}>{selected.club.name}</span>
            <h2 style={{ margin: '5px 0', fontSize: 27 }}>{selected.fullName}</h2>
            <strong style={{ display: 'inline-block', padding: '7px 11px', borderRadius: 8, background: '#0b2c48', color: '#fff' }}>N° {selected.shirtNumber ?? '—'}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 9, marginTop: 15 }}>
              {[
                ['Date de naissance', selected.birthDate ? new Date(selected.birthDate).toLocaleDateString('fr-FR') : '—'],
                ['Identifiant fédéral', selected.federationId ?? '—'],
                ['N° licence', selected.license?.number ?? '—'],
                ['Statut', selected.license?.status ? statusLabel[selected.license.status] ?? selected.license.status : 'Aucune licence'],
              ].map(([label, value]) => <div key={label} style={{ padding: 11, borderRadius: 9, background: '#f7f9fa' }}><small style={{ display: 'block', color: '#84909e', fontWeight: 800 }}>{label}</small><strong style={{ display: 'block', marginTop: 4, color: '#203147', fontSize: 12 }}>{value}</strong></div>)}
            </div>

            {selectedControl?.status === 'ANOMALY' && <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: '#fae8e6', color: '#9e3933', fontSize: 11 }}><strong>⚠ Anomalie signalée</strong><div style={{ marginTop: 4 }}>{selectedControl.reason ?? 'Motif non renseigné'}</div></div>}
            {selectedControl?.status === 'VERIFIED' && <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: '#e7f4ec', color: '#27704d', fontSize: 11 }}><strong>✓ Contrôle terrain validé</strong>{selectedControl.controlledAt && <div style={{ marginTop: 4 }}>Contrôlé le {new Date(selectedControl.controlledAt).toLocaleString('fr-FR')}</div>}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => void saveControl(selected, 'VERIFIED')} disabled={controlBusy || selectedControl?.status === 'VERIFIED'} style={{ padding: 13, border: 0, borderRadius: 9, background: selectedControl?.status === 'VERIFIED' ? '#e7f4ec' : '#d7af47', color: selectedControl?.status === 'VERIFIED' ? '#27704d' : '#102a43', fontWeight: 900 }}>{selectedControl?.status === 'VERIFIED' ? '✓ Joueur vérifié' : '✓ Photo et licence contrôlées — Valider'}</button>
              <button type="button" onClick={() => reportAnomaly(selected)} disabled={controlBusy} style={{ padding: '13px 15px', border: '1px solid #d66b64', borderRadius: 9, background: '#fff', color: '#9e3933', fontWeight: 900 }}>⚠ Anomalie</button>
            </div>
          </div>
        </section> : <div style={{ display: 'grid', placeItems: 'center', minHeight: 280, marginTop: 12, border: '1px dashed #dce3e7', borderRadius: 14, color: '#84909e', textAlign: 'center' }}><div><strong style={{ display: 'block', color: '#203147' }}>Appelez un joueur</strong><span style={{ display: 'block', marginTop: 6, fontSize: 11 }}>Touchez son nom dans la liste ou utilisez la recherche vocale.</span></div></div>}
      </div>
    </div>
    <p style={{ margin: '12px 4px 0', color: '#8a96a2', fontSize: 10 }}>La photo officielle sert au contrôle visuel. Le contrôle est maintenant tracé et conservé ; une anomalie non résolue empêche le verrouillage de la feuille.</p>
  </section>;
}
