-- Digital Foot / LFPB
-- Vie du club + parcours sportif saisonnier.
--
-- IMPORTANT:
-- Migration conçue pour être appliquée de manière contrôlée.
-- Elle ne reconstruit pas artificiellement l'historique antérieur des clubs.

CREATE TYPE "ClubSeasonOutcome" AS ENUM (
  'PROMOTED',
  'RELEGATED',
  'MAINTAINED',
  'WITHDRAWN',
  'EXCLUDED'
);

CREATE TYPE "ClubHistoryEventType" AS ENUM (
  'CREATED',
  'RENAMED',
  'SHORT_NAME_CHANGED',
  'CODE_CHANGED',
  'CITY_CHANGED',
  'COLORS_CHANGED',
  'ACTIVATED',
  'DEACTIVATED',
  'MERGED',
  'CEASED_ACTIVITY',
  'RESUMED_ACTIVITY',
  'OTHER'
);

CREATE TABLE "ClubSeason" (
  "id" UUID NOT NULL,
  "clubId" UUID NOT NULL,
  "seasonId" UUID NOT NULL,
  "division" "Division" NOT NULL,
  "finalRank" INTEGER,
  "outcome" "ClubSeasonOutcome",
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClubSeason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClubHistoryEvent" (
  "id" UUID NOT NULL,
  "clubId" UUID NOT NULL,
  "type" "ClubHistoryEventType" NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "previousValue" TEXT,
  "newValue" TEXT,
  "reason" TEXT,
  "actorUserId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClubHistoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubSeason_clubId_seasonId_key"
ON "ClubSeason"("clubId", "seasonId");

CREATE INDEX "ClubSeason_seasonId_division_idx"
ON "ClubSeason"("seasonId", "division");

CREATE INDEX "ClubSeason_clubId_seasonId_idx"
ON "ClubSeason"("clubId", "seasonId");

CREATE INDEX "ClubHistoryEvent_clubId_effectiveDate_idx"
ON "ClubHistoryEvent"("clubId", "effectiveDate");

CREATE INDEX "ClubHistoryEvent_actorUserId_createdAt_idx"
ON "ClubHistoryEvent"("actorUserId", "createdAt");

CREATE INDEX "ClubHistoryEvent_clubId_type_idx"
ON "ClubHistoryEvent"("clubId", "type");

ALTER TABLE "ClubSeason"
ADD CONSTRAINT "ClubSeason_clubId_fkey"
FOREIGN KEY ("clubId")
REFERENCES "Club"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "ClubSeason"
ADD CONSTRAINT "ClubSeason_seasonId_fkey"
FOREIGN KEY ("seasonId")
REFERENCES "Season"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "ClubHistoryEvent"
ADD CONSTRAINT "ClubHistoryEvent_clubId_fkey"
FOREIGN KEY ("clubId")
REFERENCES "Club"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "ClubHistoryEvent"
ADD CONSTRAINT "ClubHistoryEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Backfill strictement limité à la vraie saison LFPB connue.
-- Aucune montée, descente ou position finale n'est inventée.

INSERT INTO "ClubSeason" (
  "id",
  "clubId",
  "seasonId",
  "division",
  "finalRank",
  "outcome",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  c."id",
  s."id",
  c."division",
  NULL,
  NULL,
  'Initialisation depuis la division courante lors de la mise en place de l''historique saisonnier',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Club" c
CROSS JOIN "Season" s
WHERE s."name" = '2026-2027'
  AND NOT EXISTS (
    SELECT 1
    FROM "ClubSeason" cs
    WHERE cs."clubId" = c."id"
      AND cs."seasonId" = s."id"
  );

-- Historique initial des clubs déjà existants.
-- Il s'agit d'une initialisation technique et non d'une affirmation
-- sur leur véritable date historique de fondation.

INSERT INTO "ClubHistoryEvent" (
  "id",
  "clubId",
  "type",
  "effectiveDate",
  "title",
  "newValue",
  "reason",
  "metadata",
  "createdAt"
)
SELECT
  gen_random_uuid(),
  c."id",
  'CREATED'::"ClubHistoryEventType",
  c."createdAt"::date,
  'Initialisation du club dans Digital Foot',
  o."name",
  'Historique initial généré lors de l''activation du module Vie du club',
  jsonb_build_object(
    'organizationId', o."id",
    'code', o."code",
    'shortName', c."shortName",
    'division', c."division",
    'city', c."city",
    'backfill', true
  ),
  CURRENT_TIMESTAMP
FROM "Club" c
JOIN "Organization" o
  ON o."id" = c."organizationId"
WHERE NOT EXISTS (
  SELECT 1
  FROM "ClubHistoryEvent" h
  WHERE h."clubId" = c."id"
);
