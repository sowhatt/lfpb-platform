'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Player = {
  registrationId: string;
  clubId: string;
  side: string;
  role: string;
  shirtNumber: number;
  firstName: string;
  lastName: string;
  federationId?: string | null;
  position?: string | null;
  clubName: string;
};

type EventItem = {
  id: string;
  type: string;
  minute?: number | null;
  stoppageMinute?: number | null;
  description?: string | null;
  scoreAfter?: { home: number; away: number };
  player?: Player | null;
  secondaryPlayer?: Player | null;
};

type ReportPayload = {
  generatedAt: string;
  match: {
    id: string;
    status: string;
    kickoffAt?: string | null;
    homeScore: number;
    awayScore: number;
    homeClub: { id: string; name: string };
    awayClub: { id: string; name: string };
  };
  sheet: {
    id: string;
    status: string;
    lockedAt?: string | null;
    players: Player[];
  } | null;
  officials: Array<{
    role: string;
    registrationId: string;
    firstName: string;
    lastName: string;
    function?: string | null;
    grade?: string | null;
  }>;
  events: EventItem[];
  postMatchEntries: PostMatchEntry[];
  stats: {
    goals: number;
    yellowCards: number;
    redCards: number;
    substitutions: number;
    injuries: number;
    incidents: number;
    observations: number;
  };
  readiness: {
    completed: boolean;
    sheetLocked: boolean;
    readyForSignatures: boolean;
  };
};

type PostMatchEntry = {
  id: string;
  type:
    | 'TECHNICAL_RESERVE'
    | 'POST_MATCH_OBSERVATION'
    | 'OFFICIAL_INCIDENT_REPORT';
  description?: string | null;
  clubId?: string | null;
  registrationId?: string | null;
  createdAt: string;
};

type SignaturePayload = {
  officialSigned: boolean;
  homeSigned: boolean;
  awaySigned: boolean;
};

type Props = { token: string; matchId: string; refreshKey?: number };

const EVENT_LABELS: Record<string, string> = {
  MATCH_START: 'Coup d’envoi',
  HALF_TIME: 'Mi-temps',
  SECOND_HALF_START: 'Reprise',
  GOAL: 'But',
  YELLOW_CARD: 'Carton jaune',
  RED_CARD: 'Carton rouge',
  SUBSTITUTION: 'Remplacement',
  INJURY: 'Blessure',
  INCIDENT: 'Incident',
  OBSERVATION: 'Observation officielle',
  MATCH_END: 'Fin du match',
};

const OFFICIAL_LABELS: Record<string, string> = {
  REFEREE: 'Arbitre',
  ASSISTANT_REFEREE_1: 'Arbitre assistant 1',
  ASSISTANT_REFEREE_2: 'Arbitre assistant 2',
  FOURTH_OFFICIAL: 'Quatrième officiel',
  MATCH_COMMISSIONER: 'Commissaire au match',
};

function fullName(player: { firstName: string; lastName: string }) {
  return `${player.firstName} ${player.lastName}`.trim();
}

function minuteLabel(event: EventItem) {
  if (event.minute == null) return '';
  const stoppage = event.stoppageMinute ?? 0;
  return stoppage > 0
    ? `${event.minute}+${stoppage}’ · `
    : `${event.minute}’ · `;
}

export function OfficialPostMatchReport({ token, matchId, refreshKey = 0 }: Props) {
  const [data, setData] = useState<ReportPayload | null>(null);
  const [signatures, setSignatures] = useState<SignaturePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [reportResponse, signaturesResponse] = await Promise.all([
        fetch(`${API}/matches/${matchId}/report`, {
          headers,
          cache: 'no-store',
        }),
        fetch(`${API}/matches/${matchId}/sheet/signatures`, {
          headers,
          cache: 'no-store',
        }),
      ]);

      const report = await reportResponse.json();
      const signatureData = await signaturesResponse.json();

      if (!reportResponse.ok) {
        throw new Error(report.message ?? 'Rapport indisponible');
      }

      if (!signaturesResponse.ok) {
        throw new Error(signatureData.message ?? 'Signatures indisponibles');
      }

      setData(report as ReportPayload);
      setSignatures(signatureData as SignaturePayload);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Chargement impossible',
      );
    } finally {
      setLoading(false);
    }
  }, [matchId, token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const lineups = useMemo(() => {
    const players = data?.sheet?.players ?? [];

    return {
      homeStarters: players.filter(
        (p) => p.side === 'HOME' && p.role === 'STARTER',
      ),
      homeSubs: players.filter(
        (p) => p.side === 'HOME' && p.role === 'SUBSTITUTE',
      ),
      awayStarters: players.filter(
        (p) => p.side === 'AWAY' && p.role === 'STARTER',
      ),
      awaySubs: players.filter(
        (p) => p.side === 'AWAY' && p.role === 'SUBSTITUTE',
      ),
    };
  }, [data]);

  if (loading) {
    return (
      <section className="data-panel" style={{ marginTop: 18, padding: 20 }}>
        <p>Préparation du rapport d’après-match…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="data-panel" style={{ marginTop: 18, padding: 20 }}>
        <div className="api-error">{error}</div>
      </section>
    );
  }

  if (!data) return null;

  const clubsSigned = Boolean(signatures?.homeSigned && signatures?.awaySigned);
  const finalized = Boolean(signatures?.officialSigned);

  return (
    <section className="data-panel" style={{ marginTop: 18, padding: 20 }}>
      <label>APRÈS-MATCH · RAPPORT OFFICIEL</label>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'start',
        }}
      >
        <div>
          <h2 style={{ margin: '8px 0 4px' }}>
            {data.match.homeClub.name} — {data.match.awayClub.name}
          </h2>
          <p style={{ margin: 0 }}>
            Synthèse officielle générée à partir de la feuille verrouillée et
            des faits enregistrés pendant la rencontre.
          </p>
        </div>

        <button type="button" onClick={() => void load()}>
          ↻ Actualiser
        </button>
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 18,
          border: '1px solid #d9e2ec',
          borderRadius: 14,
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.7 }}>SCORE FINAL</div>
        <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>
          {data.match.homeClub.name} {data.match.homeScore} —{' '}
          {data.match.awayScore} {data.match.awayClub.name}
        </div>

        <div style={{ marginTop: 8 }}>
          {data.readiness.completed ? '✅ Match terminé' : '⏳ Match non terminé'}
          {' · '}
          {data.readiness.sheetLocked
            ? '✅ Feuille verrouillée'
            : '⏳ Feuille non verrouillée'}
          {' · '}
          {finalized
            ? '✅ Signatures finalisées'
            : clubsSigned
              ? '⏳ Signature officielle attendue'
              : '⏳ Signatures à terminer'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10,
          marginTop: 14,
        }}
      >
        <ReportStat label="Buts" value={data.stats.goals} />
        <ReportStat label="Jaunes" value={data.stats.yellowCards} />
        <ReportStat label="Rouges" value={data.stats.redCards} />
        <ReportStat label="Remplacements" value={data.stats.substitutions} />
        <ReportStat label="Blessures" value={data.stats.injuries} />
        <ReportStat label="Incidents" value={data.stats.incidents} />
        <ReportStat label="Observations" value={data.stats.observations} />
      </div>

      <h3 style={{ marginTop: 24 }}>Compositions officielles</h3>

      {!data.sheet ? (
        <div className="api-error">Feuille de match introuvable.</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
            gap: 14,
          }}
        >
          <LineupCard
            club={data.match.homeClub.name}
            starters={lineups.homeStarters}
            substitutes={lineups.homeSubs}
          />
          <LineupCard
            club={data.match.awayClub.name}
            starters={lineups.awayStarters}
            substitutes={lineups.awaySubs}
          />
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>Officiels désignés</h3>

      {data.officials.length === 0 ? (
        <p>Aucun officiel confirmé.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.officials.map((official) => (
            <div
              key={`${official.role}-${official.registrationId}`}
              style={{
                padding: 12,
                border: '1px solid #e5e7eb',
                borderRadius: 10,
              }}
            >
              <strong>
                {OFFICIAL_LABELS[official.role] ?? official.role}
              </strong>
              <div>
                {fullName(official)}
                {official.grade ? ` · ${official.grade}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>Chronologie officielle</h3>

      <section style={{ marginTop: 24 }}>
        <h3>Réserves et rapports post-match</h3>

        {data.postMatchEntries.length === 0 ? (
          <p>
            Aucune réserve, observation post-match ou rapport
            circonstancié enregistré.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {data.postMatchEntries.map((entry) => (
              <article
                key={entry.id}
                style={{
                  border: '1px solid #d9e2ec',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <strong>
                  {entry.type === 'TECHNICAL_RESERVE'
                    ? '⚠️ Réserve technique'
                    : entry.type === 'OFFICIAL_INCIDENT_REPORT'
                      ? '📄 Rapport circonstancié'
                      : '📝 Observation après-match'}
                </strong>

                <div style={{ marginTop: 6 }}>
                  {entry.description}
                </div>

                <small>
                  {new Date(entry.createdAt).toLocaleString('fr-FR')}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>

      {data.events.length === 0 ? (
        <p>Aucun événement enregistré.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.events.map((event) => (
            <div
              key={event.id}
              style={{
                padding: 12,
                border: '1px solid #e5e7eb',
                borderRadius: 10,
              }}
            >
              <strong>
                {minuteLabel(event)}
                {EVENT_LABELS[event.type] ?? event.type}
              </strong>

              {event.player ? (
                <div style={{ marginTop: 4 }}>
                  N°{event.player.shirtNumber} · {fullName(event.player)}
                  {event.type === 'SUBSTITUTION' && event.secondaryPlayer
                    ? ` → N°${event.secondaryPlayer.shirtNumber} · ${fullName(event.secondaryPlayer)}`
                    : ''}
                </div>
              ) : null}

              {event.description ? (
                <div style={{ marginTop: 4 }}>{event.description}</div>
              ) : null}

              {event.scoreAfter ? (
                <small>
                  Score après événement : {event.scoreAfter.home}–
                  {event.scoreAfter.away}
                </small>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 10,
          background: '#f8fafc',
        }}
      >
        <strong>
          {data.readiness.readyForSignatures
            ? finalized
              ? '✅ Rapport signé par l’officiel'
              : '✅ Rapport prêt pour le circuit de signatures'
            : '🔒 Rapport non finalisable'}
        </strong>

        <div style={{ marginTop: 4 }}>
          {data.readiness.readyForSignatures
            ? 'Le match est terminé et la feuille initiale est verrouillée.'
            : 'Le match doit être terminé et la feuille verrouillée avant finalisation.'}
        </div>
      </div>
    </section>
  );
}

function LineupCard({
  club,
  starters,
  substitutes,
}: {
  club: string;
  starters: Player[];
  substitutes: Player[];
}) {
  return (
    <article
      style={{
        border: '1px solid #d9e2ec',
        borderRadius: 14,
        padding: 16,
      }}
    >
      <strong>{club}</strong>

      <h4>Titulaires · {starters.length}</h4>
      {starters.map((player) => (
        <div key={player.registrationId}>
          N°{player.shirtNumber} · {fullName(player)}
        </div>
      ))}

      <h4>Remplaçants · {substitutes.length}</h4>
      {substitutes.map((player) => (
        <div key={player.registrationId}>
          N°{player.shirtNumber} · {fullName(player)}
        </div>
      ))}
    </article>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: 12,
        border: '1px solid #d9e2ec',
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <strong style={{ fontSize: 22 }}>{value}</strong>
    </div>
  );
}
