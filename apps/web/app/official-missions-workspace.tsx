'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type MatchSummary = {
  id: string;
  kickoffAt?: string | null;
  status: string;
  round?: number | null;
  venue?: string | null;
  competition: string;
  season: string;
  homeClub: { id: string; name: string };
  awayClub: { id: string; name: string };
};

type Mission = {
  assignmentId: string;
  role: string;
  status: string;
  match: MatchSummary;
};

type Assignment = {
  id: string;
  role: string;
  status: string;
  match: {
    id: string;
    kickoffAt?: string | null;
    status: string;
    round?: { number: number } | null;
    venue?: { name: string } | null;
    competition: {
      name: string;
      season?: { name: string } | null;
    };
    homeClub: { id: string; shortName: string };
    awayClub: { id: string; shortName: string };
  };
};

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { message?: string }).message ?? `Erreur ${response.status}`);
  }
  return payload as T;
}

export function OfficialMissionsWorkspace({ token }: { token: string }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [pending, setPending] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [accepted, allAssignments] = await Promise.all([
        apiRequest<Mission[]>('/official-missions', token),
        apiRequest<Assignment[]>('/official-assignments', token),
      ]);
      setMissions(accepted);
      setPending(allAssignments.filter((assignment) => assignment.status === 'SENT'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement des missions impossible');
    } finally {
      setLoading(false);
    }
  }

  async function respond(assignmentId: string, decision: 'ACCEPTED' | 'REFUSED') {
    let reason: string | undefined;
    if (decision === 'REFUSED') {
      const value = window.prompt('Motif du refus :');
      if (value === null) return;
      reason = value.trim();
      if (!reason) {
        setError('Le motif est obligatoire pour refuser une désignation.');
        return;
      }
    }

    setActionId(assignmentId);
    setError('');
    try {
      await apiRequest(`/official-assignments/${assignmentId}/respond`, token, {
        method: 'PATCH',
        body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
      });
      await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Réponse impossible');
    } finally {
      setActionId('');
    }
  }

  function openConnectedMatch(matchId: string) {
    const target = `/official-match-control?matchId=${encodeURIComponent(matchId)}`;
    window.location.assign(target);
  }

  useEffect(() => {
    void load();
  }, [token]);

  const total = useMemo(() => pending.length + missions.length, [pending.length, missions.length]);

  return (
    <section className="data-panel">
      <div className="workspace-actions">
        <div>
          <label>DÉSIGNATIONS OFFICIELLES</label>
          <h2>Mes rencontres</h2>
          <p>{total === 0 ? 'Aucune désignation pour ce compte officiel.' : `${pending.length} à confirmer · ${missions.length} acceptée(s)`}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>↻ Actualiser</button>
      </div>

      {error && <div className="api-error">{error}</div>}
      {loading && <div className="empty">Chargement des missions…</div>}

      {!loading && pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3>Désignations à confirmer</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rencontre</th>
                  <th>Date</th>
                  <th>Stade</th>
                  <th>Rôle</th>
                  <th>Réponse</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>
                      <strong>{assignment.match.homeClub.shortName} — {assignment.match.awayClub.shortName}</strong>
                      <small style={{ display: 'block' }}>{assignment.match.competition.name}</small>
                    </td>
                    <td>{formatDateTime(assignment.match.kickoffAt)}</td>
                    <td>{assignment.match.venue?.name ?? 'À définir'}</td>
                    <td>{roleLabel(assignment.role)}</td>
                    <td>
                      <div className="workspace-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
                        <button
                          className="primary"
                          type="button"
                          disabled={Boolean(actionId)}
                          onClick={() => void respond(assignment.id, 'ACCEPTED')}
                        >
                          {actionId === assignment.id ? 'Traitement…' : 'Accepter'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionId)}
                          onClick={() => void respond(assignment.id, 'REFUSED')}
                        >
                          Refuser
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && missions.length === 0 && pending.length === 0 && (
        <div className="empty">Aucune mission reçue pour ce compte officiel.</div>
      )}

      {!loading && missions.length > 0 && (
        <div>
          <h3>Rencontres acceptées</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Journée</th>
                  <th>Rencontre</th>
                  <th>Date</th>
                  <th>Stade</th>
                  <th>Rôle</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((mission) => (
                  <tr key={mission.assignmentId}>
                    <td>J{mission.match.round ?? '—'}</td>
                    <td>
                      <strong>{mission.match.homeClub.name} — {mission.match.awayClub.name}</strong>
                      <small style={{ display: 'block' }}>{mission.match.competition} · {mission.match.season}</small>
                    </td>
                    <td>{formatDateTime(mission.match.kickoffAt)}</td>
                    <td>{mission.match.venue ?? 'À définir'}</td>
                    <td>{roleLabel(mission.role)}</td>
                    <td>
                      <button
                        className="primary"
                        type="button"
                        onClick={() => openConnectedMatch(mission.match.id)}
                      >
                        Ouvrir la feuille de match →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return 'À définir';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function roleLabel(value: string) {
  return ({
    REFEREE: 'Arbitre',
    ASSISTANT_REFEREE_1: 'Arbitre assistant 1',
    ASSISTANT_REFEREE_2: 'Arbitre assistant 2',
    FOURTH_OFFICIAL: 'Quatrième officiel',
    MATCH_COMMISSIONER: 'Commissaire au match',
    DELEGATE: 'Délégué',
  } as Record<string, string>)[value] ?? value.replaceAll('_', ' ');
}
