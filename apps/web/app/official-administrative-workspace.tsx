'use client';

import { OfficialLiveMatchControl } from './official-live-match-control';
import { OfficialPostMatchReport } from './official-post-match-report';

type AdministrativeRole =
  | 'MATCH_COMMISSIONER'
  | 'DELEGATE';

const COPY: Record<
  AdministrativeRole,
  {
    label: string;
    chip: string;
    title: string;
    description: string;
    cards: Array<{ title: string; text: string }>;
  }
> = {
  MATCH_COMMISSIONER: {
    label: 'Commissaire au match',
    chip: 'COMMISSAIRE',
    title: 'Organisation et supervision de la rencontre',
    description:
      'Contrôlez les éléments d’organisation, suivez les faits de la rencontre et consignez les incidents ou observations relevant de votre mission.',
    cards: [
      {
        title: 'Organisation',
        text: 'Suivre les conditions générales de déroulement de la rencontre.',
      },
      {
        title: 'Présences',
        text: 'Consulter les équipes, officiels et éléments disponibles sur la feuille.',
      },
      {
        title: 'Incidents',
        text: 'Documenter tout incident organisationnel nécessitant une trace officielle.',
      },
      {
        title: 'Rapport',
        text: 'Consulter et compléter les éléments utiles au rapport après-match.',
      },
    ],
  },
  DELEGATE: {
    label: 'Délégué',
    chip: 'DÉLÉGUÉ',
    title: 'Conformité, protocole et suivi administratif',
    description:
      'Suivez la conformité administrative et protocolaire de la rencontre et consignez les faits relevant de votre mission de délégation.',
    cards: [
      {
        title: 'Conformité',
        text: 'Vérifier les éléments administratifs et protocolaires accessibles.',
      },
      {
        title: 'Protocole',
        text: 'Suivre le respect des consignes et du cadre de la rencontre.',
      },
      {
        title: 'Observations',
        text: 'Consigner une observation administrative ou organisationnelle.',
      },
      {
        title: 'Rapport',
        text: 'Retrouver les faits enregistrés et le rapport après la rencontre.',
      },
    ],
  },
};

export function OfficialAdministrativeWorkspace({
  token,
  matchId,
  assignmentRole,
}: {
  token: string;
  matchId: string;
  assignmentRole: AdministrativeRole;
}) {
  const copy = COPY[assignmentRole];

  return (
    <div className="administrative-official-workspace">
      <section className="administrative-official-hero">
        <div>
          <label>MATCH DU JOUR · {copy.label.toUpperCase()}</label>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>

        <span className="administrative-official-role-chip">
          {copy.chip}
        </span>
      </section>

      <section className="administrative-official-scope">
        {copy.cards.map((card, index) => (
          <article key={card.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{card.title}</strong>
              <small>{card.text}</small>
            </div>
          </article>
        ))}
      </section>

      <div className="administrative-official-boundary">
        <strong>Vos autorisations pour cette rencontre</strong>
        <div>
          <span>✓ Observation</span>
          <span>✓ Incident</span>
          <span>✓ Consultation de la feuille</span>
          <span>✓ Rapport après-match</span>
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
