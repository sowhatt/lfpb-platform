-- The LFPB reviews and forwards player files; only the FBF issues a licence.
ALTER TYPE "OrganizationType" ADD VALUE IF NOT EXISTS 'FEDERATION';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FEDERATION_AGENT';

-- Preserve the meaning of historical decisions made by the League.
ALTER TYPE "LicenseStatus" RENAME VALUE 'SUBMITTED' TO 'SUBMITTED_TO_LEAGUE';
ALTER TYPE "LicenseStatus" RENAME VALUE 'APPROVED' TO 'LEAGUE_FAVORABLE';
ALTER TYPE "LicenseStatus" RENAME VALUE 'REJECTED' TO 'INCOMPLETE';
ALTER TYPE "LicenseStatus" ADD VALUE IF NOT EXISTS 'TRANSMITTED_TO_FBF';
ALTER TYPE "LicenseStatus" ADD VALUE IF NOT EXISTS 'ISSUED_BY_FBF';
ALTER TYPE "LicenseStatus" ADD VALUE IF NOT EXISTS 'REJECTED_BY_FBF';
ALTER TYPE "LicenseStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- A licence number exists only after the Federation has issued the licence.
ALTER TABLE "License" ALTER COLUMN "number" DROP NOT NULL;
