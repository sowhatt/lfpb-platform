-- CreateEnum
CREATE TYPE "ScheduleProposalStatus" AS ENUM ('GENERATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "ScheduleProposal" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScheduleProposalStatus" NOT NULL DEFAULT 'GENERATED',
    "generatedBy" TEXT NOT NULL,
    "generatedByUserId" UUID NOT NULL,
    "qualityScore" INTEGER NOT NULL,
    "qualityReport" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" UUID,
    "rejectionReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleProposal_competitionId_status_createdAt_idx" ON "ScheduleProposal"("competitionId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleProposal_competitionId_version_key" ON "ScheduleProposal"("competitionId", "version");

-- AddForeignKey
ALTER TABLE "ScheduleProposal" ADD CONSTRAINT "ScheduleProposal_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleProposal" ADD CONSTRAINT "ScheduleProposal_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleProposal" ADD CONSTRAINT "ScheduleProposal_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
