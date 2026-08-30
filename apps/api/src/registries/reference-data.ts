import {
  DocumentStatus,
  DocumentType,
  LicenseStatus,
  OfficialFunction,
  PlayerPosition,
  RegistrationStatus,
  StaffFunction,
} from '@prisma/client';

type LabelMap<T extends string> = Record<T, string>;

export const PLAYER_POSITION_LABELS: LabelMap<PlayerPosition> = {
  GOALKEEPER: 'Gardien de but',
  DEFENDER: 'Défenseur',
  MIDFIELDER: 'Milieu de terrain',
  FORWARD: 'Attaquant',
};

export const STAFF_FUNCTION_LABELS: LabelMap<StaffFunction> = {
  HEAD_COACH: 'Entraîneur principal',
  ASSISTANT_COACH: 'Entraîneur adjoint',
  GOALKEEPER_COACH: 'Entraîneur des gardiens',
  FITNESS_COACH: 'Préparateur physique',
  DOCTOR: 'Médecin',
  PHYSIOTHERAPIST: 'Kinésithérapeute',
  TEAM_MANAGER: 'Manager d’équipe',
  OTHER: 'Autre fonction',
};

export const OFFICIAL_FUNCTION_LABELS: LabelMap<OfficialFunction> = {
  REFEREE: 'Arbitre central',
  ASSISTANT_REFEREE: 'Arbitre assistant',
  FOURTH_OFFICIAL: 'Quatrième arbitre',
  MATCH_COMMISSIONER: 'Commissaire au match',
  DELEGATE: 'Délégué',
};

export const REGISTRATION_STATUS_LABELS: LabelMap<RegistrationStatus> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis à la Ligue',
  VALIDATED: 'Validé',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
};

export const LICENSE_STATUS_LABELS: LabelMap<LicenseStatus> = {
  DRAFT: 'Brouillon',
  SUBMITTED_TO_LEAGUE: 'Soumis à la LFPB',
  INCOMPLETE: 'Dossier à compléter',
  LEAGUE_FAVORABLE: 'Avis favorable LFPB',
  TRANSMITTED_TO_FBF: 'Transmis à la FBF',
  ISSUED_BY_FBF: 'Licence délivrée par la FBF',
  REJECTED_BY_FBF: 'Refusé par la FBF',
  SUSPENDED: 'Suspendue par la FBF',
  CANCELLED: 'Annulée par la FBF',
  EXPIRED: 'Expirée',
};

export const DOCUMENT_TYPE_LABELS: LabelMap<DocumentType> = {
  IDENTITY: 'Pièce d’identité',
  PHOTO: 'Photo d’identité',
  MEDICAL_CERTIFICATE: 'Certificat médical',
  CONTRACT: 'Contrat',
  TRANSFER_CLEARANCE: 'Lettre de sortie ou transfert',
  OTHER: 'Autre document',
};

export const DOCUMENT_STATUS_LABELS: LabelMap<DocumentStatus> = {
  PENDING: 'En attente',
  VALID: 'Validé',
  REJECTED: 'Rejeté',
  EXPIRED: 'Expiré',
};

const options = <T extends string>(labels: LabelMap<T>) =>
  Object.entries(labels).map(([code, label]) => ({ code, label }));

export const REGISTRY_REFERENCE_DATA = {
  playerPositions: options(PLAYER_POSITION_LABELS),
  staffFunctions: options(STAFF_FUNCTION_LABELS),
  officialFunctions: options(OFFICIAL_FUNCTION_LABELS),
  registrationStatuses: options(REGISTRATION_STATUS_LABELS),
  licenseStatuses: options(LICENSE_STATUS_LABELS),
  documentTypes: options(DOCUMENT_TYPE_LABELS),
  documentStatuses: options(DOCUMENT_STATUS_LABELS),
};
