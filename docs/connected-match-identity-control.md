# Connected Match — contrôle d’identité joueur

## Objectif

Permettre à un officiel désigné sur une rencontre de vérifier l’identité d’un joueur sur le terrain sans lui exposer l’ensemble du dossier administratif du joueur.

## Accès

L’accès est strictement limité aux officiels disposant d’une désignation ACCEPTED sur la rencontre concernée. L’officiel ne peut consulter que les joueurs des deux clubs engagés sur cette rencontre.

Données visibles : photo officielle, nom, prénom, date de naissance, identifiant fédéral, club, numéro de maillot, poste, statut d’inscription, numéro/statut de licence et indicateur d’éligibilité à contrôler.

Données non exposées : copie de passeport/pièce d’identité, certificat médical, assurance, contrat, autorisation parentale et autres pièces GED.

## Photo du jour

Le module Connected Match devra permettre depuis l’application compagnon mobile :

1. ouvrir la rencontre assignée ;
2. rechercher le joueur par nom, texte ou voix ;
3. afficher sa photo officielle et ses informations de contrôle ;
4. prendre une photo du joueur présent au match ;
5. afficher côte à côte photo officielle et photo du jour ;
6. permettre une décision humaine : identité confirmée / doute / non conforme ;
7. horodater et auditer le contrôle.

La photo du jour ne remplace jamais automatiquement la photo officielle. Toute modification de la photo officielle passe par le workflow de gouvernance prévu pour le club/LFPB.

## IA

Une version ultérieure pourra calculer un score de similarité entre photo officielle et photo du jour. Ce score est une aide à la décision. Il ne valide ni ne refuse automatiquement l’identité d’un joueur.

Principe : IA propose → humain valide → système trace.

## Montre connectée

La montre est un terminal Connected Match léger : chrono, score, cartons, remplacements et alertes. Les opérations nécessitant une photo ou une vérification visuelle détaillée restent sur l’application compagnon mobile. La montre ne communique jamais directement avec la base de données : Montre → compagnon mobile → API LFPB → MatchEvent / journal d’audit.
