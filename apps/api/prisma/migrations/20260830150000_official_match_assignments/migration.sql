CREATE TYPE "MatchOfficialRole" AS ENUM ('REFEREE', 'ASSISTANT_REFEREE_1', 'ASSISTANT_REFEREE_2', 'FOURTH_OFFICIAL', 'MATCH_COMMISSIONER', 'DELEGATE');
CREATE TYPE "MatchOfficialAssignmentStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REFUSED', 'CANCELLED');

ALTER TABLE "OfficialProfile" ADD COLUMN "userId" UUID;

CREATE TABLE "MatchOfficialAssignment" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "officialProfileId" UUID NOT NULL,
  "role" "MatchOfficialRole" NOT NULL,
  "status" "MatchOfficialAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
  "responseReason" TEXT,
  "sentAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchOfficialAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfficialProfile_userId_key" ON "OfficialProfile"("userId");
CREATE UNIQUE INDEX "MatchOfficialAssignment_matchId_role_key" ON "MatchOfficialAssignment"("matchId", "role");
CREATE UNIQUE INDEX "MatchOfficialAssignment_matchId_officialProfileId_key" ON "MatchOfficialAssignment"("matchId", "officialProfileId");
CREATE INDEX "MatchOfficialAssignment_officialProfileId_status_idx" ON "MatchOfficialAssignment"("officialProfileId", "status");
ALTER TABLE "OfficialProfile" ADD CONSTRAINT "OfficialProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatchOfficialAssignment" ADD CONSTRAINT "MatchOfficialAssignment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchOfficialAssignment" ADD CONSTRAINT "MatchOfficialAssignment_officialProfileId_fkey" FOREIGN KEY ("officialProfileId") REFERENCES "OfficialProfile"("registrationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchOfficialAssignment" ADD CONSTRAINT "MatchOfficialAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
