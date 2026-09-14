'use client';

import { useEffect, useMemo, useState } from 'react';
import { MatchSheetSignaturesPanel } from './match-sheet-signatures-panel';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Membership = { organizationId: string; role: string };
type Organization = { id: string; club?: { id: string; shortName: string } | null };
type Competition = { id: string; name: string; code: string };
type Match = {
  id: string;
  kickoffAt?: string;
  status: string;
  homeClub: { id: string; shortName: string };
  awayClub: { id: string; shortName: string };
};

type Props = { token: string; membership: Membership };

async function getJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = (payload as { message?: string | string[] }).message;
    throw new Error(Array.isArray(raw) ? raw.join(' · ') : raw ?? `Erreur ${response.status}`);
  }
  return payload as T;
}

export function ClubMatchSignaturesWorkspace({ token, membership }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [organizations, competitions] = await Promise.all([
          getJson<Organization[]>('/organizations', token),
          getJson<Competition[]>('/competitions', token),
        ]);
        const currentOrganization = organizations.find((item) => item.id === membership.organizationId);
        const clubId = currentOrganization?.club?.id;
        if (!clubId) throw new Error('Club connecté introuvable');

        const lists = await Promise.all(
          competitions.map((competition) =>
            getJson<Match[]>(`/competitions/${competition.id}/matches`, token).catch(() => []),
          ),
        );
        const clubMatches = lists
          .flat()
          .filter((match) => match.homeClub.id === clubId || match.awayClub.id === clubId)
          .sort((a, b) => (b.kickoffAt ?? '').localeCompare(a.kickoffAt ?? ''));

        if (!cancelled) {
          setMatches(clubMatches);
          const lockedCandidate = clubMatches.find((match) => match.status === 'SCHEDULED') ?? clubMatches[0];
          setSelectedMatchId((current) => current || lockedCandidate?.id || '');
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Chargement impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [membership.organizationId, token]);

  const selected = useMemo(() => matches.find((match) => match.id === selectedMatchId), [matches, selectedMatchId]);

  if (loading) return <section className="data-panel"><p>Chargement des feuilles de match…</p></section>;
  if (error) return <div className="api-error">{error}</div>;

  return (
    <div>
      <section className="data-panel" style={{ padding: 20 }}>
        <label>ESPACE CLUB · FEUILLES DE MATCH</label>
        <h2 style={{ margin: '8px 0 6px' }}>Signatures des rencontres</h2>
        <p style={{ marginTop: 0 }}>Sélectionnez une rencontre pour consulter ou signer sa feuille verrouillée.</p>

        {matches.length === 0 ? (
          <p>Aucune rencontre disponible pour ce club.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {matches.map((match) => (
              <button
                type="button"
                key={match.id}
                onClick={() => setSelectedMatchId(match.id)}
                style={{ textAlign: 'left', padding: 14, borderRadius: 12, border: selectedMatchId === match.id ? '2px solid #111827' : '1px solid #d9e2ec' }}
              >
                <strong>{match.homeClub.shortName} — {match.awayClub.shortName}</strong>
                <div style={{ marginTop: 4, opacity: .75 }}>
                  {match.kickoffAt ? new Date(match.kickoffAt).toLocaleString('fr-FR') : 'Horaire à définir'} · {match.status}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <MatchSheetSignaturesPanel
          token={token}
          matchId={selected.id}
          memberships={[membership]}
        />
      )}
    </div>
  );
}
