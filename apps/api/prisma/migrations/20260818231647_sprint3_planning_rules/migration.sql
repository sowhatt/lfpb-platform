-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "maxConsecutiveAway" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxConsecutiveHome" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "minRestHours" INTEGER NOT NULL DEFAULT 72;
