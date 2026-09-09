'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type SheetPlayer = {
  registrationId: string;
  clubId: string;
  shirtNumber: number;
  side: 'HOME' | 'AWAY';
  registration: {
    person: { firstName: string; lastName: string };
  };
  club: { organization: { name: string } };
};

type MatchSheet = {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'LOCKED';
  homeSubmittedAt?: string | null;
  awaySubmittedAt?: string | null;
  validatedAt?: string | null;
  lockedAt?: string | null;
  players: SheetPlayer[];
} | null;

type LiveEvent = {
  id: string;
  type: string;
  minute?: number | null;
  clubId?: string | null;
  registrationId?: string | null;
  description?: string | null;
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
  MATCH_START: 'Coup d’envoi',
  HALF_TIME: 'Mi-temps',
  SECOND_HALF_START: 'Reprise 2e mi-temps',
  GOAL: 'But',
  YELLOW_CARD: 'Carton jaune',
  RED_CARD: 'Carton rouge',
  SUBSTITUTION: 'Remplacement',
  INCIDENT: 'Incident',
  MATCH_END: 'Fin du match',
};

export function OfficialLiveMatchControl({ token, matchId }: { token: string; matchId: string }) {
  const [sheet, setSheet] = useState<MatchSheet>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [minute, setMinute] = useState(1);
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
    setBusy(label);
    setError('');
    setMessage('');
    try {
      await fn();
      await refresh();
      setMessage(`${label} enregistré.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${label} impossible`);
    } finally {
      setBusy('');
    }
  }

  function post(path: string, body?: unknown) {
    return request(path, token, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  function postEvent(type: string, extra: Record<string, unknown> = {}) {
    return post(`/matches/${matchId}/events`, {
      type,
      minute: Math.max(0, Math.min(130, minute)),
      ...extra,
    });
  }

  const match = live?.match;
  const homePlayers = sheet?.players.filter((player) => player.side === 'HOME') ?? [];
  const awayPlayers = sheet?.players.filter((player) => player.side === 'AWAY') ?? [];
  const homeName = homePlayers[0]?.club.organization.name ?? 'Domicile';
  const awayName = awayPlayers[0]?.club.organization.name ?? 'Extérieur';

  return (
    <section className="data-panel" style={{ marginBottom: 20 }}>
      <div className="workspace-actions">
        <div>
          <label>CONNECTED MATCH · LIVE</label>
          <h2>{homeName} {match ? `${match.homeScore} – ${match.awayScore}` : '–'} {awayName}</h2>
          <p>Feuille : <strong>{sheet?.status ?? '—'}</strong> · Match : <strong>{match?.status ?? '—'}</strong></p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={Boolean(busy)}>Actualiser</button>
      </div>

      {error && <div className="api-error">{error}</div>}
      {message && <div className="draft-warning">{message}</div>}

      <div className="workspace-actions" style={{ marginTop: 12, alignItems: 'center' }}>
        {sheet?.status === 'SUBMITTED' && !sheet.validatedAt && (
          <button type="button" disabled={Boolean(busy)} onClick={() => void action('Validation feuille', () => post(`/matches/${matchId}/sheet/validate`))}>
            Valider la feuille
          </button>
        )}
        {sheet?.status === 'SUBMITTED' && sheet.validatedAt && (
          <button type="button" disabled={Boolean(busy)} onClick={() => void action('Verrouillage feuille', () => post(`/matches/${matchId}/sheet/lock`))}>
            🔒 Verrouiller la feuille
          </button>
        )}
        {sheet?.status === 'LOCKED' && match?.status === 'SCHEDULED' && (
          <button type="button" disabled={Boolean(busy)} onClick={() => void action('Coup d’envoi', () => postEvent('MATCH_START'))}>
            ▶ Coup d’envoi
          </button>
        )}
        {sheet?.status === 'LOCKED' && match?.status === 'IN_PROGRESS' && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Minute
              <input style={{ width: 78 }} type="number" min={0} max={130} value={minute} onChange={(event) => setMinute(Number(event.target.value))} />
            </label>
            <button type="button" disabled={Boolean(busy)} onClick={() => void action('Mi-temps', () => postEvent('HALF_TIME'))}>Mi-temps</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void action('Reprise', () => postEvent('SECOND_HALF_START'))}>Reprise</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void action('Fin du match', () => postEvent('MATCH_END'))}>■ Fin du match</button>
          </>
        )}
      </div>

      {sheet?.status === 'LOCKED' && match?.status === 'IN_PROGRESS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 18 }}>
          {[{ title: homeName, clubId: match.homeClubId, players: homePlayers }, { title: awayName, clubId: match.awayClubId, players: awayPlayers }].map((team) => (
            <div key={team.clubId} className="draft-warning" style={{ margin: 0 }}>
              <strong>{team.title}</strong>
              {team.players.map((player) => {
                const name = `${player.registration.person.firstName} ${player.registration.person.lastName}`;
                return (
                  <div key={player.registrationId} style={{ marginTop: 10 }}>
                    <div>#{player.shirtNumber} · {name}</div>
                    <div className="workspace-actions" style={{ marginTop: 6 }}>
                      <button type="button" disabled={Boolean(busy)} onClick={() => void action(`But ${name}`, () => postEvent('GOAL', { clubId: team.clubId, registrationId: player.registrationId }))}>⚽ But</button>
                      <button type="button" disabled={Boolean(busy)} onClick={() => void action(`Jaune ${name}`, () => postEvent('YELLOW_CARD', { clubId: team.clubId, registrationId: player.registrationId }))}>🟨</button>
                      <button type="button" disabled={Boolean(busy)} onClick={() => void action(`Rouge ${name}`, () => postEvent('RED_CARD', { clubId: team.clubId, registrationId: player.registrationId }))}>🟥</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <h3>Événements live</h3>
        {live?.events.length ? (
          <div className="fixtures-list">
            {[...live.events].reverse().map((event) => {
              const player = event.registrationId ? playersById.get(event.registrationId) : undefined;
              const playerName = player ? `${player.registration.person.firstName} ${player.registration.person.lastName}` : '';
              return (
                <div className="fixture-card" key={event.id}>
                  <strong>{event.minute ?? 0}' · {eventLabels[event.type] ?? event.type}</strong>
                  <span>{playerName}{event.scoreAfter ? ` · ${event.scoreAfter.home}-${event.scoreAfter.away}` : ''}</span>
                </div>
              );
            })}
          </div>
        ) : <p>Aucun événement enregistré.</p>}
      </div>
    </section>
  );
}
