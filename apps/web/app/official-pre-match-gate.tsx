'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type ControlSummary = {
  total: number;
  verified: number;
  anomalies: number;
  pending: number;
  complete: boolean;
};

async function loadSummary(token: string, matchId: string): Promise<ControlSummary> {
  const response = await fetch(`${API}/matches/${matchId}/sheet/player-controls`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = (payload as { message?: string | string[] }).message;
    throw new Error(Array.isArray(raw) ? raw.join(' · ') : raw ?? `Erreur ${response.status}`);
  }
  return payload as ControlSummary;
}

export function OfficialPreMatchGate({ token, matchId }: { token: string; matchId: string }) {
  const [summary, setSummary] = useState<ControlSummary | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setSummary(await loadSummary(token, matchId));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Progression du contrôle indisponible');
    }
  }, [matchId, token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (error) return <div className="api-error" style={{ marginBottom: 16 }}>{error}</div>;
  if (!summary) return null;

  const blocked = !summary.complete;
  return (
    <section className="data-panel" style={{ marginBottom: 20, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label>AVANT-MATCH · GARDE-FOU TERRAIN</label>
          <h3 style={{ margin: '6px 0 4px' }}>
            {summary.verified}/{summary.total} vérifiés · ⚠ {summary.anomalies} anomalie(s) · {summary.pending} à contrôler
          </h3>
          <p style={{ margin: 0 }}>
            {blocked
              ? 'Le verrouillage reste interdit tant que chaque joueur de la feuille n’est pas vérifié et que les anomalies ne sont pas résolues.'
              : 'Contrôle terrain terminé. La feuille peut être verrouillée.'}
          </p>
        </div>
        <strong style={{ padding: '9px 12px', borderRadius: 10, background: blocked ? '#fee2e2' : '#dcfce7', color: blocked ? '#991b1b' : '#166534' }}>
          {blocked ? `🔒 ${summary.pending + summary.anomalies} contrôle(s) à résoudre` : '✓ Prêt au verrouillage'}
        </strong>
      </div>
    </section>
  );
}
