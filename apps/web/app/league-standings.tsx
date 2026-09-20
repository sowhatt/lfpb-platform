"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type Competition = {
  id: string;
  name: string;
  code: string;
  season?: { name?: string } | null;
};

type StandingRow = {
  position: number;
  clubId: string;
  clubName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

type PlayerStatistic = {
  registrationId: string;
  firstName: string;
  lastName: string;
  federationId: string | null;
  clubId: string;
  clubName: string;
  goals: number;
  yellowCards: number;
  redCards: number;
};

type PlayerStatisticsResponse = {
  competition: {
    id: string;
    name: string;
    code: string;
  };
  homologatedMatchesCount: number;
  players: PlayerStatistic[];
  topScorers: PlayerStatistic[];
  yellowCards: PlayerStatistic[];
  redCards: PlayerStatistic[];
};

type StandingsResponse = {
  competition: {
    id: string;
    name: string;
    code: string;
  };
  rules: {
    winPoints: number;
    drawPoints: number;
    lossPoints: number;
    provisionalTieBreakers: string[];
  };
  homologatedMatchesCount: number;
  standings: StandingRow[];
};

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status < 200 || response.status >= 300) {
    const raw = (payload as { message?: string | string[] }).message;
    throw new Error(
      Array.isArray(raw)
        ? raw.join(" · ")
        : (raw ?? `Erreur ${response.status}`),
    );
  }

  return payload as T;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function LeagueStandings({ token }: { token: string }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [playerStats, setPlayerStats] =
    useState<PlayerStatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    void request<Competition[]>("/competitions", token)
      .then((values) => {
        setCompetitions(values);
        setCompetitionId((current) =>
          current && values.some((item) => item.id === current)
            ? current
            : (values[0]?.id ?? ""),
        );
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Chargement des compétitions impossible",
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (competitionId === "") {
      setData(null);
      return;
    }

    setLoading(true);
    setError("");

    void Promise.all([
      request<StandingsResponse>(
        `/competitions/${competitionId}/standings`,
        token,
      ),
      request<PlayerStatisticsResponse>(
        `/competitions/${competitionId}/player-statistics`,
        token,
      ),
    ])
      .then(([standings, statistics]) => {
        setData(standings);
        setPlayerStats(statistics);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Chargement des statistiques impossible",
        ),
      )
      .finally(() => setLoading(false));
  }, [competitionId, token]);

  const selectedCompetition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitions, competitionId],
  );

  const totalGoals =
    data?.standings.reduce((sum, row) => sum + row.goalsFor, 0) ?? 0;

  const averageGoals =
    data && data.homologatedMatchesCount > 0
      ? totalGoals / data.homologatedMatchesCount
      : 0;

  async function refresh() {
    if (competitionId === "") return;

    setLoading(true);
    setError("");

    try {
      const [standings, statistics] = await Promise.all([
        request<StandingsResponse>(
          `/competitions/${competitionId}/standings`,
          token,
        ),
        request<PlayerStatisticsResponse>(
          `/competitions/${competitionId}/player-statistics`,
          token,
        ),
      ]);

      setData(standings);
      setPlayerStats(statistics);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Actualisation impossible",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="data-panel">
      <div className="workspace-actions">
        <div>
          <label>LIGUE · COMPÉTITION</label>
          <h2>Classement & statistiques</h2>
          <p>
            Classement officiel calculé uniquement à partir des résultats
            homologués par la Ligue.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || competitionId === ""}
          onClick={() => void refresh()}
        >
          ↻ Actualiser
        </button>
      </div>

      {error && <div className="api-error">{error}</div>}

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
                  : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <div className="draft-warning" style={{ marginTop: 18 }}>
          Chargement du classement officiel…
        </div>
      )}

      {!loading && data && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
              marginTop: 20,
            }}
          >
            {[
              ["CLUBS ENGAGÉS", data.standings.length],
              ["MATCHS HOMOLOGUÉS", data.homologatedMatchesCount],
              ["BUTS OFFICIELS", totalGoals],
              ["MOYENNE / MATCH", averageGoals.toFixed(2)],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="draft-warning"
                style={{ margin: 0 }}
              >
                <small>{label}</small>
                <strong
                  style={{
                    display: "block",
                    marginTop: 8,
                    fontSize: 28,
                  }}
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>

          <article className="data-panel" style={{ marginTop: 20 }}>
            <div className="workspace-actions">
              <div>
                <label>CLASSEMENT OFFICIEL</label>
                <h3>{selectedCompetition?.name ?? data.competition.name}</h3>
              </div>

              <div style={{ textAlign: "right" }}>
                <strong>
                  {data.rules.winPoints} pts victoire · {data.rules.drawPoints}{" "}
                  pt nul
                </strong>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  Matchs homologués uniquement
                </div>
              </div>
            </div>

            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 760,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Pos.",
                      "Club",
                      "MJ",
                      "G",
                      "N",
                      "P",
                      "BP",
                      "BC",
                      "Diff.",
                      "Pts",
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          textAlign: heading === "Club" ? "left" : "center",
                          padding: 10,
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {data.standings.map((row) => (
                    <tr
                      key={row.clubId}
                      style={{ borderTop: "1px solid #e3e8ec" }}
                    >
                      <td style={{ textAlign: "center", padding: 12 }}>
                        <strong>{row.position}</strong>
                      </td>
                      <td style={{ padding: 12 }}>
                        <strong>{row.clubName}</strong>
                      </td>
                      <td style={{ textAlign: "center", padding: 12 }}>
                        {row.played}
                      </td>
                      <td style={{ textAlign: "center", padding: 12 }}>
                        {row.won}
                      </td>
                      <td style={{ textAlign: "center", padding: 12 }}>
                        {row.drawn}
                      </td>
                      <td style={{ textAlign: "center", padding: 12 }}>
                        {row.lost}
                      </td>
                      <td style={{ textAlign: "center", padding: 12 }}>
                        {row.goalsFor}
                      </td>
                      <td style={{ textAlign: "center", padding: 12 }}>
                        {row.goalsAgainst}
                      </td>
                      <td style={{ textAlign: "center", padding: 12 }}>
                        {signed(row.goalDifference)}
                      </td>
                      <td style={{ textAlign: "center", padding: 12 }}>
                        <strong>{row.points}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="draft-warning" style={{ marginTop: 18 }}>
              <strong>Règles actuelles du moteur</strong>
              <p style={{ marginBottom: 0 }}>
                Victoire {data.rules.winPoints} points · nul{" "}
                {data.rules.drawPoints} point · défaite {data.rules.lossPoints}{" "}
                point. Les critères de départage restent provisoires jusqu’à
                validation du règlement officiel de la compétition.
              </p>
            </div>
          </article>

          <article className="data-panel" style={{ marginTop: 20 }}>
            <div className="workspace-actions">
              <div>
                <label>STATISTIQUES INDIVIDUELLES OFFICIELLES</label>
                <h3>Joueurs</h3>
                <p>
                  Événements enregistrés lors des matchs homologués uniquement.
                </p>
              </div>

              <div style={{ textAlign: "right" }}>
                <strong>
                  {playerStats?.homologatedMatchesCount ?? 0} match(s)
                  homologué(s)
                </strong>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 16,
                marginTop: 18,
              }}
            >
              {[
                {
                  title: "Meilleurs buteurs",
                  valueLabel: "Buts",
                  rows: playerStats?.topScorers ?? [],
                  value: (player: PlayerStatistic) => player.goals,
                },
                {
                  title: "Cartons jaunes",
                  valueLabel: "CJ",
                  rows: playerStats?.yellowCards ?? [],
                  value: (player: PlayerStatistic) => player.yellowCards,
                },
                {
                  title: "Cartons rouges",
                  valueLabel: "CR",
                  rows: playerStats?.redCards ?? [],
                  value: (player: PlayerStatistic) => player.redCards,
                },
              ].map((block) => (
                <div
                  key={block.title}
                  className="draft-warning"
                  style={{ margin: 0, overflowX: "auto" }}
                >
                  <strong>{block.title}</strong>

                  {block.rows.length === 0 ? (
                    <p style={{ marginBottom: 0 }}>Aucune donnée homologuée.</p>
                  ) : (
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        marginTop: 12,
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: 8 }}>
                            Joueur
                          </th>
                          <th style={{ textAlign: "left", padding: 8 }}>
                            Club
                          </th>
                          <th style={{ textAlign: "center", padding: 8 }}>
                            {block.valueLabel}
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {block.rows.map((player, index) => (
                          <tr
                            key={`${block.title}-${player.registrationId}-${player.clubId}`}
                            style={{
                              borderTop: "1px solid #e3e8ec",
                            }}
                          >
                            <td style={{ padding: 8 }}>
                              <strong>
                                {block.title === "Meilleurs buteurs"
                                  ? `${index + 1}. `
                                  : ""}
                                {player.firstName} {player.lastName}
                              </strong>
                            </td>
                            <td style={{ padding: 8 }}>{player.clubName}</td>
                            <td
                              style={{
                                textAlign: "center",
                                padding: 8,
                              }}
                            >
                              <strong>{block.value(player)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>

            <div className="draft-warning" style={{ marginTop: 18 }}>
              <strong>Source des statistiques joueurs</strong>
              <p style={{ marginBottom: 0 }}>
                Les buts et cartons proviennent des événements réellement
                enregistrés pendant les matchs homologués. Une correction
                administrative du score officiel modifie le classement, mais ne
                crée aucun but individuel fictif.
              </p>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
