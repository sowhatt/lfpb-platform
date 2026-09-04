'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Mission = {
  assignmentId: string;
  role: string;
  status: string;
  match: {
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
};

async function apiRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { message?: string }).message ?? `Erreur ${response.status}`);
  }
  return payload as T;
}

export function OfficialMissionsWorkspace({ token }: { token: string }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setMissions(await apiRequest<Mission[]>('/official-missions', token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement des missions impossible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  return (
    <section className="data-panel">
      <div className="workspace-actions">
        <div>
          <label>DÉSIGNATIONS ACCEPTÉES</label>
          <h2>Mes rencontres</h2>
          <p>Seules les missions officiellement acceptées apparaissent ici.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>↻ Actualiser</button>
      </div>

      {error && <div className="api-error">{error}</div>}
      {loading && <div className="empty">Chargement des missions…</div>}
      {!loading && !error && missions.length === 0 && (
        <div className="empty">Aucune mission acceptée pour ce compte officiel.</div>
      )}

      {!loading && missions.length > 0 && (
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
                    <a className="primary" href={`/official-match-control?matchId=${encodeURIComponent(mission.match.id)}`}>
                      Contrôler les joueurs →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
