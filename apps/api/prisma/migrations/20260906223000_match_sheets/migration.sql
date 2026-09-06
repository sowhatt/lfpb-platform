-- CreateEnum
CREATE TYPE "MatchSheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LOCKED');

-- CreateEnum
CREATE TYPE "MatchSheetSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "MatchSheetPlayerRole" AS ENUM ('STARTER', 'SUBSTITUTE');

-- CreateEnum
CREATE TYPE "MatchEligibilityStatus" AS ENUM ('ELIGIBLE', 'INELIGIBLE');

-- CreateTable
CREATE TABLE "MatchSheet" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "status" "MatchSheetStatus" NOT NULL DEFAULT 'DRAFT',
    "homeSubmittedAt" TIMESTAMP(3),
    "awaySubmittedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MatchSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSheetPlayer" (
    "id" UUID NOT NULL,
    "matchSheetId" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "side" "MatchSheetSide" NOT NULL,
    "role" "MatchSheetPlayerRole" NOT NULL,
    "shirtNumber" INTEGER NOT NULL,
    "eligibilityStatus" "MatchEligibilityStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "eligibilityReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MatchSheetPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchSheet_matchId_key" ON "MatchSheet"("matchId");
CREATE INDEX "MatchSheet_status_updatedAt_idx" ON "MatchSheet"("status", "updatedAt");
CREATE UNIQUE INDEX "MatchSheetPlayer_matchSheetId_registrationId_key" ON "MatchSheetPlayer"("matchSheetId", "registrationId");
CREATE UNIQUE INDEX "MatchSheetPlayer_matchSheetId_clubId_shirtNumber_key" ON "MatchSheetPlayer"("matchSheetId", "clubId", "shirtNumber");
CREATE INDEX "MatchSheetPlayer_matchSheetId_clubId_role_idx" ON "MatchSheetPlayer"("matchSheetId", "clubId", "role");

-- AddForeignKey
ALTER TABLE "MatchSheet" ADD CONSTRAINT "MatchSheet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchSheetPlayer" ADD CONSTRAINT "MatchSheetPlayer_matchSheetId_fkey" FOREIGN KEY ("matchSheetId") REFERENCES "MatchSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchSheetPlayer" ADD CONSTRAINT "MatchSheetPlayer_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchSheetPlayer" ADD CONSTRAINT "MatchSheetPlayer_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
