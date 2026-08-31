# Circuit des dossiers de licence joueur

## Principe d'autorité

La plateforme LFPB prépare, contrôle et transmet les dossiers des clubs. Elle ne délivre pas la
licence sportive. La décision de délivrance, de refus, de suspension ou d'annulation appartient à la
Fédération Béninoise de Football (FBF).

L'homologation d'un contrat professionnel par la LFPB et la délivrance d'une licence sportive par la
FBF sont deux procédures distinctes.

## Workflow

1. Le club crée le dossier en statut `DRAFT`.
2. Le club le soumet à la LFPB : `SUBMITTED_TO_LEAGUE`.
3. La LFPB effectue le contrôle administratif :
   - `INCOMPLETE` avec la liste obligatoire des compléments ; ou
   - `LEAGUE_FAVORABLE` si le dossier est recevable.
4. La LFPB transmet le dossier recevable : `TRANSMITTED_TO_FBF`.
5. La FBF prend la décision finale :
   - `ISSUED_BY_FBF`, avec un numéro officiel de licence ; ou
   - `REJECTED_BY_FBF`, avec un motif obligatoire.
6. Une licence délivrée peut ensuite devenir `SUSPENDED`, `CANCELLED` ou `EXPIRED`.

Une ancienne décision `APPROVED` prise par la LFPB est migrée vers `LEAGUE_FAVORABLE`. Elle n'est
jamais convertie automatiquement en licence fédérale.

## Autorisations API

| Opération | Route | Rôle |
| --- | --- | --- |
| Créer un dossier | `POST /api/v1/licenses` | `CLUB_ADMIN`, `LIGUE_ADMIN` |
| Soumettre ou resoumettre | `PATCH /api/v1/licenses/:id/submit` | `CLUB_ADMIN`, `LIGUE_ADMIN` |
| Avis ou demande de complément | `PATCH /api/v1/licenses/:id/league-review` | `LIGUE_ADMIN` |
| Transmission à la FBF | `PATCH /api/v1/licenses/:id/transmit-fbf` | `LIGUE_ADMIN` |
| Décision de délivrance ou refus | `PATCH /api/v1/licenses/:id/federation-decision` | `FEDERATION_AGENT` |
| Suspension | `PATCH /api/v1/licenses/:id/suspend` | `FEDERATION_AGENT` |
| Annulation | `PATCH /api/v1/licenses/:id/cancel` | `FEDERATION_AGENT` |

Toutes les transitions sont journalisées dans `AuditLog`. Le numéro de licence reste vide avant une
délivrance formelle par la FBF.

## Scénarios de non-régression prioritaires

1. Un club ne peut pas délivrer une licence.
2. Un administrateur LFPB ne peut pas passer directement un dossier à `ISSUED_BY_FBF`.
3. Un dossier incomplet exige un motif et peut être corrigé puis resoumis par le club.
4. Un dossier ne peut être transmis à la FBF sans avis favorable LFPB.
5. La délivrance FBF exige un numéro officiel.
6. Le refus FBF exige un motif.
7. Un agent FBF peut consulter les dossiers de tous les clubs, mais un club ne voit que les siens.
8. Une licence expirée ou annulée ne peut pas être réactivée par une transition ordinaire.
