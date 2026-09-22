'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Competition = {
  id: string;
  name: string;
  code: string;
  status: string;
  season?: { name: string };
};

type MatchRecord = {
  id: string;
  officialMatchNumber?: string | null;
  kickoffAt?: string | null;
  status: string;
  homeClub: { id: string; shortName: string };
  awayClub: { id: string; shortName: string };
  venue?: { id?: string; name: string } | null;
  round?: { id?: string; number: number } | null;
};

type Props = {
  token: string;
};

const matchStatusLabel: Record<string, string> = {
  DRAFT: 'Brouillon',
  SCHEDULED: 'Programmé',
  POSTPONED: 'Reporté',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
};

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (data as { message?: string | string[] }).message;
    throw new Error(
      Array.isArray(message)
        ? message.join(' · ')
        : message ?? `Erreur ${response.status}`,
    );
  }

  return data as T;
}

export function LeagueOfficialCalendar({ token }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [season, setSeason] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [round, setRound] = useState('');
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const seasons = useMemo(
    () =>
      Array.from(
        new Set(
          competitions
            .map((competition) => competition.season?.name)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => b.localeCompare(a)),
    [competitions],
  );

  const seasonCompetitions = useMemo(
    () =>
      competitions.filter(
        (competition) => !season || competition.season?.name === season,
      ),
    [competitions, season],
  );

  const rounds = useMemo(
    () =>
      Array.from(
        new Set(
          matches
            .map((match) => match.round?.number)
            .filter((value): value is number => typeof value === 'number'),
        ),
      ).sort((a, b) => a - b),
    [matches],
  );

  const displayedMatches = useMemo(() => {
    if (!round) return [];
    return matches
      .filter((match) => String(match.round?.number ?? '') === round)
      .sort((a, b) => (a.kickoffAt ?? '').localeCompare(b.kickoffAt ?? ''));
  }, [matches, round]);

  const selectedRoundIndex = rounds.findIndex(
    (value) => String(value) === round,
  );

  useEffect(() => {
    void request<Competition[]>('/competitions', token)
      .then((items) => {
        const official = items.filter(
          (item) =>
            item.code === 'L1-2026-2027' ||
            item.code === 'L2-2026-2027',
        );

        setCompetitions(official);

        const preferredSeason =
          official.find((item) => item.season?.name === '2026-2027')?.season
            ?.name ??
          official[0]?.season?.name ??
          '';

        setSeason(preferredSeason);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : 'Chargement du calendrier impossible',
        ),
      );
  }, [token]);

  useEffect(() => {
    const available = competitions.filter(
      (competition) => !season || competition.season?.name === season,
    );

    if (!available.some((competition) => competition.id === competitionId)) {
      setCompetitionId(available[0]?.id ?? '');
    }
  }, [season, competitions, competitionId]);

  useEffect(() => {
    if (!competitionId) {
      setMatches([]);
      setRound('');
      return;
    }

    setLoading(true);
    setError('');

    void request<MatchRecord[]>(
      `/competitions/${competitionId}/matches`,
      token,
    )
      .then((items) => {
        setMatches(items);

        const availableRounds = Array.from(
          new Set(
            items
              .map((match) => match.round?.number)
              .filter((value): value is number => typeof value === 'number'),
          ),
        ).sort((a, b) => a - b);

        setRound((current) =>
          availableRounds.some((value) => String(value) === current)
            ? current
            : availableRounds.length
              ? String(availableRounds[0])
              : '',
        );
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : 'Chargement des rencontres impossible',
        ),
      )
      .finally(() => setLoading(false));
  }, [competitionId, token]);

  function formatDate(value?: string | null) {
    if (!value) return 'Date à définir';

    return new Date(value).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatTime(value?: string | null) {
    if (!value) return '—';

    return new Date(value).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <section className="official-calendar">
      <div className="official-calendar-heading">
        <div>
          <span>COMPÉTITIONS LFPB</span>
          <h2>Calendrier officiel</h2>
          <p>
            Consultez les rencontres officielles par saison, compétition et
            journée.
          </p>
        </div>
        <strong>
          {matches.length > 0
            ? `${matches.length} matchs dans la compétition`
            : 'Calendrier officiel'}
        </strong>
      </div>

      <div className="official-calendar-filters">
        <label>
          Saison
          <select value={season} onChange={(event) => setSeason(event.target.value)}>
            {seasons.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          Compétition
          <select
            value={competitionId}
            onChange={(event) => setCompetitionId(event.target.value)}
          >
            {seasonCompetitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Journée
          <select value={round} onChange={(event) => setRound(event.target.value)}>
            {rounds.map((number) => (
              <option key={number} value={String(number)}>
                Journée {number}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="official-calendar-round-nav">
        <button
          type="button"
          disabled={selectedRoundIndex <= 0}
          onClick={() =>
            setRound(String(rounds[selectedRoundIndex - 1] ?? round))
          }
        >
          ← Journée précédente
        </button>

        <strong>{round ? `Journée ${round}` : '—'}</strong>

        <button
          type="button"
          disabled={
            selectedRoundIndex < 0 ||
            selectedRoundIndex >= rounds.length - 1
          }
          onClick={() =>
            setRound(String(rounds[selectedRoundIndex + 1] ?? round))
          }
        >
          Journée suivante →
        </button>
      </div>

      {error && <div className="api-error">{error}</div>}

      {loading ? (
        <div className="official-calendar-empty">
          Chargement des rencontres…
        </div>
      ) : displayedMatches.length === 0 ? (
        <div className="official-calendar-empty">
          Aucune rencontre pour cette journée.
        </div>
      ) : (
        <div className="official-match-grid">
          {displayedMatches.map((match) => (
            <article key={match.id} className="official-match-card">
              <div className="official-match-card-top">
                <span>
                  J{match.round?.number ?? '—'}
                  {match.officialMatchNumber
                    ? ` · ${match.officialMatchNumber}`
                    : ''}
                </span>
                <b>{matchStatusLabel[match.status] ?? match.status}</b>
              </div>

              <div className="official-match-date">
                <strong>{formatDate(match.kickoffAt)}</strong>
                <span>{formatTime(match.kickoffAt)}</span>
              </div>

              <div className="official-match-teams">
                <strong>{match.homeClub.shortName}</strong>
                <span>VS</span>
                <strong>{match.awayClub.shortName}</strong>
              </div>

              <div className="official-match-venue">
                Stade : <strong>{match.venue?.name ?? 'À définir'}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
