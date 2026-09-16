'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Membership = { organizationId: string; role: string };
type SignatureRole = 'HOME_REPRESENTATIVE' | 'AWAY_REPRESENTATIVE' | 'OFFICIAL';
type Signature = {
  id: string;
  role: SignatureRole;
  signerName?: string;
  signerFunction?: string | null;
  signedAt?: string;
  sheetFingerprint?: string;
};
type Summary = {
  sheetStatus: string;
  homeClub: { organizationId: string; name: string };
  awayClub: { organizationId: string; name: string };
  signatures: Signature[];
  homeSigned: boolean;
  awaySigned: boolean;
  officialSigned: boolean;
  matchStatus?: string;
  readyForSignatures?: boolean;
  signaturesConsistent?: boolean;
  currentReportFingerprint?: string | null;
};

type Props = { token: string; matchId: string; memberships: Membership[] };

function messageOf(payload: unknown, fallback: string) {
  const raw = (payload as { message?: string | string[] } | null)?.message;
  return Array.isArray(raw) ? raw.join(' · ') : raw ?? fallback;
}

export function MatchSheetSignaturesPanel({ token, matchId, memberships }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [name, setName] = useState('');
  const [fn, setFn] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`${API}/matches/${matchId}/sheet/signatures`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(messageOf(payload, `Erreur ${response.status}`));
    setSummary(payload as Summary);
  }, [matchId, token]);

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Signatures indisponibles'));
  }, [load]);

  const allowedRole = useMemo<SignatureRole | null>(() => {
    if (!summary) return null;
    const home = memberships.some((m) => m.role === 'CLUB_ADMIN' && m.organizationId === summary.homeClub.organizationId);
    const away = memberships.some((m) => m.role === 'CLUB_ADMIN' && m.organizationId === summary.awayClub.organizationId);
    const official = memberships.some((m) => m.role === 'OFFICIEL' || m.role === 'LIGUE_ADMIN');
    if (home && !summary.homeSigned) return 'HOME_REPRESENTATIVE';
    if (away && !summary.awaySigned) return 'AWAY_REPRESENTATIVE';
    if (official && !summary.officialSigned) return 'OFFICIAL';
    return null;
  }, [memberships, summary]);

  async function sign() {
    if (!summary || !allowedRole || name.trim().length < 2) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API}/matches/${matchId}/sheet/signatures`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: allowedRole, signerName: name.trim(), signerFunction: fn.trim() || undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(messageOf(payload, `Erreur ${response.status}`));
      setName('');
      setFn('');
      setNotice('Signature enregistrée et horodatée.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible d’enregistrer la signature');
    } finally {
      setBusy(false);
    }
  }

  if (error && !summary) return <div className="api-error" style={{ marginTop: 20 }}>{error}</div>;
  if (!summary) return null;

  const bothClubsSigned = summary.homeSigned && summary.awaySigned;
  const final = summary.officialSigned;
  const cards: Array<{ role: SignatureRole; title: string; done: boolean }> = [
    { role: 'HOME_REPRESENTATIVE', title: `${summary.homeClub.name} · représentant`, done: summary.homeSigned },
    { role: 'AWAY_REPRESENTATIVE', title: `${summary.awayClub.name} · représentant`, done: summary.awaySigned },
    { role: 'OFFICIAL', title: 'Officiel de la rencontre', done: summary.officialSigned },
  ];

  return (
    <section className="data-panel" style={{ marginTop: 20, padding: 20 }}>
      <label>RAPPORT OFFICIEL · SIGNATURES</label>
      <h2 style={{ margin: '8px 0 6px' }}>{final ? 'Rapport certifié' : 'Circuit de signature'}</h2>
      <p style={{ marginTop: 0 }}>Les deux clubs signent d’abord. L’officiel certifie ensuite la même version du rapport final : feuille verrouillée, score et faits de match.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, margin: '18px 0' }}>
        {cards.map((card) => {
          const signature = summary.signatures.find((item) => item.role === card.role);
          const blocked = card.role === 'OFFICIAL' && !bothClubsSigned;
          return (
            <article key={card.role} style={{ border: '1px solid #d9e2ec', borderRadius: 14, padding: 16, background: card.done ? '#ecfdf3' : '#fff' }}>
              <strong>{card.done ? '✅ ' : blocked ? '🔒 ' : '⏳ '}{card.title}</strong>
              {signature ? (
                <div style={{ marginTop: 10, fontSize: 14 }}>
                  <div>{signature.signerName}{signature.signerFunction ? ` · ${signature.signerFunction}` : ''}</div>
                  <div>{signature.signedAt ? new Date(signature.signedAt).toLocaleString('fr-FR') : ''}</div>
                  <div style={{ marginTop: 6, opacity: .7 }}>Empreinte : {signature.sheetFingerprint?.slice(0, 12)}…</div>
                </div>
              ) : <p style={{ marginBottom: 0 }}>{blocked ? 'En attente des signatures des deux clubs.' : 'Signature en attente.'}</p>}
            </article>
          );
        })}
      </div>

      {summary.sheetStatus !== 'LOCKED' && <div className="api-error">La feuille doit être verrouillée avant toute signature.</div>}
      {summary.matchStatus && summary.matchStatus !== 'COMPLETED' && <div className="api-error">Le match doit être terminé avant de signer le rapport officiel.</div>}
      {summary.signatures.length > 0 && summary.signaturesConsistent === false && <div className="api-error">⚠️ Le rapport a changé depuis une signature précédente. Le circuit doit être réinitialisé avant certification.</div>}
      {notice && <p style={{ fontWeight: 700 }}>{notice}</p>}
      {error && <div className="api-error">{error}</div>}

      {allowedRole && summary.sheetStatus === 'LOCKED' && summary.matchStatus === 'COMPLETED' && summary.signaturesConsistent !== false && !(allowedRole === 'OFFICIAL' && !bothClubsSigned) && (
        <div style={{ display: 'grid', gap: 10, maxWidth: 560, marginTop: 16 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom et prénom du signataire" maxLength={120} />
          <input value={fn} onChange={(e) => setFn(e.target.value)} placeholder="Fonction (ex. Président, secrétaire, arbitre)" maxLength={120} />
          <button type="button" onClick={() => void sign()} disabled={busy || name.trim().length < 2}>
            {busy ? 'Signature en cours…' : '✍️ Signer le rapport officiel'}
          </button>
          <small>La signature enregistre le signataire, l’heure et l’empreinte SHA-256 du rapport complet : composition, score final et chronologie officielle.</small>
        </div>
      )}
    </section>
  );
}
