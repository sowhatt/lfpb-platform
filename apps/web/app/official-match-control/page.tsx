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

type OfficialMatchRole =
  | 'REFEREE'
  | 'ASSISTANT_REFEREE_1'
  | 'ASSISTANT_REFEREE_2'
  | 'FOURTH_OFFICIAL'
  | 'MATCH_COMMISSIONER'
  | 'DELEGATE';

type OfficialAssignment = {
  id: string;
  role: OfficialMatchRole;
  status: string;
  match: { id: string };
};

const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const OFFICIAL_ROLE_LABELS: Record<OfficialMatchRole, string> = {
  REFEREE: 'Arbitre central',
  ASSISTANT_REFEREE_1: 'Arbitre assistant 1',
  ASSISTANT_REFEREE_2: 'Arbitre assistant 2',
  FOURTH_OFFICIAL: 'Quatrième officiel',
  MATCH_COMMISSIONER: 'Commissaire au match',
  DELEGATE: 'Délégué',
};

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
  const [assignmentRole, setAssignmentRole] =
    useState<OfficialMatchRole | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignmentError, setAssignmentError] = useState('');

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

  useEffect(() => {
    if (!ready || !token || !matchId || sessionExpired) {
      return;
    }

    setAssignmentLoading(true);
    setAssignmentError('');

    fetch(
      `${API}/official-assignments?matchId=${encodeURIComponent(matchId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => []);

        if (!response.ok) {
          const message =
            typeof payload?.message === 'string'
              ? payload.message
              : `Erreur ${response.status}`;
          throw new Error(message);
        }

        const assignments = Array.isArray(payload)
          ? (payload as OfficialAssignment[])
          : [];

        const accepted = assignments.find(
          (assignment) =>
            assignment.status === 'ACCEPTED' &&
            assignment.match?.id === matchId,
        );

        if (!accepted) {
          throw new Error(
            'Aucune désignation acceptée ne correspond à cette rencontre.',
          );
        }

        setAssignmentRole(accepted.role);
      })
      .catch((reason) => {
        setAssignmentRole(null);
        setAssignmentError(
          reason instanceof Error
            ? reason.message
            : 'Impossible de déterminer votre rôle sur cette rencontre.',
        );
      })
      .finally(() => setAssignmentLoading(false));
  }, [ready, token, matchId, sessionExpired]);

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

  if (assignmentLoading) {
    return (
      <SessionScreen
        title="Préparation de la mission"
        message="Digital Foot vérifie votre désignation et vos droits sur cette rencontre."
      />
    );
  }

  if (assignmentError || !assignmentRole) {
    return (
      <SessionScreen
        title="Mission non accessible"
        message={
          assignmentError ||
          'Aucune désignation acceptée ne correspond à cette rencontre.'
        }
      />
    );
  }

  const assignmentLabel = OFFICIAL_ROLE_LABELS[assignmentRole];

  return (
    <main className="portal-page portal-page-wide official-match-page">
      <header className="workspace-actions portal-hero official-match-header">
        <div>
          <label>LFPB · PORTAIL OFFICIEL</label>
          <h1>Match connecté</h1>
          <p>
            Votre mission : <strong>{assignmentLabel}</strong>. Les outils affichés
            sont adaptés à votre désignation.
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
        <OfficialLiveMatchControl
          token={token}
          matchId={matchId}
          assignmentRole={assignmentRole}
        />
        {assignmentRole === 'REFEREE' && (
          <OfficialPreMatchGate token={token} matchId={matchId} />
        )}
        {assignmentRole === 'REFEREE' && (
          <OfficialMatchPlayerControlGpt token={token} matchId={matchId} />
        )}
        <OfficialPostMatchReport token={token} matchId={matchId} />

        {assignmentRole === 'REFEREE' && (
        <MatchSheetSignaturesPanel
          token={token}
          matchId={matchId}
          memberships={actor.memberships}
        />
        )}
      </section>
    </main>
  );
}
