'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type EventItem = {
  id: string;
  type: string;
  minute?: number | null;
  description?: string | null;
  scoreAfter?: { home: number; away: number };
};
type EventPayload = {
  match: { id: string; status: string; homeScore: number; awayScore: number };
  events: EventItem[];
};
type SignaturePayload = { officialSigned: boolean; homeSigned: boolean; awaySigned: boolean };

type Props = { token: string; matchId: string };

const EVENT_LABELS: Record<string, string> = {
  MATCH_START: 'Coup d’envoi', HALF_TIME: 'Mi-temps', SECOND_HALF_START: 'Reprise', GOAL: 'But',
  YELLOW_CARD: 'Carton jaune', RED_CARD: 'Carton rouge', SUBSTITUTION: 'Remplacement', INCIDENT: 'Incident', MATCH_END: 'Fin du match',
};

export function OfficialPostMatchReport({ token, matchId }: Props) {
  const [data, setData] = useState<EventPayload | null>(null);
  const [signatures, setSignatures] = useState<SignaturePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [eventsResponse, signaturesResponse] = await Promise.all([
        fetch(`${API}/matches/${matchId}/events`, { headers, cache: 'no-store' }),
        fetch(`${API}/matches/${matchId}/sheet/signatures`, { headers, cache: 'no-store' }),
      ]);
      const events = await eventsResponse.json();
      const signatureData = await signaturesResponse.json();
      if (!eventsResponse.ok) throw new Error(events.message ?? 'Rapport indisponible');
      if (!signaturesResponse.ok) throw new Error(signatureData.message ?? 'Signatures indisponibles');
      setData(events as EventPayload); setSignatures(signatureData as SignaturePayload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible');
    } finally { setLoading(false); }
  }, [matchId, token]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const events = data?.events ?? [];
    return {
      goals: events.filter((event) => event.type === 'GOAL').length,
      yellows: events.filter((event) => event.type === 'YELLOW_CARD').length,
      reds: events.filter((event) => event.type === 'RED_CARD').length,
      substitutions: events.filter((event) => event.type === 'SUBSTITUTION').length,
      incidents: events.filter((event) => event.type === 'INCIDENT').length,
    };
  }, [data]);

  if (loading) return <section className="data-panel" style={{ marginTop: 18, padding: 20 }}><p>Préparation du rapport d’après-match…</p></section>;
  if (error) return <section className="data-panel" style={{ marginTop: 18, padding: 20 }}><div className="api-error">{error}</div></section>;
  if (!data) return null;

  const completed = data.match.status === 'COMPLETED';
  const finalized = Boolean(signatures?.officialSigned);

  return (
    <section className="data-panel" style={{ marginTop: 18, padding: 20 }}>
      <label>APRÈS-MATCH · RAPPORT OFFICIEL</label>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <h2 style={{ margin: '8px 0 4px' }}>Rapport de la rencontre</h2>
          <p style={{ margin: 0 }}>Synthèse issue des événements enregistrés pendant le match.</p>
        </div>
        <button type="button" onClick={() => void load()}>↻ Actualiser</button>
      </div>

      <div style={{ marginTop: 18, padding: 18, border: '1px solid #d9e2ec', borderRadius: 14 }}>
        <div style={{ fontSize: 13, opacity: .7 }}>SCORE FINAL</div>
        <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{data.match.homeScore} — {data.match.awayScore}</div>
        <div style={{ marginTop: 8 }}>{completed ? '✅ Match terminé' : '⏳ Match non terminé'} · {finalized ? '✅ Feuille finalisée' : '⏳ Signatures à terminer'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10, marginTop: 14 }}>
        <ReportStat label="Buts" value={stats.goals} />
        <ReportStat label="Cartons jaunes" value={stats.yellows} />
        <ReportStat label="Cartons rouges" value={stats.reds} />
        <ReportStat label="Remplacements" value={stats.substitutions} />
        <ReportStat label="Incidents" value={stats.incidents} />
      </div>

      <h3 style={{ marginTop: 22 }}>Chronologie officielle</h3>
      {data.events.length === 0 ? <p>Aucun événement enregistré.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.events.map((event) => (
            <div key={event.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10 }}>
              <strong>{event.minute != null ? `${event.minute}’ · ` : ''}{EVENT_LABELS[event.type] ?? event.type}</strong>
              {event.description ? <div style={{ marginTop: 4 }}>{event.description}</div> : null}
              {event.scoreAfter ? <small>Score après événement : {event.scoreAfter.home}–{event.scoreAfter.away}</small> : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: '#f8fafc' }}>
        <strong>{completed && finalized ? '✅ Rapport prêt pour clôture administrative' : '🔒 Rapport non clôturable'}</strong>
        <div style={{ marginTop: 4 }}>La clôture définitive et les observations/réserves seront ajoutées à l’étape suivante avant transmission à la Ligue.</div>
      </div>
    </section>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return <div style={{ padding: 12, border: '1px solid #d9e2ec', borderRadius: 10 }}><div style={{ fontSize: 12, opacity: .7 }}>{label}</div><strong style={{ fontSize: 22 }}>{value}</strong></div>;
}
