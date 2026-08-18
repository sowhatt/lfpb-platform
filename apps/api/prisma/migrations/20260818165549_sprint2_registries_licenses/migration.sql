-- CreateEnum
CREATE TYPE "RegistrationCategory" AS ENUM ('PLAYER', 'STAFF', 'OFFICIAL');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VALIDATED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlayerPosition" AS ENUM ('GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD');

-- CreateEnum
CREATE TYPE "StaffFunction" AS ENUM ('HEAD_COACH', 'ASSISTANT_COACH', 'GOALKEEPER_COACH', 'FITNESS_COACH', 'DOCTOR', 'PHYSIOTHERAPIST', 'TEAM_MANAGER', 'OTHER');

-- CreateEnum
CREATE TYPE "OfficialFunction" AS ENUM ('REFEREE', 'ASSISTANT_REFEREE', 'FOURTH_OFFICIAL', 'MATCH_COMMISSIONER', 'DELEGATE');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('IDENTITY', 'PHOTO', 'MEDICAL_CERTIFICATE', 'CONTRACT', 'TRANSFER_CLEARANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VALID', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "nationality" TEXT,
    "federationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "category" "RegistrationCategory" NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "registrationId" UUID NOT NULL,
    "position" "PlayerPosition" NOT NULL,
    "shirtName" TEXT,
    "shirtNumber" INTEGER,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "registrationId" UUID NOT NULL,
    "function" "StaffFunction" NOT NULL,
    "qualification" TEXT,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "OfficialProfile" (
    "registrationId" UUID NOT NULL,
    "function" "OfficialFunction" NOT NULL,
    "grade" TEXT,

    CONSTRAINT "OfficialProfile_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "License" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'DRAFT',
    "validFrom" DATE,
    "validUntil" DATE,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationDocument" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_federationId_key" ON "Person"("federationId");

-- CreateIndex
CREATE INDEX "Person_lastName_firstName_birthDate_idx" ON "Person"("lastName", "firstName", "birthDate");

-- CreateIndex
CREATE INDEX "Registration_organizationId_category_status_idx" ON "Registration"("organizationId", "category", "status");

-- CreateIndex
CREATE INDEX "Registration_personId_status_idx" ON "Registration"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "License_number_key" ON "License"("number");

-- CreateIndex
CREATE INDEX "License_registrationId_season_status_idx" ON "License"("registrationId", "season", "status");

-- CreateIndex
CREATE INDEX "RegistrationDocument_registrationId_type_status_idx" ON "RegistrationDocument"("registrationId", "type", "status");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialProfile" ADD CONSTRAINT "OfficialProfile_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDocument" ADD CONSTRAINT "RegistrationDocument_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
