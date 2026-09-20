"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type Club = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  shortName: string;
  division?: string | null;
  city?: string | null;
};

type License = {
  id: string;
  number?: string | null;
  status?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
};

type PlayerIndex = {
  personId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  nationality?: string | null;
  federationId?: string | null;
  current?: {
    registrationId: string;
    club?: Club | null;
    registrationStatus: string;
    license?: License | null;
  } | null;
  registrations: number;
  clubs: number;
  dataQuality: {
    multipleActiveRegistrations: boolean;
  };
};

type CareerItem = {
  registrationId: string;
  organizationId: string;
  club?: Club | null;
  status: string;
  startDate: string;
  endDate?: string | null;
  playerProfile?: {
    position?: string | null;
    jerseyNumber?: number | null;
  } | null;
  licenses: License[];
};

type Competition = {
  id: string;
  name: string;
  code: string;
  division?: string | null;
  season: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  };
  homologatedMatchesCount: number;
  statistics: {
    goals: number;
    yellowCards: number;
    redCards: number;
  };
  discipline: {
    activeSuspensions: Array<{
      registrationId: string;
      matchesTotal?: number;
      matchesServed?: number;
      matchesRemaining?: number;
      reason?: string | null;
    }>;
  };
};

type Player360 = {
  person: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    nationality?: string | null;
    federationId?: string | null;
    photoDataUrl?: string | null;
  };
  current?: {
    registrationId: string;
    organizationId: string;
    club?: Club | null;
    status: string;
    startDate: string;
    endDate?: string | null;
    playerProfile?: {
      position?: string | null;
      jerseyNumber?: number | null;
    } | null;
    license?: License | null;
  } | null;
  career: CareerItem[];
  competitions: Competition[];
  summary: {
    registrations: number;
    clubs: number;
    firstRegistrationDate?: string | null;
    currentRegistrationId?: string | null;
  };
};

type Props = {
  token: string;
};

async function api<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const raw =
      typeof payload === "object" && payload !== null && "message" in payload
        ? (payload as { message?: string | string[] }).message
        : undefined;

    const message = Array.isArray(raw)
      ? raw.join(" · ")
      : (raw ?? `Erreur ${response.status}`);

    throw new Error(message);
  }

  return payload as T;
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function divisionLabel(value?: string | null) {
  if (value === "LIGUE_1") return "Ligue 1";
  if (value === "LIGUE_2") return "Ligue 2";
  return value ?? "—";
}

function normalize(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function LeaguePlayersManagement({ token }: Props) {
  const [players, setPlayers] = useState<PlayerIndex[]>([]);
  const [selected, setSelected] = useState<Player360 | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const detailRef = useRef<HTMLElement | null>(null);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await api<PlayerIndex[]>("/registries/player-360", token);
      setPlayers(data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chargement des joueurs impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPlayers();
  }, [loadPlayers]);

  const filteredPlayers = useMemo(() => {
    const needle = normalize(query.trim());

    if (!needle) return players;

    return players.filter((player) => {
      const searchable = [
        player.firstName,
        player.lastName,
        player.federationId,
        player.current?.club?.name,
        player.current?.club?.shortName,
        player.current?.club?.code,
        player.current?.license?.number,
      ]
        .map(normalize)
        .join(" ");

      return searchable.includes(needle);
    });
  }, [players, query]);

  const anomalies = players.filter(
    (player) => player.dataQuality.multipleActiveRegistrations,
  ).length;

  async function openPlayer(player: PlayerIndex) {
    setError("");
    setSelected(null);

    if (player.dataQuality.multipleActiveRegistrations) {
      setError(
        `${player.firstName} ${player.lastName} possède plusieurs inscriptions actives. La Ligue doit régulariser la situation avant d'ouvrir la fiche Player 360 complète.`,
      );
      return;
    }

    setDetailLoading(true);

    try {
      const detail = await api<Player360>(
        `/registries/player-360/${player.personId}`,
        token,
      );

      setSelected(detail);

      window.setTimeout(() => {
        detailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Ouverture de la fiche Player 360 impossible",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="league-player-page">
      <section className="league-player-header">
        <div>
          <span className="league-player-eyebrow">
            Ligue · Référentiel joueurs
          </span>
          <h2>Joueurs</h2>
          <p>
            Identité permanente, club actuel, licences, parcours sportif,
            statistiques officielles et discipline.
          </p>
        </div>

        <button
          type="button"
          className="league-player-refresh"
          onClick={() => void loadPlayers()}
          disabled={loading}
        >
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
      </section>

      <section className="league-player-summary">
        <article>
          <strong>{players.length}</strong>
          <span>Identités joueurs</span>
        </article>

        <article>
          <strong>
            {players.filter((player) => Boolean(player.current)).length}
          </strong>
          <span>Avec club actuel</span>
        </article>

        <article>
          <strong>{anomalies}</strong>
          <span>À régulariser</span>
        </article>

        <article>
          <strong>{players.filter((player) => player.clubs > 1).length}</strong>
          <span>Parcours multi-clubs</span>
        </article>
      </section>

      <section className="league-player-panel">
        <div className="league-player-toolbar">
          <div>
            <h3>Référentiel Player 360</h3>
            <small>
              {filteredPlayers.length} joueur
              {filteredPlayers.length > 1 ? "s" : ""}
            </small>
          </div>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, prénom, identifiant FBF, club, licence…"
            aria-label="Rechercher un joueur"
          />
        </div>

        {error ? <div className="league-player-error">{error}</div> : null}

        {loading ? (
          <div className="league-player-empty">Chargement des joueurs…</div>
        ) : filteredPlayers.length === 0 ? (
          <div className="league-player-empty">Aucun joueur trouvé.</div>
        ) : (
          <div className="league-player-table-wrap">
            <table className="league-player-table">
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Identifiant FBF</th>
                  <th>Club actuel</th>
                  <th>Division</th>
                  <th>Parcours</th>
                  <th>Situation</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {filteredPlayers.map((player) => {
                  const anomaly =
                    player.dataQuality.multipleActiveRegistrations;

                  return (
                    <tr key={player.personId}>
                      <td>
                        <strong>
                          {player.lastName} {player.firstName}
                        </strong>
                        <small>Né(e) le {formatDate(player.birthDate)}</small>
                      </td>

                      <td>{player.federationId ?? "—"}</td>

                      <td>
                        {anomaly
                          ? "À déterminer"
                          : (player.current?.club?.shortName ??
                            player.current?.club?.name ??
                            "Sans club actif")}
                      </td>

                      <td>
                        {anomaly
                          ? "—"
                          : divisionLabel(player.current?.club?.division)}
                      </td>

                      <td>
                        {player.clubs} club{player.clubs > 1 ? "s" : ""} ·{" "}
                        {player.registrations} inscription
                        {player.registrations > 1 ? "s" : ""}
                      </td>

                      <td>
                        <span
                          className={
                            anomaly
                              ? "league-player-badge league-player-badge-warning"
                              : player.current
                                ? "league-player-badge league-player-badge-ok"
                                : "league-player-badge"
                          }
                        >
                          {anomaly
                            ? "À régulariser"
                            : player.current
                              ? "Actif"
                              : "Sans inscription active"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="league-player-open"
                          onClick={() => void openPlayer(player)}
                          disabled={detailLoading}
                        >
                          Voir Player 360
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <section ref={detailRef} className="league-player-detail">
          <div className="league-player-detail-header">
            <div className="league-player-identity">
              {selected.person.photoDataUrl ? (
                <img
                  src={selected.person.photoDataUrl}
                  alt=""
                  className="league-player-photo"
                />
              ) : (
                <div className="league-player-photo league-player-photo-empty">
                  {selected.person.firstName.charAt(0)}
                  {selected.person.lastName.charAt(0)}
                </div>
              )}

              <div>
                <span className="league-player-eyebrow">Player 360</span>
                <h2>
                  {selected.person.firstName} {selected.person.lastName}
                </h2>
                <p>
                  {formatDate(selected.person.birthDate)}
                  {" · "}
                  {selected.person.nationality ?? "Nationalité non renseignée"}
                </p>
                <small>
                  FBF : {selected.person.federationId ?? "Non renseigné"}
                </small>
              </div>
            </div>

            <button
              type="button"
              className="league-player-close"
              onClick={() => setSelected(null)}
            >
              Fermer
            </button>
          </div>

          <div className="league-player-summary league-player-detail-summary">
            <article>
              <strong>{selected.summary.clubs}</strong>
              <span>Clubs</span>
            </article>

            <article>
              <strong>{selected.summary.registrations}</strong>
              <span>Inscriptions</span>
            </article>

            <article>
              <strong>
                {formatDate(selected.summary.firstRegistrationDate)}
              </strong>
              <span>Première inscription</span>
            </article>

            <article>
              <strong>
                {selected.competitions.reduce(
                  (total, competition) => total + competition.statistics.goals,
                  0,
                )}
              </strong>
              <span>Buts officiels</span>
            </article>
          </div>

          <section className="league-player-card">
            <div className="league-player-section-title">
              <h3>Situation actuelle</h3>
            </div>

            {selected.current ? (
              <div className="league-player-current-grid">
                <div>
                  <small>Club</small>
                  <strong>
                    {selected.current.club?.name ?? "Non renseigné"}
                  </strong>
                </div>

                <div>
                  <small>Division</small>
                  <strong>
                    {divisionLabel(selected.current.club?.division)}
                  </strong>
                </div>

                <div>
                  <small>Statut inscription</small>
                  <strong>{selected.current.status}</strong>
                </div>

                <div>
                  <small>Licence</small>
                  <strong>
                    {selected.current.license?.number ?? "Non renseignée"}
                  </strong>
                </div>
              </div>
            ) : (
              <p>Aucune inscription active actuellement.</p>
            )}
          </section>

          <section className="league-player-card">
            <div className="league-player-section-title">
              <h3>Parcours clubs</h3>
              <span>{selected.career.length} période(s)</span>
            </div>

            <div className="league-player-career">
              {selected.career.map((item) => (
                <article key={item.registrationId}>
                  <div className="league-player-career-date">
                    {formatDate(item.startDate)}
                    <span>→</span>
                    {item.endDate ? formatDate(item.endDate) : "Aujourd’hui"}
                  </div>

                  <div>
                    <strong>{item.club?.name ?? "Club non renseigné"}</strong>
                    <p>
                      {divisionLabel(item.club?.division)} · {item.status}
                    </p>
                  </div>

                  <div>
                    <small>Licence</small>
                    <strong>{item.licenses[0]?.number ?? "—"}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="league-player-card">
            <div className="league-player-section-title">
              <h3>Statistiques officielles</h3>
              <span>Matchs homologués uniquement</span>
            </div>

            {selected.competitions.length === 0 ? (
              <p>Aucune statistique officielle disponible.</p>
            ) : (
              <div className="league-player-competitions">
                {selected.competitions.map((competition) => (
                  <article key={competition.id}>
                    <div className="league-player-competition-head">
                      <div>
                        <strong>{competition.name}</strong>
                        <small>
                          {competition.season.name} ·{" "}
                          {divisionLabel(competition.division)}
                        </small>
                      </div>

                      <span>
                        {competition.homologatedMatchesCount} apparition
                        {competition.homologatedMatchesCount > 1 ? "s" : ""} sur
                        feuille homologuée
                      </span>
                    </div>

                    <div className="league-player-stat-grid">
                      <div>
                        <strong>{competition.statistics.goals}</strong>
                        <span>Buts</span>
                      </div>
                      <div>
                        <strong>{competition.statistics.yellowCards}</strong>
                        <span>Jaunes</span>
                      </div>
                      <div>
                        <strong>{competition.statistics.redCards}</strong>
                        <span>Rouges</span>
                      </div>
                    </div>

                    {competition.discipline.activeSuspensions.length > 0 ? (
                      <div className="league-player-suspension">
                        <strong>Suspension active</strong>

                        {competition.discipline.activeSuspensions.map(
                          (suspension) => (
                            <p key={suspension.registrationId}>
                              {suspension.reason ?? "Sanction disciplinaire"}
                              {typeof suspension.matchesRemaining === "number"
                                ? ` · ${suspension.matchesRemaining} match(s) restant(s)`
                                : ""}
                            </p>
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="league-player-discipline-ok">
                        Aucune suspension active
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : null}
    </div>
  );
}
