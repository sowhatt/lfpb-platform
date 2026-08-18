# Architecture Sprint 0

## Principes

- SaaS multi-tenant piloté par la LFPB.
- Un club ne peut jamais consulter les données d'un autre club.
- Les officiels accèdent uniquement aux rencontres auxquelles ils sont désignés.
- La feuille de match signée devient la source officielle.
- Les parcours jour de match seront conçus offline-first.
- Les fonctions IA RKJO restent explicables et soumises à validation humaine.

## Structure cible

- `apps/web` : portail PWA Next.js.
- `apps/api` : API métier NestJS.
- PostgreSQL : référentiels et transactions.
- Redis : cache, limitation et travaux asynchrones.
- Stockage objet : documents et feuilles de match.
- RKJO-AI Platform : planification assistée et détection d'anomalies.

## Prochain incrément

IAM, organisations, rôles et isolation multi-club.
