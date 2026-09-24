'use client';

import { useState } from 'react';

import { OfficialLiveMatchControl } from './official-live-match-control';
import { OfficialPreMatchGate } from './official-pre-match-gate';
import { OfficialMatchPlayerControlGpt } from './official-match-player-control-gpt';
import { OfficialPostMatchReport } from './official-post-match-report';
import { MatchSheetSignaturesPanel } from './match-sheet-signatures-panel';

type Membership = {
  organizationId: string;
  role: string;
};

export function OfficialRefereeWorkspace({
  token,
  matchId,
  memberships,
}: {
  token: string;
  matchId: string;
  memberships: Membership[];
}) {
  const [matchRevision, setMatchRevision] = useState(0);

  return (
    <div className="referee-workspace">
      <section className="referee-hero">
        <div>
          <label>MATCH DU JOUR · ARBITRE CENTRAL</label>
          <h2>Pilotage complet de la rencontre</h2>
          <p>
            Préparez la rencontre, contrôlez les joueurs, validez la feuille,
            dirigez le match connecté puis certifiez le rapport officiel.
          </p>
        </div>

        <span className="referee-role-chip">
          ARBITRE CENTRAL
        </span>
      </section>

      <section className="referee-steps">
        <article>
          <span>01</span>
          <div>
            <strong>Avant-match</strong>
            <small>
              Vérifier que la feuille et les conditions nécessaires sont prêtes.
            </small>
          </div>
        </article>

        <article>
          <span>02</span>
          <div>
            <strong>Contrôle joueurs</strong>
            <small>
              Contrôler identité, licence et conformité des joueurs présents.
            </small>
          </div>
        </article>

        <article>
          <span>03</span>
          <div>
            <strong>Validation feuille</strong>
            <small>
              Valider puis verrouiller la feuille officielle avant le match.
            </small>
          </div>
        </article>

        <article>
          <span>04</span>
          <div>
            <strong>Match connecté</strong>
            <small>
              Gérer chrono, buts, cartons, remplacements et incidents.
            </small>
          </div>
        </article>

        <article>
          <span>05</span>
          <div>
            <strong>Après-match</strong>
            <small>
              Contrôler les faits, observations et éléments du rapport.
            </small>
          </div>
        </article>

        <article>
          <span>06</span>
          <div>
            <strong>Certification</strong>
            <small>
              Signer après les représentants des clubs et clôturer officiellement.
            </small>
          </div>
        </article>
      </section>

      <div className="referee-authority">
        <strong>Responsabilités de l’arbitre central</strong>
        <div>
          <span>✓ Contrôle joueurs</span>
          <span>✓ Validation feuille</span>
          <span>✓ Verrouillage feuille</span>
          <span>✓ Coup d’envoi</span>
          <span>✓ Chrono officiel</span>
          <span>✓ Buts</span>
          <span>✓ Cartons</span>
          <span>✓ Remplacements</span>
          <span>✓ Incidents</span>
          <span>✓ Observations</span>
          <span>✓ Fin du match</span>
          <span>✓ Certification finale</span>
        </div>
      </div>

      <section className="referee-stage">
        <div className="referee-stage-title">
          <span>ÉTAPE 1</span>
          <div>
            <strong>Préparation avant-match</strong>
            <small>Conditions préalables à l’ouverture de la rencontre.</small>
          </div>
        </div>

        <OfficialPreMatchGate
          token={token}
          matchId={matchId}
        />
      </section>

      <section className="referee-stage">
        <div className="referee-stage-title">
          <span>ÉTAPE 2</span>
          <div>
            <strong>Contrôle terrain des joueurs</strong>
            <small>
              Vérification des joueurs avant validation définitive de la feuille.
            </small>
          </div>
        </div>

        <OfficialMatchPlayerControlGpt
          token={token}
          matchId={matchId}
        />
      </section>

      <section className="referee-stage">
        <div className="referee-stage-title">
          <span>ÉTAPES 3 & 4</span>
          <div>
            <strong>Feuille officielle et match connecté</strong>
            <small>
              Validation, verrouillage, chrono et événements de la rencontre.
            </small>
          </div>
        </div>

        <OfficialLiveMatchControl
          token={token}
          matchId={matchId}
          assignmentRole="REFEREE"
            onMatchUpdated={() => setMatchRevision((value) => value + 1)}
        />
      </section>

      <section className="referee-stage">
        <div className="referee-stage-title">
          <span>ÉTAPE 5</span>
          <div>
            <strong>Rapport après-match</strong>
            <small>
              Vérifiez le résultat, les événements et les informations du rapport.
            </small>
          </div>
        </div>

        <OfficialPostMatchReport
          token={token}
          matchId={matchId}
            refreshKey={matchRevision}
        />
      </section>

      <section className="referee-stage referee-stage-final">
        <div className="referee-stage-title">
          <span>ÉTAPE 6</span>
          <div>
            <strong>Signatures et clôture officielle</strong>
            <small>
              La certification finale intervient après les signatures des deux clubs.
            </small>
          </div>
        </div>

        <MatchSheetSignaturesPanel
          token={token}
          matchId={matchId}
          memberships={memberships}
            refreshKey={matchRevision}
        />
      </section>
    </div>
  );
}
