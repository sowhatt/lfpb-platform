'use client';

import { OfficialLiveMatchControl } from './official-live-match-control';
import { OfficialPostMatchReport } from './official-post-match-report';

type AssistantRole =
  | 'ASSISTANT_REFEREE_1'
  | 'ASSISTANT_REFEREE_2';

const LABELS: Record<AssistantRole, string> = {
  ASSISTANT_REFEREE_1: 'Arbitre assistant 1',
  ASSISTANT_REFEREE_2: 'Arbitre assistant 2',
};

export function OfficialAssistantRefereeWorkspace({
  token,
  matchId,
  assignmentRole,
}: {
  token: string;
  matchId: string;
  assignmentRole: AssistantRole;
}) {
  const label = LABELS[assignmentRole];

  return (
    <div className="assistant-referee-workspace">
      <section className="assistant-referee-hero">
        <div>
          <label>MATCH DU JOUR · {label.toUpperCase()}</label>
          <h2>Observations terrain et assistance à l’arbitre central</h2>
          <p>
            Cet espace vous permet de suivre la rencontre, consulter
            la feuille de match et consigner uniquement les faits relevant
            de votre mission d’arbitre assistant.
          </p>
        </div>

        <span className="assistant-referee-role-chip">
          {assignmentRole === 'ASSISTANT_REFEREE_1'
            ? 'ASSISTANT 1'
            : 'ASSISTANT 2'}
        </span>
      </section>

      <section className="assistant-referee-scope">
        <article>
          <span>01</span>
          <div>
            <strong>Composition</strong>
            <small>
              Consulter les joueurs et numéros présents sur la feuille officielle.
            </small>
          </div>
        </article>

        <article>
          <span>02</span>
          <div>
            <strong>Observation terrain</strong>
            <small>
              Documenter un fait relevant de votre zone ou de votre mission.
            </small>
          </div>
        </article>

        <article>
          <span>03</span>
          <div>
            <strong>Incident</strong>
            <small>
              Signaler un événement nécessitant une trace officielle.
            </small>
          </div>
        </article>

        <article>
          <span>04</span>
          <div>
            <strong>Rapport</strong>
            <small>
              Consulter le rapport et les faits enregistrés après la rencontre.
            </small>
          </div>
        </article>
      </section>

      <div className="assistant-referee-boundary">
        <strong>Vos autorisations pour cette rencontre</strong>
        <div>
          <span>✓ Observation</span>
          <span>✓ Incident</span>
          <span>✓ Consultation composition</span>
          <span className="blocked">✕ Remplacement</span>
          <span className="blocked">✕ But</span>
          <span className="blocked">✕ Carton</span>
          <span className="blocked">✕ Chrono central</span>
          <span className="blocked">✕ Certification finale</span>
        </div>
      </div>

      <OfficialLiveMatchControl
        token={token}
        matchId={matchId}
        assignmentRole={assignmentRole}
      />

      <OfficialPostMatchReport
        token={token}
        matchId={matchId}
      />
    </div>
  );
}
