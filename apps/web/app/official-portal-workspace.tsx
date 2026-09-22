'use client';

import { useEffect, useMemo, useState } from 'react';

const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type OfficialMode = 'HOME' | 'TODAY' | 'REPORTS' | 'HISTORY';

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

const ROLE_LABELS: Record<string, string> = {
  REFEREE: 'Arbitre central',
  ASSISTANT_REFEREE_1: 'Arbitre assistant 1',
  ASSISTANT_REFEREE_2: 'Arbitre assistant 2',
  FOURTH_OFFICIAL: 'Quatrième officiel',
  MATCH_COMMISSIONER: 'Commissaire au match',
  DELEGATE: 'Délégué',
};

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const raw = (payload as { message?: string | string[] }).message;
    throw new Error(
      Array.isArray(raw) ? raw.join(' · ') : raw ?? `Erreur ${response.status}`,
    );
  }

  return payload as T;
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role.replaceAll('_', ' ');
}

function formatDate(value?: string | null) {
  if (!value) return 'Date à définir';

  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function sameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function openMatch(matchId: string) {
  window.location.assign(
    `/official-match-control?matchId=${encodeURIComponent(matchId)}`,
  );
}

function MissionCard({
  mission,
  actionLabel = 'Ouvrir le match',
}: {
  mission: Mission;
  actionLabel?: string;
}) {
  return (
    <article className="official-portal-mission">
      <div className="official-portal-mission-top">
        <div>
          <span className="official-portal-role">
            {roleLabel(mission.role)}
          </span>
          <h3>
            {mission.match.homeClub.name} — {mission.match.awayClub.name}
          </h3>
          <p>
            {mission.match.competition} · {mission.match.season}
            {mission.match.round ? ` · J${mission.match.round}` : ''}
          </p>
        </div>

        <span className="official-portal-status">
          {mission.match.status.replaceAll('_', ' ')}
        </span>
      </div>

      <div className="official-portal-meta">
        <div>
          <small>DATE</small>
          <strong>{formatDate(mission.match.kickoffAt)}</strong>
        </div>
        <div>
          <small>HEURE</small>
          <strong>{formatTime(mission.match.kickoffAt)}</strong>
        </div>
        <div>
          <small>STADE</small>
          <strong>{mission.match.venue ?? 'À définir'}</strong>
        </div>
      </div>

      <button
        type="button"
        className="primary official-portal-open"
        onClick={() => openMatch(mission.match.id)}
      >
        {actionLabel} →
      </button>
    </article>
  );
}

export function OfficialPortalWorkspace({
  token,
  mode,
}: {
  token: string;
  mode: OfficialMode;
}) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const [accepted, all] = await Promise.all([
        request<Mission[]>('/official-missions', token),
        request<Assignment[]>('/official-assignments', token),
      ]);

      setMissions(accepted);
      setAssignments(all);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Chargement du portail officiel impossible',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  const now = new Date();

  const sorted = useMemo(
    () =>
      [...missions].sort((a, b) =>
        (a.match.kickoffAt ?? '').localeCompare(b.match.kickoffAt ?? ''),
      ),
    [missions],
  );

  const pending = useMemo(
    () => assignments.filter((item) => item.status === 'SENT'),
    [assignments],
  );

  const upcoming = useMemo(
    () =>
      sorted.filter(
        (mission) =>
          !mission.match.kickoffAt ||
          new Date(mission.match.kickoffAt).getTime() >= now.getTime(),
      ),
    [sorted],
  );

  const today = useMemo(
    () =>
      sorted.filter(
        (mission) =>
          mission.match.kickoffAt &&
          sameLocalDay(new Date(mission.match.kickoffAt), now),
      ),
    [sorted],
  );

  const completed = useMemo(
    () =>
      [...missions]
        .filter((mission) => mission.match.status === 'COMPLETED')
        .sort((a, b) =>
          (b.match.kickoffAt ?? '').localeCompare(a.match.kickoffAt ?? ''),
        ),
    [missions],
  );

  const history = useMemo(
    () =>
      [...missions]
        .filter(
          (mission) =>
            mission.match.status === 'COMPLETED' ||
            Boolean(
              mission.match.kickoffAt &&
                new Date(mission.match.kickoffAt).getTime() < now.getTime(),
            ),
        )
        .sort((a, b) =>
          (b.match.kickoffAt ?? '').localeCompare(a.match.kickoffAt ?? ''),
        ),
    [missions],
  );

  if (loading) {
    return (
      <section className="data-panel official-portal-loading">
        Chargement de votre espace officiel…
      </section>
    );
  }

  if (error) {
    return <div className="api-error">{error}</div>;
  }

  if (mode === 'HOME') {
    const next = upcoming[0] ?? null;

    return (
      <section className="official-portal">
        <div className="official-portal-welcome">
          <div>
            <label>LFPB · ESPACE OFFICIEL</label>
            <h2>Bonjour</h2>
            <p>
              Retrouvez vos désignations, votre prochaine mission et les
              actions qui nécessitent votre attention.
            </p>
          </div>
          <button type="button" onClick={() => void load()}>
            ↻ Actualiser
          </button>
        </div>

        <section className="stats official-portal-stats">
          <article>
            <span>Missions acceptées</span>
            <strong>{missions.length}</strong>
            <small>Désignations confirmées</small>
          </article>
          <article>
            <span>À confirmer</span>
            <strong>{pending.length}</strong>
            <small>Réponse attendue</small>
          </article>
          <article>
            <span>Aujourd’hui</span>
            <strong>{today.length}</strong>
            <small>Mission(s) du jour</small>
          </article>
          <article>
            <span>Rapports disponibles</span>
            <strong>{completed.length}</strong>
            <small>Rencontres terminées</small>
          </article>
        </section>

        <div className="official-portal-section-title">
          <div>
            <label>PROCHAINE MISSION</label>
            <h2>
              {next
                ? `${next.match.homeClub.name} — ${next.match.awayClub.name}`
                : 'Aucune mission à venir'}
            </h2>
          </div>
        </div>

        {next ? (
          <MissionCard mission={next} />
        ) : (
          <div className="empty">Aucune mission acceptée à venir.</div>
        )}

        {pending.length > 0 && (
          <div className="official-portal-alert">
            <strong>
              {pending.length} désignation{pending.length > 1 ? 's' : ''} à
              confirmer
            </strong>
            <span>
              Ouvrez « Mes missions » pour accepter ou refuser la désignation.
            </span>
          </div>
        )}
      </section>
    );
  }

  if (mode === 'TODAY') {
    const displayed = today.length > 0 ? today : upcoming.slice(0, 1);

    return (
      <section className="official-portal">
        <div className="official-portal-section-title">
          <div>
            <label>MATCH DU JOUR</label>
            <h2>
              {today.length > 0
                ? `${today.length} mission(s) aujourd’hui`
                : 'Aucune mission aujourd’hui'}
            </h2>
            <p>
              {today.length > 0
                ? 'Accédez aux outils autorisés selon votre rôle sur chaque rencontre.'
                : 'La prochaine mission confirmée est affichée ci-dessous.'}
            </p>
          </div>
        </div>

        <div className="official-portal-list">
          {displayed.map((mission) => (
            <MissionCard
              key={mission.assignmentId}
              mission={mission}
              actionLabel={
                today.length > 0
                  ? 'Entrer dans le match'
                  : 'Voir la prochaine mission'
              }
            />
          ))}

          {displayed.length === 0 && (
            <div className="empty">Aucune mission confirmée.</div>
          )}
        </div>
      </section>
    );
  }

  if (mode === 'REPORTS') {
    return (
      <section className="official-portal">
        <div className="official-portal-section-title">
          <div>
            <label>APRÈS-MATCH</label>
            <h2>Rapports</h2>
            <p>
              Retrouvez les rencontres terminées et leur dossier officiel.
            </p>
          </div>
        </div>

        <div className="official-portal-list">
          {completed.map((mission) => (
            <MissionCard
              key={mission.assignmentId}
              mission={mission}
              actionLabel="Consulter le rapport"
            />
          ))}

          {completed.length === 0 && (
            <div className="empty">
              Aucun rapport de rencontre terminé disponible.
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="official-portal">
      <div className="official-portal-section-title">
        <div>
          <label>ARCHIVES PERSONNELLES</label>
          <h2>Historique des missions</h2>
          <p>
            Désignations acceptées et rencontres déjà disputées.
          </p>
        </div>
      </div>

      <div className="official-portal-list">
        {history.map((mission) => (
          <MissionCard
            key={mission.assignmentId}
            mission={mission}
            actionLabel="Consulter"
          />
        ))}

        {history.length === 0 && (
          <div className="empty">Aucune mission dans l’historique.</div>
        )}
      </div>
    </section>
  );
}
