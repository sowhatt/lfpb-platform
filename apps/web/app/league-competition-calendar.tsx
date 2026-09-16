'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Competition = {
  id: string;
  name: string;
  code: string;
  format: string;
  status: string;
  division?: string;
  season?: { name: string };
  entries?: unknown[];
};

type Proposal = {
  id: string;
  version: number;
  status: string;
  qualityScore: number;
  generatedBy: string;
  createdAt: string;
  payload?: {
    constraints?: string[];
    rounds?: CalendarRound[];
  };
  qualityReport?: {
    score?: number;
    issues?: unknown[];
  };
};

type CalendarRound = {
  number: number;
  byeClub?: { id: string; name?: string } | null;
  matches: Array<{
    homeClub: { id: string; name?: string };
    awayClub: { id: string; name?: string };
  }>;
};

type Preview = {
  competition: {
    id: string;
    name: string;
    format: string;
  };
  quality: {
    score: number;
    issues?: unknown[];
  };
  constraints: string[];
  rounds: CalendarRound[];
};

async function request<T>(
  route: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API}${route}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data
        ? String((data as { message?: unknown }).message)
        : `Erreur ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}

export function LeagueCompetitionCalendar({
  competitions,
  token,
  roles,
}: {
  competitions: Competition[];
  token: string;
  roles: string[];
}) {
  const [competitionId, setCompetitionId] = useState(
    competitions[0]?.id ?? '',
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const competition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitions, competitionId],
  );

  const canGenerate = roles.includes('COMPETITION_MANAGER');

  useEffect(() => {
    if (!competitionId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setMessage('');

      try {
        const [nextPreview, nextProposals] = await Promise.all([
          request<Preview>(
            `/competitions/${competitionId}/fixture-plan/preview`,
            token,
          ),
          request<Proposal[]>(
            `/competitions/${competitionId}/schedule-proposals`,
            token,
          ),
        ]);

        if (!cancelled) {
          setPreview(nextPreview);
          setProposals(nextProposals);
        }
      } catch (reason) {
        if (!cancelled) {
          setIsError(true);
          setMessage(
            reason instanceof Error
              ? reason.message
              : 'Chargement du calendrier impossible',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [competitionId, token]);

  async function generateCalendar() {
    if (!competitionId || !canGenerate) return;

    setLoading(true);
    setMessage('');

    try {
      await request(
        `/competitions/${competitionId}/schedule-proposals/generate`,
        token,
        { method: 'POST' },
      );

      const nextProposals = await request<Proposal[]>(
        `/competitions/${competitionId}/schedule-proposals`,
        token,
      );

      setProposals(nextProposals);
      setIsError(false);
      setMessage('Nouvelle proposition de calendrier générée.');
    } catch (reason) {
      setIsError(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Génération impossible',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <section className="workspace-actions">
        <div>
          <label>GESTION DES COMPÉTITIONS</label>
          <h2>Calendrier des compétitions</h2>
          <p>
            Préparez et contrôlez la planification des rencontres avant
            validation et publication.
          </p>
        </div>

        <button
          className="primary"
          type="button"
          disabled={loading || !competitionId || !canGenerate}
          onClick={generateCalendar}
        >
          {loading ? 'Traitement…' : 'Générer le calendrier'}
        </button>
      </section>

      {message && (
        <div className={isError ? 'api-error' : 'success-message'}>
          {message}
        </div>
      )}

      <article className="panel">
        <div className="title">
          <span>
            <label>COMPÉTITION</label>
            <h2>Championnat à planifier</h2>
          </span>
        </div>

        <select
          value={competitionId}
          onChange={(event) => setCompetitionId(event.target.value)}
        >
          {competitions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.season?.name ? ` · ${item.season.name}` : ''}
            </option>
          ))}
        </select>

        {competition && (
          <div className="stats">
            <div className="stat">
              <strong>{competition.entries?.length ?? 0}</strong>
              <span>Clubs engagés</span>
            </div>

            <div className="stat">
              <strong>{preview?.rounds.length ?? '—'}</strong>
              <span>Journées prévues</span>
            </div>

            <div className="stat">
              <strong>{preview?.quality.score ?? '—'}</strong>
              <span>Qualité / 100</span>
            </div>

            <div className="stat">
              <strong>{competition.status}</strong>
              <span>Statut</span>
            </div>
          </div>
        )}
      </article>

      {preview && (
        <>
          <article className="panel">
            <div className="title">
              <span>
                <label>CONTRÔLE AUTOMATIQUE</label>
                <h2>Qualité du calendrier</h2>
              </span>
            </div>

            <p>
              Score de qualité : <strong>{preview.quality.score}/100</strong>
            </p>

            <ul>
              {preview.constraints.map((constraint) => (
                <li key={constraint}>{constraint}</li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <div className="title">
              <span>
                <label>PRÉVISUALISATION</label>
                <h2>Journées et rencontres</h2>
              </span>
            </div>

            {preview.rounds.map((round) => (
              <section key={round.number}>
                <h3>Journée {round.number}</h3>

                {round.byeClub && (
                  <p>Exempt : {round.byeClub.name ?? 'Club'}</p>
                )}

                <table>
                  <thead>
                    <tr>
                      <th>Domicile</th>
                      <th></th>
                      <th>Extérieur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.matches.map((match) => (
                      <tr
                        key={`${round.number}-${match.homeClub.id}-${match.awayClub.id}`}
                      >
                        <td><strong>{match.homeClub.name}</strong></td>
                        <td>—</td>
                        <td><strong>{match.awayClub.name}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </article>
        </>
      )}

      <article className="panel">
        <div className="title">
          <span>
            <label>GOUVERNANCE</label>
            <h2>Propositions de calendrier</h2>
          </span>
        </div>

        {proposals.length === 0 ? (
          <p>Aucune proposition de calendrier.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Qualité</th>
                <th>Statut</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.id}>
                  <td><strong>Version {proposal.version}</strong></td>
                  <td>{proposal.qualityScore}/100</td>
                  <td>{proposal.status}</td>
                  <td>
                    {new Date(proposal.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      {!canGenerate && (
        <p>
          La génération est réservée au responsable de compétition.
        </p>
      )}
    </section>
  );
}
