ALTER TABLE "Match"
ADD COLUMN "officialMatchNumber" TEXT;

CREATE UNIQUE INDEX "Match_competitionId_officialMatchNumber_key"
ON "Match"("competitionId", "officialMatchNumber");
