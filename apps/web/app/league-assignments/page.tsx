'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Actor = { email: string; memberships: { organizationId: string; role: string }[] };
type Competition = { id: string; name: string };
type Match = {
  id: string;
  kickoffAt?: string | null;
  homeClub: { shortName: string };
  awayClub: { shortName: string };
  venue?: { name: string } | null;
  round?: { number: number } | null;
};
type Registration = {
  id: string;
  person: { firstName: string; lastName: string };
  officialProfile?: { function: string; level?: string | null } | null;
};
type Assignment = {
  id: string;
  role: string;
  status: string;
  match: Match;
  officialProfile: {
    registration: { person: { firstName: string; lastName: string } };
  };
};

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { message?: string }).message ?? `Erreur ${response.status}`);
  return payload as T;
}

export default function LeagueAssignmentsPage() {
  const [token, setToken] = useState('');
  const [actor, setActor] = useState<Actor | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [officials, setOfficials] = useState<Registration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(accessToken: string, currentActor: Actor) {
    setLoading(true);
    setError('');
    try {
      const membership = currentActor.memberships.find((item) => item.role === 'LIGUE_ADMIN');
      if (!membership) throw new Error('Cette page est réservée à la Ligue.');
      const competitions = await request<Competition[]>('/competitions', accessToken);
      const games = (await Promise.all(
        competitions.map((competition) => request<Match[]>(`/competitions/${competition.id}/matches`, accessToken).catch(() => [])),
      )).flat();
      const [leagueOfficials, currentAssignments] = await Promise.all([
        request<Registration[]>(`/registries/officials?organizationId=${membership.organizationId}`, accessToken),
        request<Assignment[]>('/official-assignments', accessToken),
      ]);
      setMatches(games);
      setOfficials(leagueOfficials);
      setAssignments(currentAssignments);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const savedToken = sessionStorage.getItem('lfpb-token') ?? '';
    const savedActor = sessionStorage.getItem('lfpb-actor');
    if (!savedToken || !savedActor) {
      setError('Connectez-vous d’abord à Digital Foot avec un compte Ligue.');
      setLoading(false);
      return;
    }
    const parsed = JSON.parse(savedActor) as Actor;
    setToken(savedToken);
    setActor(parsed);
    void load(savedToken, parsed);
  }, []);

  async function designate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !actor) return;
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const created = await request<{ id: string }>('/official-assignments', token, {
        method: 'POST',
        body: JSON.stringify({
          matchId: String(form.get('matchId')),
          officialProfileId: String(form.get('officialProfileId')),
          role: String(form.get('role')),
        }),
      });
      await request(`/official-assignments/${created.id}/send`, token, { method: 'PATCH' });
      setMessage('Désignation envoyée à l’officiel. Elle attend maintenant sa réponse.');
      await load(token, actor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Désignation impossible');
      setLoading(false);
    }
  }

  const sortedMatches = useMemo(
    () => [...matches].sort((a, b) => String(a.kickoffAt ?? '').localeCompare(String(b.kickoffAt ?? ''))),
    [matches],
  );

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <p style={{ marginBottom: 4 }}>LFPB · ESPACE LIGUE</p>
      <h1>Désignation des officiels</h1>
      <p>La Ligue désigne un arbitre, Digital Foot lui envoie la mission, puis l’arbitre accepte ou refuse depuis son espace.</p>

      {error && <div className="api-error">{error}</div>}
      {message && <div className="connected" style={{ margin: '16px 0' }}>{message}</div>}

      <section className="data-panel" style={{ marginTop: 24 }}>
        <h2>Nouvelle désignation</h2>
        <form onSubmit={designate} className="workspace-actions" style={{ alignItems: 'end', flexWrap: 'wrap', gap: 12 }}>
          <label style={{ minWidth: 260 }}>
            Rencontre
            <select name="matchId" required disabled={loading} defaultValue="">
              <option value="" disabled>Choisir une rencontre</option>
              {sortedMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.homeClub.shortName} — {match.awayClub.shortName} · {formatDate(match.kickoffAt)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ minWidth: 240 }}>
            Officiel
            <select name="officialProfileId" required disabled={loading} defaultValue="">
              <option value="" disabled>Choisir un officiel</option>
              {officials.map((official) => (
                <option key={official.id} value={official.id}>
                  {official.person.firstName} {official.person.lastName}{official.officialProfile?.level ? ` · ${official.officialProfile.level}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label style={{ minWidth: 210 }}>
            Rôle
            <select name="role" required disabled={loading} defaultValue="REFEREE">
              <option value="REFEREE">Arbitre</option>
              <option value="ASSISTANT_REFEREE_1">Arbitre assistant 1</option>
              <option value="ASSISTANT_REFEREE_2">Arbitre assistant 2</option>
              <option value="FOURTH_OFFICIAL">Quatrième officiel</option>
              <option value="MATCH_COMMISSIONER">Commissaire au match</option>
              <option value="DELEGATE">Délégué</option>
            </select>
          </label>
          <button className="primary" type="submit" disabled={loading || !matches.length || !officials.length}>
            Désigner et envoyer
          </button>
        </form>
      </section>

      <section className="data-panel" style={{ marginTop: 24 }}>
        <div className="workspace-actions">
          <div><h2>Suivi des désignations</h2><p>{assignments.length} désignation(s)</p></div>
          <button type="button" disabled={loading || !token || !actor} onClick={() => token && actor && void load(token, actor)}>↻ Actualiser</button>
        </div>
        {!loading && assignments.length === 0 && <div className="empty">Aucune désignation.</div>}
        {assignments.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Rencontre</th><th>Officiel</th><th>Rôle</th><th>Statut</th><th>Date</th></tr></thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td><strong>{assignment.match.homeClub.shortName} — {assignment.match.awayClub.shortName}</strong></td>
                    <td>{assignment.officialProfile.registration.person.firstName} {assignment.officialProfile.registration.person.lastName}</td>
                    <td>{roleLabel(assignment.role)}</td>
                    <td><strong>{statusLabel(assignment.status)}</strong></td>
                    <td>{formatDate(assignment.match.kickoffAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function formatDate(value?: string | null) {
  if (!value) return 'Date à définir';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function roleLabel(value: string) {
  return ({ REFEREE: 'Arbitre', ASSISTANT_REFEREE_1: 'Assistant 1', ASSISTANT_REFEREE_2: 'Assistant 2', FOURTH_OFFICIAL: '4e officiel', MATCH_COMMISSIONER: 'Commissaire', DELEGATE: 'Délégué' } as Record<string, string>)[value] ?? value;
}

function statusLabel(value: string) {
  return ({ DRAFT: 'Brouillon', SENT: 'Envoyée · réponse attendue', ACCEPTED: 'Acceptée', REFUSED: 'Refusée', CANCELLED: 'Annulée' } as Record<string, string>)[value] ?? value;
}
