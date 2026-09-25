'use client';

import { useEffect, useMemo, useState } from 'react';

const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Membership = {
  organizationId: string;
  role: string;
};

type SportingSummary = {
  totalSeasons: number;
  league1Seasons: number;
  league2Seasons: number;
  titles: number;
  promotions: number;
  relegations: number;
};

type ClubSeason = {
  id: string;
  division: string;
  finalRank?: number | null;
  outcome?: string | null;
  season: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  };
};

type OrganizationDetail = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  club?: {
    id: string;
    shortName: string;
    division: string;
    city?: string | null;
    colors?: string | null;
    seasons?: ClubSeason[];
    sportingSummary?: SportingSummary;
  } | null;
};

type Registration = {
  id: string;
  status: string;
};

type License = {
  id: string;
  status: string;
};

type Transfer = {
  id: string;
  status: string;
  sourceOrganizationId?: string;
  targetOrganizationId?: string;
};

type Competition = {
  id: string;
  code: string;
  name: string;
  division?: string | null;
};

type Match = {
  id: string;
  kickoffAt?: string | null;
  status: string;
  homeClub: {
    id: string;
    shortName: string;
  };
  awayClub: {
    id: string;
    shortName: string;
  };
  venue?: {
    name: string;
  } | null;
  round?: {
    number: number;
  } | null;
};

type MatchSheet = {
  id: string;
  status: string;
} | null;

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (data as { message?: string }).message ?? `Erreur ${response.status}`,
    );
  }

  return data as T;
}

function divisionLabel(value?: string | null) {
  if (value === 'LIGUE_1') return 'Ligue 1';
  if (value === 'LIGUE_2') return 'Ligue 2';
  return value?.replaceAll('_', ' ') ?? 'Non renseignée';
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

function openWorkspace(label: string) {
  const buttons = Array.from(document.querySelectorAll('button'));

  const target = buttons.find(
    (button) => button.textContent?.trim() === label,
  );

  target?.click();
}

export function ClubDashboardV2({
  token,
  membership,
}: {
  token: string;
  membership: Membership;
}) {
  const [organization, setOrganization] =
    useState<OrganizationDetail | null>(null);

  const [players, setPlayers] = useState<Registration[]>([]);
  const [staff, setStaff] = useState<Registration[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [nextSheet, setNextSheet] = useState<MatchSheet>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const organizationId = membership.organizationId;
      const query = `?organizationId=${encodeURIComponent(organizationId)}`;

      const [
        organizationDetail,
        clubPlayers,
        clubStaff,
        clubLicenses,
        clubTransfers,
        competitions,
      ] = await Promise.all([
        request<OrganizationDetail>(
          `/organizations/${organizationId}`,
          token,
        ),
        request<Registration[]>(
          `/registries/players${query}`,
          token,
        ),
        request<Registration[]>(
          `/registries/staff${query}`,
          token,
        ),
        request<License[]>(
          `/licenses${query}`,
          token,
        ),
        request<Transfer[]>(
          '/registries/player-transfers',
          token,
        ).catch(() => []),
        request<Competition[]>(
          '/competitions',
          token,
        ).catch(() => []),
      ]);

      setOrganization(organizationDetail);
      setPlayers(clubPlayers);
      setStaff(clubStaff);
      setLicenses(clubLicenses);
      setTransfers(clubTransfers);

      const officialCompetitions = competitions.filter(
        (competition) =>
          competition.code === 'L1-2026-2027' ||
          competition.code === 'L2-2026-2027',
      );

      const matchGroups = await Promise.all(
        officialCompetitions.map((competition) =>
          request<Match[]>(
            `/competitions/${competition.id}/matches`,
            token,
          ).catch(() => []),
        ),
      );

      const clubId = organizationDetail.club?.id;

      const clubMatches = matchGroups
        .flat()
        .filter(
          (match) =>
            clubId &&
            (match.homeClub.id === clubId ||
              match.awayClub.id === clubId),
        )
        .sort(
          (a, b) =>
            new Date(a.kickoffAt ?? 0).getTime() -
            new Date(b.kickoffAt ?? 0).getTime(),
        );

      setMatches(clubMatches);

      const now = Date.now();

      const nextMatch =
        clubMatches.find(
          (match) =>
            match.status !== 'COMPLETED' &&
            (!match.kickoffAt ||
              new Date(match.kickoffAt).getTime() >= now),
        ) ?? null;

      if (nextMatch) {
        const sheet = await request<MatchSheet>(
          `/matches/${nextMatch.id}/sheet`,
          token,
        ).catch(() => null);

        setNextSheet(sheet);
      } else {
        setNextSheet(null);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Chargement du tableau de bord impossible',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [membership.organizationId, token]);

  const issued = useMemo(
    () =>
      licenses.filter(
        (license) => license.status === 'ISSUED_BY_FBF',
      ).length,
    [licenses],
  );

  const pendingLicenses = useMemo(
    () =>
      licenses.filter(
        (license) =>
          ![
            'ISSUED_BY_FBF',
            'REJECTED_BY_FBF',
            'CANCELLED',
          ].includes(license.status),
      ).length,
    [licenses],
  );

  const activeTransfers = useMemo(
    () =>
      transfers.filter(
        (transfer) =>
          ![
            'EFFECTIVE',
            'REJECTED',
            'CANCELLED',
          ].includes(transfer.status),
      ).length,
    [transfers],
  );

  const nextMatch = useMemo(() => {
    const now = Date.now();

    return (
      matches.find(
        (match) =>
          match.status !== 'COMPLETED' &&
          (!match.kickoffAt ||
            new Date(match.kickoffAt).getTime() >= now),
      ) ?? null
    );
  }, [matches]);

  const alerts = useMemo(() => {
    const values: string[] = [];

    if (pendingLicenses > 0) {
      values.push(
        `${pendingLicenses} dossier(s) de licence encore en traitement`,
      );
    }

    if (activeTransfers > 0) {
      values.push(
        `${activeTransfers} transfert(s) en cours`,
      );
    }

    if (nextMatch && !nextSheet) {
      values.push(
        'La feuille du prochain match n’est pas encore préparée',
      );
    }

    if (
      nextMatch &&
      nextSheet &&
      nextSheet.status === 'DRAFT'
    ) {
      values.push(
        'La feuille du prochain match est encore en brouillon',
      );
    }

    if (players.length < 11) {
      values.push(
        'Effectif insuffisant : moins de 11 joueurs enregistrés',
      );
    }

    return values;
  }, [
    activeTransfers,
    nextMatch,
    nextSheet,
    pendingLicenses,
    players.length,
  ]);

  const currentSeason =
    organization?.club?.seasons?.[0] ?? null;

  const sporting =
    organization?.club?.sportingSummary ?? null;

  if (loading) {
    return (
      <section className="data-panel">
        <p>Préparation du tableau de bord du club…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="data-panel">
        <div className="api-error">{error}</div>
        <button
          type="button"
          onClick={() => void load()}
        >
          ↻ Réessayer
        </button>
      </section>
    );
  }

  return (
    <div className="club-dashboard-v2">
      <section className="welcome-card">
        <span>ESPACE CLUB · SAISON 2026-2027</span>

        <h2>
          {organization?.name ?? 'Mon club'}
        </h2>

        <p>
          {divisionLabel(
            currentSeason?.division ??
              organization?.club?.division,
          )}
          {' · '}
          {organization?.club?.city ??
            'Ville non renseignée'}
          {' · '}
          {organization?.active
            ? 'Club actif'
            : 'Club inactif'}
        </p>
      </section>

      <section className="stats">
        <article>
          <span>Effectif</span>
          <strong>{players.length}</strong>
          <small>joueurs enregistrés</small>
        </article>

        <article>
          <span>Staff</span>
          <strong>{staff.length}</strong>
          <small>membres d’encadrement</small>
        </article>

        <article>
          <span>Licences FBF</span>
          <strong>{issued}</strong>
          <small>
            {pendingLicenses} en traitement
          </small>
        </article>

        <article>
          <span>Transferts</span>
          <strong>{activeTransfers}</strong>
          <small>opération(s) en cours</small>
        </article>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit,minmax(320px,1fr))',
          gap: 18,
          marginTop: 18,
        }}
      >
        <article className="data-panel">
          <div className="title">
            <span>
              <label>PROCHAINE RENCONTRE</label>
              <h2>
                {nextMatch
                  ? `${nextMatch.homeClub.shortName} — ${nextMatch.awayClub.shortName}`
                  : 'Aucun match à venir'}
              </h2>
            </span>
          </div>

          {nextMatch ? (
            <>
              <p>
                <strong>
                  {formatDate(nextMatch.kickoffAt)}
                </strong>
                {' · '}
                {formatTime(nextMatch.kickoffAt)}
              </p>

              <p>
                Journée{' '}
                <strong>
                  J{nextMatch.round?.number ?? '—'}
                </strong>
                {' · '}
                {nextMatch.venue?.name ??
                  'Stade à définir'}
              </p>

              <p>
                Feuille de match :{' '}
                <strong>
                  {nextSheet?.status ??
                    'NON PRÉPARÉE'}
                </strong>
              </p>

              <button
                type="button"
                onClick={() =>
                  openWorkspace(
                    'Feuilles de match',
                  )
                }
              >
                Préparer / consulter la feuille →
              </button>
            </>
          ) : (
            <p>
              Aucune rencontre future trouvée pour
              ce club.
            </p>
          )}
        </article>

        <article className="data-panel">
          <div className="title">
            <span>
              <label>CENTRE D’ALERTES</label>
              <h2>
                {alerts.length
                  ? `${alerts.length} point(s) à traiter`
                  : 'Club prêt'}
              </h2>
            </span>
          </div>

          {alerts.length === 0 ? (
            <div className="success-message">
              ✓ Aucun blocage opérationnel détecté.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 10,
              }}
            >
              {alerts.map((alert) => (
                <div
                  key={alert}
                  className="draft-warning"
                >
                  ⚠ {alert}
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section
        className="data-panel"
        style={{ marginTop: 18 }}
      >
        <div className="title">
          <span>
            <label>ACTIONS RAPIDES</label>
            <h2>Gérer mon club</h2>
          </span>

          <button
            type="button"
            onClick={() => void load()}
          >
            ↻ Actualiser
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(170px,1fr))',
            gap: 12,
          }}
        >
          {[
            ['Effectif', `${players.length} joueurs`],
            ['Staff', `${staff.length} membres`],
            [
              'Licences',
              `${pendingLicenses} à suivre`,
            ],
            [
              'Transferts',
              `${activeTransfers} en cours`,
            ],
            [
              'Feuilles de match',
              nextSheet?.status ??
                'À préparer',
            ],
            ['Calendrier', `${matches.length} matchs`],
          ].map(([label, detail]) => (
            <button
              key={label}
              type="button"
              onClick={() =>
                openWorkspace(label)
              }
              style={{
                textAlign: 'left',
                padding: 16,
                minHeight: 90,
                borderRadius: 12,
              }}
            >
              <strong
                style={{
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                {label}
              </strong>

              <small>{detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section
        className="data-panel"
        style={{ marginTop: 18 }}
      >
        <div className="title">
          <span>
            <label>PARCOURS SPORTIF</label>
            <h2>Historique du club</h2>
          </span>
        </div>

        {sporting ? (
          <section className="stats">
            <article>
              <span>Saisons</span>
              <strong>
                {sporting.totalSeasons}
              </strong>
              <small>historique enregistré</small>
            </article>

            <article>
              <span>Ligue 1</span>
              <strong>
                {sporting.league1Seasons}
              </strong>
              <small>saison(s)</small>
            </article>

            <article>
              <span>Promotions</span>
              <strong>
                {sporting.promotions}
              </strong>
              <small>montée(s)</small>
            </article>

            <article>
              <span>Relégations</span>
              <strong>
                {sporting.relegations}
              </strong>
              <small>descente(s)</small>
            </article>
          </section>
        ) : (
          <p>
            Aucun historique sportif disponible.
          </p>
        )}
      </section>
    </div>
  );
}
