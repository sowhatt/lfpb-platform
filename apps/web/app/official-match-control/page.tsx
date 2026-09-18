'use client';

import { useEffect, useState } from 'react';
import { MatchSheetSignaturesPanel } from '../match-sheet-signatures-panel';
import { OfficialLiveMatchControl } from '../official-live-match-control';
import { OfficialMatchPlayerControlGpt } from '../official-match-player-control-gpt';
import { OfficialPostMatchReport } from '../official-post-match-report';
import { OfficialPreMatchGate } from '../official-pre-match-gate';

type Actor = {
  email: string;
  memberships: Array<{ organizationId: string; role: string }>;
};

type JwtPayload = { exp?: number };

function tokenIsExpired(token: string) {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return false;

    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      '=',
    );

    const payload = JSON.parse(atob(padded)) as JwtPayload;

    return (
      typeof payload.exp === 'number' &&
      payload.exp * 1000 <= Date.now()
    );
  } catch {
    return false;
  }
}

function goHome() {
  sessionStorage.removeItem('lfpb-token');
  sessionStorage.removeItem('lfpb-actor');
  window.location.assign('/');
}

function SessionScreen({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="portal-page official-match-page official-session-page">
      <section className="portal-access-card data-panel official-session-card">
        <label className="portal-eyebrow">LFPB · PORTAIL OFFICIEL</label>
        <h1>{title}</h1>
        <p>{message}</p>

        <button
          type="button"
          className="portal-action-button"
          onClick={goHome}
        >
          ← Retour à l’accueil
        </button>
      </section>
    </main>
  );
}

export default function OfficialMatchControlPage() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [actor, setActor] = useState<Actor | null>(null);
  const [matchId, setMatchId] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('lfpb-token') ?? '';
    const raw = sessionStorage.getItem('lfpb-actor');
    const params = new URLSearchParams(window.location.search);

    setToken(savedToken);
    setMatchId(params.get('matchId') ?? '');
    setSessionExpired(
      Boolean(savedToken) && tokenIsExpired(savedToken),
    );

    if (raw) {
      try {
        setActor(JSON.parse(raw) as Actor);
      } catch {
        setActor(null);
      }
    }

    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="portal-page official-match-page">
        <section className="data-panel portal-loading-card">
          <p>Chargement du portail officiel…</p>
        </section>
      </main>
    );
  }

  if (sessionExpired) {
    return (
      <SessionScreen
        title="Session expirée"
        message="Votre session de sécurité est arrivée à expiration. Revenez à l’accueil pour vous reconnecter avant de reprendre le match."
      />
    );
  }

  const role = actor?.memberships.find(
    (membership) => membership.role === 'OFFICIEL',
  )?.role;

  if (!token || !actor) {
    return (
      <SessionScreen
        title="Connexion requise"
        message="Connectez-vous à votre espace officiel pour accéder au match connecté."
      />
    );
  }

  if (role !== 'OFFICIEL') {
    return (
      <SessionScreen
        title="Accès réservé"
        message="Cette vue est réservée aux officiels désignés sur une rencontre."
      />
    );
  }

  if (!matchId) {
    return (
      <SessionScreen
        title="Aucune rencontre sélectionnée"
        message="Revenez à l’accueil, puis ouvrez « Mes rencontres » pour sélectionner une mission acceptée."
      />
    );
  }

  return (
    <main className="portal-page portal-page-wide official-match-page">
      <header className="workspace-actions portal-hero official-match-header">
        <div>
          <label>LFPB · PORTAIL OFFICIEL</label>
          <h1>Match connecté</h1>
          <p>
            Contrôle terrain, événements de match, rapport officiel et signatures.
          </p>
        </div>

        <div className="portal-hero-actions">
          <span className="portal-user-chip">{actor.email}</span>

          <button
            type="button"
            className="portal-back-button"
            onClick={() => window.location.assign('/')}
          >
            ← Retour
          </button>
        </div>
      </header>

      <section className="official-match-flow portal-content">
        <OfficialLiveMatchControl token={token} matchId={matchId} />
        <OfficialPreMatchGate token={token} matchId={matchId} />
        <OfficialMatchPlayerControlGpt token={token} matchId={matchId} />
        <OfficialPostMatchReport token={token} matchId={matchId} />

        <MatchSheetSignaturesPanel
          token={token}
          matchId={matchId}
          memberships={actor.memberships}
        />
      </section>
    </main>
  );
}
