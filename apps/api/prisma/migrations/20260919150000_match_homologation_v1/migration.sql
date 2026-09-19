-- CreateEnum
CREATE TYPE "MatchHomologationStatus" AS ENUM ('PENDING', 'HOMOLOGATED', 'REJECTED');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "homologatedAt" TIMESTAMP(3),
ADD COLUMN     "homologatedByUserId" UUID,
ADD COLUMN     "homologationReason" TEXT,
ADD COLUMN     "homologationStatus" "MatchHomologationStatus",
ADD COLUMN     "officialAwayScore" INTEGER,
ADD COLUMN     "officialHomeScore" INTEGER;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homologatedByUserId_fkey" FOREIGN KEY ("homologatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
