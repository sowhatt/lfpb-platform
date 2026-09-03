CREATE TYPE "DocumentAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'CONSISTENT', 'NON_COMPLIANT', 'FAILED');

CREATE TABLE "DocumentAnalysis" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "status" "DocumentAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "model" TEXT,
    "confidence" DOUBLE PRECISION,
    "extractedData" JSONB,
    "comparisonResult" JSONB,
    "alerts" JSONB,
    "rawText" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentAnalysis_documentId_key" ON "DocumentAnalysis"("documentId");
CREATE INDEX "DocumentAnalysis_status_confidence_idx" ON "DocumentAnalysis"("status", "confidence");

ALTER TABLE "DocumentAnalysis"
ADD CONSTRAINT "DocumentAnalysis_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "RegistrationDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
