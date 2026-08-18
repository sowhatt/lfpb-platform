# LFPB Platform

Plateforme SaaS de gestion de la Ligue de Football Professionnel du Bénin : Ligue 1 et Ligue 2, 22 clubs, arbitres et officiels.

## Socle Sprint 0

- `apps/web` : portail Next.js/PWA.
- `apps/api` : API NestJS versionnée.
- PostgreSQL : données métier.
- Redis : cache et traitements asynchrones.
- Docker Compose : services locaux.
- GitHub Actions : compilation et tests.
- RKJO-AI Platform : future assistance à la planification des rencontres.

## Démarrage local

Prérequis : Node.js 22+, pnpm 10+ et Docker Desktop.

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm dev
```

- Web : http://localhost:3000
- API : http://localhost:3001/api/v1/health

## Commandes qualité

```bash
pnpm build
pnpm test
```

## Sécurité

Ne jamais committer le fichier `.env`. Les secrets de développement doivent être différents des secrets de production. L'isolation multi-club sera couverte par des tests automatiques dès le premier module IAM.
