'use client';

import { OfficialLiveMatchControl } from './official-live-match-control';
import { OfficialPostMatchReport } from './official-post-match-report';

export function OfficialFourthOfficialWorkspace({
  token,
  matchId,
}: {
  token: string;
  matchId: string;
}) {
  return (
    <div className="fourth-official-workspace">
      <section className="fourth-official-hero">
        <div>
          <label>MATCH DU JOUR · QUATRIÈME OFFICIEL</label>
          <h2>Gestion des bancs et remplacements</h2>
          <p>
            Votre espace est limité aux missions du quatrième officiel.
            Le chronométrage central, les buts, cartons et la clôture du match
            restent sous la responsabilité de l’arbitre central.
          </p>
        </div>

        <span className="fourth-official-role-chip">
          4e OFFICIEL
        </span>
      </section>

      <section className="fourth-official-scope">
        <article>
          <span>01</span>
          <div>
            <strong>Remplacements</strong>
            <small>
              Contrôler le joueur sortant, l’entrant et enregistrer le changement.
            </small>
          </div>
        </article>

        <article>
          <span>02</span>
          <div>
            <strong>Bancs de touche</strong>
            <small>
              Suivre les compositions et identifier les joueurs disponibles.
            </small>
          </div>
        </article>

        <article>
          <span>03</span>
          <div>
            <strong>Incidents</strong>
            <small>
              Documenter un fait intervenu autour des bancs ou de la zone technique.
            </small>
          </div>
        </article>

        <article>
          <span>04</span>
          <div>
            <strong>Observations</strong>
            <small>
              Ajouter une observation officielle liée à votre mission.
            </small>
          </div>
        </article>
      </section>

      <div className="fourth-official-boundary">
        <strong>Vos autorisations pour cette rencontre</strong>
        <div>
          <span>✓ Remplacement</span>
          <span>✓ Incident</span>
          <span>✓ Observation</span>
          <span className="blocked">✕ But</span>
          <span className="blocked">✕ Carton</span>
          <span className="blocked">✕ Coup d’envoi / fin</span>
          <span className="blocked">✕ Certification finale</span>
        </div>
      </div>

      <OfficialLiveMatchControl
        token={token}
        matchId={matchId}
        assignmentRole="FOURTH_OFFICIAL"
      />

      <OfficialPostMatchReport
        token={token}
        matchId={matchId}
      />
    </div>
  );
}
