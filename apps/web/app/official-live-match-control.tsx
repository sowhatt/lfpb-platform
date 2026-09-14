'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { OfficialLiveTranscriber } from './official-live-transcriber';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type SheetPlayer = {
  registrationId: string;
  clubId: string;
  shirtNumber: number;
  side: 'HOME' | 'AWAY';
  role?: 'STARTER' | 'SUBSTITUTE' | string;
  registration: { person: { firstName: string; lastName: string } };
  club: { organization: { name: string } };
};

type MatchSheet = {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'LOCKED';
  validatedAt?: string | null;
  players: SheetPlayer[];
} | null;

type LiveEvent = {
  id: string;
  type: string;
  minute?: number | null;
  registrationId?: string | null;
  scoreAfter?: { home: number; away: number };
};

type LiveState = {
  match: {
    id: string;
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | string;
    homeScore: number;
    awayScore: number;
    homeClubId: string;
    awayClubId: string;
  };
  events: LiveEvent[];
};

type VoiceDraft = {
  type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION' | 'INCIDENT' | 'FINAL_SCORE' | 'NOTE';
  minute?: number;
  playerNumber?: number;
  replacementPlayerNumber?: number;
  transcript: string;
};

type ResolvedDraft = {
  type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION' | 'INCIDENT';
  minute: number;
  transcript: string;
  teamName?: string;
  clubId?: string;
  player?: SheetPlayer;
  secondaryPlayer?: SheetPlayer;
};

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
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

const eventLabels: Record<string, string> = {
  MATCH_START: 'Coup d’envoi', HALF_TIME: 'Mi-temps', SECOND_HALF_START: 'Reprise 2e mi-temps',
  GOAL: 'But', YELLOW_CARD: 'Carton jaune', RED_CARD: 'Carton rouge', SUBSTITUTION: 'Remplacement',
  INCIDENT: 'Incident', MATCH_END: 'Fin du match',
};
const sheetStatusLabels: Record<string, string> = { DRAFT: 'Brouillon', SUBMITTED: 'Soumise', LOCKED: 'Verrouillée' };
const matchStatusLabels: Record<string, string> = {
  DRAFT: 'Brouillon', SCHEDULED: 'Programmé', POSTPONED: 'Reporté', IN_PROGRESS: 'En cours', COMPLETED: 'Terminé', CANCELLED: 'Annulé',
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function playerName(player: SheetPlayer) {
  return `${player.registration.person.firstName} ${player.registration.person.lastName}`;
}

function teamTokens(name: string) {
  const ignored = new Set(['football', 'club', 'benin', 'oueme']);
  return normalize(name).split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !ignored.has(token));
}

export function OfficialLiveMatchControl({ token, matchId }: { token: string; matchId: string }) {
  const [sheet, setSheet] = useState<MatchSheet>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [minute, setMinute] = useState(1);
  const [command, setCommand] = useState('');
  const [draft, setDraft] = useState<ResolvedDraft | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const playersById = useMemo(() => {
    const map = new Map<string, SheetPlayer>();
    sheet?.players.forEach((player) => map.set(player.registrationId, player));
    return map;
  }, [sheet]);

  async function refresh() {
    const [sheetData, liveData] = await Promise.all([
      request<MatchSheet>(`/matches/${matchId}/sheet`, token),
      request<LiveState>(`/matches/${matchId}/events`, token),
    ]);
    setSheet(sheetData);
    setLive(liveData);
  }

  useEffect(() => {
    void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : 'Chargement impossible'));
  }, [matchId, token]);

  async function action(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setError(''); setMessage('');
    try {
      await fn(); await refresh(); setMessage(`${label} enregistré.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${label} impossible`);
    } finally { setBusy(''); }
  }

  function post(path: string, body?: unknown) {
    return request(path, token, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  function postEvent(type: string, extra: Record<string, unknown> = {}) {
    const eventMinute = type === 'MATCH_START' ? 0 : Math.max(0, Math.min(130, minute));
    return post(`/matches/${matchId}/events`, { type, minute: eventMinute, ...extra });
  }

  const match = live?.match;
  const homePlayers = sheet?.players.filter((player) => player.side === 'HOME') ?? [];
  const awayPlayers = sheet?.players.filter((player) => player.side === 'AWAY') ?? [];
  const homeName = homePlayers[0]?.club.organization.name ?? 'Domicile';
  const awayName = awayPlayers[0]?.club.organization.name ?? 'Extérieur';

  function mentionedSide(transcript: string): 'HOME' | 'AWAY' | undefined {
    const text = normalize(transcript);
    if (/\b(domicile|locaux)\b/.test(text)) return 'HOME';
    if (/\b(exterieur|visiteur|visiteurs)\b/.test(text)) return 'AWAY';
    const homeMentioned = teamTokens(homeName).some((token) => text.includes(token));
    const awayMentioned = teamTokens(awayName).some((token) => text.includes(token));
    if (homeMentioned && !awayMentioned) return 'HOME';
    if (awayMentioned && !homeMentioned) return 'AWAY';
    return undefined;
  }

  function resolvePlayer(number: number, side: 'HOME' | 'AWAY' | undefined) {
    const candidates = (sheet?.players ?? []).filter((player) => player.shirtNumber === number && (!side || player.side === side));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) throw new Error(`Aucun joueur n°${number} trouvé${side ? ' dans cette équipe' : ' sur la feuille de match'}.`);
    throw new Error(`Le n°${number} existe dans les deux équipes. Précisez « ${homeName} » ou « ${awayName} ».`);
  }

  async function analyzeText(text: string) {
    const value = text.trim();
    if (!value) return;
    setBusy('Analyse'); setError(''); setMessage(''); setDraft(null);
    try {
      const interpreted = await post('/official-assistant/interpretations', { transcript: value }) as VoiceDraft;
      if (interpreted.type === 'NOTE') throw new Error('Commande non reconnue. Dites par exemple « carton rouge numéro 8 Dragons à la 67e minute ».');
      if (interpreted.type === 'FINAL_SCORE') throw new Error('Pour terminer la rencontre, utilisez le bouton « Fin du match ».');

      const eventMinute = interpreted.minute ?? minute;
      if (interpreted.minute !== undefined) setMinute(interpreted.minute);

      if (interpreted.type === 'INCIDENT') {
        setDraft({ type: 'INCIDENT', minute: eventMinute, transcript: interpreted.transcript });
        return;
      }

      if (interpreted.playerNumber === undefined) throw new Error('Le numéro du joueur est nécessaire.');
      const side = mentionedSide(interpreted.transcript);
      const player = resolvePlayer(interpreted.playerNumber, side);
      const teamName = player.side === 'HOME' ? homeName : awayName;
      const clubId = player.clubId;

      if (interpreted.type === 'SUBSTITUTION') {
        if (interpreted.replacementPlayerNumber === undefined) throw new Error('Précisez le numéro du joueur entrant.');
        const secondaryPlayer = resolvePlayer(interpreted.replacementPlayerNumber, player.side);
        setDraft({ type: 'SUBSTITUTION', minute: eventMinute, transcript: interpreted.transcript, teamName, clubId, player, secondaryPlayer });
        return;
      }

      setDraft({ type: interpreted.type, minute: eventMinute, transcript: interpreted.transcript, teamName, clubId, player });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Analyse impossible');
    } finally { setBusy(''); }
  }

  async function analyzeCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await analyzeText(command);
  }

  async function confirmDraft() {
    if (!draft) return;
    const payload: Record<string, unknown> = { minute: draft.minute };
    if (draft.type === 'INCIDENT') payload.description = draft.transcript;
    if (draft.player && draft.clubId) {
      payload.clubId = draft.clubId;
      payload.registrationId = draft.player.registrationId;
    }
    if (draft.secondaryPlayer) payload.secondaryRegistrationId = draft.secondaryPlayer.registrationId;
    await action(eventLabels[draft.type] ?? draft.type, () => postEvent(draft.type, payload));
    setDraft(null); setCommand('');
  }

  const liveReady = sheet?.status === 'LOCKED' && match?.status === 'IN_PROGRESS';

  return (
    <section className="data-panel" style={{ marginBottom: 20 }}>
      <div className="workspace-actions">
        <div>
          <label>MATCH CONNECTÉ · EN DIRECT</label>
          <h2>{homeName} {match ? `${match.homeScore} – ${match.awayScore}` : '–'} {awayName}</h2>
          <p>Feuille : <strong>{sheet?.status ? sheetStatusLabels[sheet.status] ?? sheet.status : '—'}</strong> · Match : <strong>{match?.status ? matchStatusLabels[match.status] ?? match.status : '—'}</strong></p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={Boolean(busy)}>Actualiser</button>
      </div>

      {error && <div className="api-error">{error}</div>}
      {message && <div className="draft-warning">{message}</div>}

      <div className="workspace-actions" style={{ marginTop: 12, alignItems: 'center' }}>
        {sheet?.status === 'SUBMITTED' && !sheet.validatedAt && <button type="button" disabled={Boolean(busy)} onClick={() => void action('Validation de la feuille', () => post(`/matches/${matchId}/sheet/validate`))}>Valider la feuille</button>}
        {sheet?.status === 'SUBMITTED' && sheet.validatedAt && <button type="button" disabled={Boolean(busy)} onClick={() => void action('Verrouillage de la feuille', () => post(`/matches/${matchId}/sheet/lock`))}>🔒 Verrouiller la feuille</button>}
        {sheet?.status === 'LOCKED' && match?.status === 'SCHEDULED' && <button type="button" disabled={Boolean(busy)} onClick={() => void action('Coup d’envoi', () => postEvent('MATCH_START'))}>▶ Coup d’envoi</button>}
        {sheet?.status === 'LOCKED' && match?.status === 'IN_PROGRESS' && <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Minute<input style={{ width: 78 }} type="number" min={0} max={130} value={minute} onChange={(event) => setMinute(Number(event.target.value))} /></label>
          <button type="button" disabled={Boolean(busy)} onClick={() => void action('Mi-temps', () => postEvent('HALF_TIME'))}>Mi-temps</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void action('Reprise', () => postEvent('SECOND_HALF_START'))}>Reprise</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void action('Fin du match', () => postEvent('MATCH_END'))}>■ Fin du match</button>
        </>}
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Compositions de la feuille de match</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
          {[{ title: homeName, players: homePlayers }, { title: awayName, players: awayPlayers }].map((team) => (
            <div key={team.title} className="draft-warning" style={{ margin: 0 }}>
              <strong>{team.title} · {team.players.length} joueur(s)</strong>
              {team.players.map((player) => <div key={player.registrationId} style={{ marginTop: 8 }}><b>#{player.shirtNumber}</b> · {playerName(player)}{player.role ? ` · ${player.role === 'STARTER' ? 'Titulaire' : player.role === 'SUBSTITUTE' ? 'Remplaçant' : player.role}` : ''}</div>)}
            </div>
          ))}
        </div>
      </div>

      <div className="workspace-actions" style={{ marginTop: 20, display: 'block' }}>
        <label>ASSISTANT ARBITRE · CONTEXTE DE LA RENCONTRE</label>
        <h3>Préparer un événement</h3>
        <p>Dictez en direct ou saisissez l’événement. Exemple : « Carton rouge numéro 8 Dragons à la 67e minute ».</p>
        <form onSubmit={analyzeCommand} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="La transcription Live apparaît ici…" style={{ flex: '1 1 420px' }} />
          <OfficialLiveTranscriber
            token={token}
            disabled={Boolean(busy)}
            onDelta={(text) => {
              setError('');
              setDraft(null);
              setCommand(text);
            }}
            onFinal={async (text) => {
              setCommand(text);
              await analyzeText(text);
            }}
            onError={(liveError) => setError(liveError)}
          />
          <button type="submit" disabled={Boolean(busy) || !command.trim()}>{busy === 'Analyse' ? 'Analyse…' : 'Analyser'}</button>
        </form>
        {draft && <div className="draft-warning" style={{ marginTop: 14 }}>
          <strong>À confirmer : {eventLabels[draft.type]}</strong>
          <div style={{ marginTop: 6 }}>
            {draft.teamName && <span>{draft.teamName} · </span>}
            {draft.player && <span>N°{draft.player.shirtNumber} · {playerName(draft.player)} · </span>}
            {draft.secondaryPlayer && <span>entrant N°{draft.secondaryPlayer.shirtNumber} · {playerName(draft.secondaryPlayer)} · </span>}
            <span>{draft.minute}e minute</span>
          </div>
          {!liveReady && <p style={{ marginTop: 8 }}>La confirmation sera disponible après validation, verrouillage de la feuille et coup d’envoi.</p>}
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button type="button" disabled={!liveReady || Boolean(busy)} onClick={() => void confirmDraft()}>Confirmer et enregistrer</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => setDraft(null)}>Annuler</button>
          </div>
        </div>}
      </div>

      <div style={{ marginTop: 18 }}>
        <h3>Événements en direct</h3>
        {live?.events.length ? <div className="fixtures-list">{[...live.events].reverse().map((event) => {
          const player = event.registrationId ? playersById.get(event.registrationId) : undefined;
          return <div className="fixture-card" key={event.id}><strong>{event.minute ?? 0}' · {eventLabels[event.type] ?? event.type}</strong><span>{player ? playerName(player) : ''}{event.scoreAfter ? ` · ${event.scoreAfter.home}-${event.scoreAfter.away}` : ''}</span></div>;
        })}</div> : <p>Aucun événement enregistré.</p>}
      </div>
    </section>
  );
}
