-- CreateEnum
CREATE TYPE "PlayerTransferStatus" AS ENUM ('DRAFT', 'REQUESTED', 'AGREED', 'OPPOSED', 'LEAGUE_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'EFFECTIVE');

-- CreateTable
CREATE TABLE "PlayerTransfer" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "sourceRegistrationId" UUID NOT NULL,
    "sourceOrganizationId" UUID NOT NULL,
    "targetOrganizationId" UUID NOT NULL,
    "targetRegistrationId" UUID,
    "status" "PlayerTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedAt" TIMESTAMP(3),
    "formerClubDecidedAt" TIMESTAMP(3),
    "leagueReviewedAt" TIMESTAMP(3),
    "leagueDecidedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "requestedStartDate" DATE NOT NULL,
    "seasonId" UUID NOT NULL,
    "reason" TEXT,
    "formerClubReason" TEXT,
    "leagueReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "formerClubDecidedByUserId" UUID,
    "leagueReviewedByUserId" UUID,
    "leagueDecidedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTransfer_targetRegistrationId_key" ON "PlayerTransfer"("targetRegistrationId");

-- CreateIndex
CREATE INDEX "PlayerTransfer_personId_status_idx" ON "PlayerTransfer"("personId", "status");

-- CreateIndex
CREATE INDEX "PlayerTransfer_seasonId_status_idx" ON "PlayerTransfer"("seasonId", "status");

-- CreateIndex
CREATE INDEX "PlayerTransfer_sourceOrganizationId_status_idx" ON "PlayerTransfer"("sourceOrganizationId", "status");

-- CreateIndex
CREATE INDEX "PlayerTransfer_targetOrganizationId_status_idx" ON "PlayerTransfer"("targetOrganizationId", "status");

-- CreateIndex
CREATE INDEX "PlayerTransfer_sourceRegistrationId_idx" ON "PlayerTransfer"("sourceRegistrationId");

-- CreateIndex
CREATE INDEX "PlayerTransfer_createdAt_idx" ON "PlayerTransfer"("createdAt");

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_sourceRegistrationId_fkey" FOREIGN KEY ("sourceRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_targetRegistrationId_fkey" FOREIGN KEY ("targetRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_sourceOrganizationId_fkey" FOREIGN KEY ("sourceOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_formerClubDecidedByUserId_fkey" FOREIGN KEY ("formerClubDecidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_leagueReviewedByUserId_fkey" FOREIGN KEY ("leagueReviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_leagueDecidedByUserId_fkey" FOREIGN KEY ("leagueDecidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Prevent concurrent open transfers for the same player.
CREATE UNIQUE INDEX "PlayerTransfer_one_open_transfer_per_person_key"
ON "PlayerTransfer"("personId")
WHERE "status" IN (
  'DRAFT',
  'REQUESTED',
  'AGREED',
  'OPPOSED',
  'LEAGUE_REVIEW',
  'APPROVED'
);
