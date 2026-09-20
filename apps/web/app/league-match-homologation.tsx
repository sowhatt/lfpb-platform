'use client';

import { useEffect, useMemo, useState } from 'react';

const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Competition = {
  id: string;
  name: string;
  code: string;
  season?: { name?: string } | null;
};

type Club = {
  id: string;
  shortName?: string;
  organization?: { name?: string };
};

type PendingMatch = {
  id: string;
  kickoffAt?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homologationStatus?: string | null;
  round?: { number?: number | null; name?: string | null } | null;
  venue?: { name?: string } | null;
  homeClub: Club;
  awayClub: Club;
};

type PostMatchEntry = {
  id: string;
  type: string;
  createdAt?: string;
  actorUserId?: string;
  description?: string;
  clubId?: string | null;
  registrationId?: string | null;
};

type HomologationDetail = {
  match: PendingMatch & {
    status: string;
    officialHomeScore?: number | null;
    officialAwayScore?: number | null;
    homologationReason?: string | null;
    homologatedAt?: string | null;
    matchSheet?: {
      id: string;
      status: string;
      lockedAt?: string | null;
    } | null;
  };
  officiallyClosed: boolean;
  closure?: {
    createdAt?: string;
  } | null;
  postMatchEntries: PostMatchEntry[];
};

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
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
    throw new Error(
      Array.isArray(raw) ? raw.join(' · ') : raw ?? `Erreur ${response.status}`,
    );
  }

  return payload as T;
}

function clubName(club?: Club) {
  return club?.shortName || club?.organization?.name || 'Club';
}

function formatDate(value?: string | null) {
  if (!value) return 'Date non renseignée';

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function LeagueMatchHomologation({
  token,
}: {
  token: string;
}) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState('');
  const [pending, setPending] = useState<PendingMatch[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<HomologationDetail | null>(null);

  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [reason, setReason] = useState('');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadCompetitions() {
    const values = await request<Competition[]>('/competitions', token);
    setCompetitions(values);

    setCompetitionId((current) => {
      if (current && values.some((item) => item.id === current)) {
        return current;
      }
      return values[0]?.id ?? '';
    });
  }

  async function loadPending(id: string) {
    if (!id) {
      setPending([]);
      setSelectedId('');
      setDetail(null);
      return;
    }

    const values = await request<PendingMatch[]>(
      `/competitions/${id}/homologations/pending`,
      token,
    );

    setPending(values);

    setSelectedId((current) => {
      if (current && values.some((item) => item.id === current)) {
        return current;
      }
      return values[0]?.id ?? '';
    });

    if (!values.length) {
      setDetail(null);
    }
  }

  async function loadDetail(matchId: string) {
    if (!matchId) {
      setDetail(null);
      return;
    }

    const value = await request<HomologationDetail>(
      `/matches/${matchId}/homologation`,
      token,
    );

    setDetail(value);
    setHomeScore(String(value.match.homeScore ?? ''));
    setAwayScore(String(value.match.awayScore ?? ''));
    setReason('');
  }

  async function refresh() {
    setLoading(true);
    setError('');

    try {
      await loadCompetitions();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Chargement des compétitions impossible',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  useEffect(() => {
    if (!competitionId) return;

    setLoading(true);
    setError('');
    setMessage('');

    void loadPending(competitionId)
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : 'Chargement des homologations impossible',
        ),
      )
      .finally(() => setLoading(false));
  }, [competitionId, token]);

  useEffect(() => {
    setError('');
    setMessage('');

    void loadDetail(selectedId).catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : 'Chargement du dossier impossible',
      ),
    );
  }, [selectedId, token]);

  const selectedCompetition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitions, competitionId],
  );

  const scoreChanged =
    detail !== null &&
    (Number(homeScore) !== detail.match.homeScore ||
      Number(awayScore) !== detail.match.awayScore);

  const canHomologate =
    detail?.officiallyClosed === true &&
    detail.match.homologationStatus === 'PENDING' &&
    homeScore !== '' &&
    awayScore !== '' &&
    Number(homeScore) >= 0 &&
    Number(awayScore) >= 0 &&
    Number.isInteger(Number(homeScore)) &&
    Number.isInteger(Number(awayScore)) &&
    (!scoreChanged || reason.trim().length >= 3);

  async function homologate() {
    if (!detail || !canHomologate) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await request(
        `/matches/${detail.match.id}/homologate`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            officialHomeScore: Number(homeScore),
            officialAwayScore: Number(awayScore),
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          }),
        },
      );

      setMessage('Résultat homologué par la Ligue.');

      await loadPending(competitionId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Homologation impossible',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="data-panel">
      <div className="workspace-actions">
        <div>
          <label>LIGUE · APRÈS-MATCH</label>
          <h2>Homologation des résultats</h2>
          <p>
            Seuls les matchs officiellement clôturés peuvent devenir des
            résultats officiels.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void loadPending(competitionId)}
        >
          ↻ Actualiser
        </button>
      </div>

      {error && <div className="api-error">{error}</div>}
      {message && <div className="draft-warning">{message}</div>}

      <div style={{ marginTop: 18 }}>
        <label>
          Compétition
          <select
            value={competitionId}
            onChange={(event) => setCompetitionId(event.target.value)}
            style={{ marginLeft: 10 }}
          >
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}
                {competition.season?.name
                  ? ` · ${competition.season.name}`
                  : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, .8fr) minmax(0, 1.4fr)',
          gap: 18,
          marginTop: 20,
        }}
      >
        <article className="data-panel" style={{ margin: 0 }}>
          <label>À HOMOLOGUER</label>
          <h3>
            {selectedCompetition?.name ?? 'Compétition'} · {pending.length}
          </h3>

          {loading && <p>Chargement…</p>}

          {!loading && pending.length === 0 && (
            <div className="draft-warning">
              Aucun résultat en attente d’homologation.
            </div>
          )}

          {pending.map((match) => (
            <button
              key={match.id}
              type="button"
              onClick={() => setSelectedId(match.id)}
              style={{
                width: '100%',
                marginTop: 10,
                padding: 14,
                textAlign: 'left',
                border:
                  selectedId === match.id
                    ? '2px solid #0b2c48'
                    : '1px solid #dfe5e9',
                borderRadius: 10,
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <small>
                {match.round?.number
                  ? `Journée ${match.round.number} · `
                  : ''}
                {formatDate(match.kickoffAt)}
              </small>

              <strong
                style={{
                  display: 'block',
                  marginTop: 6,
                  fontSize: 15,
                }}
              >
                {clubName(match.homeClub)}
                {'  '}
                {match.homeScore ?? '–'} – {match.awayScore ?? '–'}
                {'  '}
                {clubName(match.awayClub)}
              </strong>

              <span
                style={{
                  display: 'block',
                  marginTop: 5,
                  fontSize: 11,
                }}
              >
                {match.venue?.name ?? 'Stade non renseigné'}
              </span>
            </button>
          ))}
        </article>

        <article className="data-panel" style={{ margin: 0 }}>
          {!detail ? (
            <div className="draft-warning">
              Sélectionnez une rencontre à homologuer.
            </div>
          ) : (
            <>
              <label>DOSSIER OFFICIEL</label>

              <h3>
                {clubName(detail.match.homeClub)}{' '}
                {detail.match.homeScore ?? '–'} –{' '}
                {detail.match.awayScore ?? '–'}{' '}
                {clubName(detail.match.awayClub)}
              </h3>

              <p>
                {detail.officiallyClosed
                  ? '✓ Rapport officiellement clôturé'
                  : '⚠ Rapport non clôturé'}
                {' · '}
                Feuille :{' '}
                <strong>
                  {detail.match.matchSheet?.status ?? 'introuvable'}
                </strong>
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginTop: 18,
                }}
              >
                <div className="draft-warning" style={{ margin: 0 }}>
                  <small>SCORE TERRAIN</small>
                  <strong
                    style={{
                      display: 'block',
                      marginTop: 8,
                      fontSize: 28,
                    }}
                  >
                    {detail.match.homeScore ?? '–'} –{' '}
                    {detail.match.awayScore ?? '–'}
                  </strong>
                </div>

                <div className="draft-warning" style={{ margin: 0 }}>
                  <small>ÉTAT ADMINISTRATIF</small>
                  <strong
                    style={{
                      display: 'block',
                      marginTop: 8,
                    }}
                  >
                    {detail.match.homologationStatus ?? '—'}
                  </strong>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <h3>Réserves et incidents</h3>

                {detail.postMatchEntries.length === 0 ? (
                  <p>Aucune réserve ou observation enregistrée.</p>
                ) : (
                  detail.postMatchEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="draft-warning"
                      style={{ marginTop: 8 }}
                    >
                      <strong>{entry.type}</strong>
                      <p style={{ marginBottom: 0 }}>
                        {entry.description ??
                          'Observation enregistrée dans le rapport.'}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 22 }}>
                <label>SCORE OFFICIEL</label>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    gap: 10,
                    alignItems: 'end',
                    marginTop: 10,
                  }}
                >
                  <label>
                    {clubName(detail.match.homeClub)}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={homeScore}
                      onChange={(event) =>
                        setHomeScore(event.target.value)
                      }
                    />
                  </label>

                  <strong style={{ paddingBottom: 12 }}>–</strong>

                  <label>
                    {clubName(detail.match.awayClub)}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={awayScore}
                      onChange={(event) =>
                        setAwayScore(event.target.value)
                      }
                    />
                  </label>
                </div>
              </div>

              {scoreChanged && (
                <div style={{ marginTop: 16 }}>
                  <label>
                    Motif de la décision administrative
                    <textarea
                      value={reason}
                      onChange={(event) =>
                        setReason(event.target.value)
                      }
                      placeholder="Ex. décision de la commission, forfait, réserve recevable…"
                      rows={4}
                    />
                  </label>

                  <p style={{ fontSize: 11 }}>
                    Le score officiel diffère du score terrain. Le motif est
                    obligatoire et sera conservé dans l’audit.
                  </p>
                </div>
              )}

              {!detail.officiallyClosed && (
                <div className="api-error">
                  Ce match ne peut pas être homologué tant que la clôture
                  officielle n’est pas enregistrée.
                </div>
              )}

              <div
                className="workspace-actions"
                style={{ marginTop: 20 }}
              >
                <div>
                  <strong>
                    {scoreChanged
                      ? 'Décision administrative avec modification du résultat'
                      : 'Confirmation du résultat terrain'}
                  </strong>
                </div>

                <button
                  type="button"
                  disabled={!canHomologate || busy}
                  onClick={() => void homologate()}
                >
                  {busy
                    ? 'Homologation…'
                    : '✓ Homologuer le résultat'}
                </button>
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
