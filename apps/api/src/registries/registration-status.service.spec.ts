import { BadRequestException } from '@nestjs/common';
import { RegistrationStatus } from '@prisma/client';
import { RegistrationStatusService } from './registration-status.service';

describe('RegistrationStatusService', () => {
  const service = new RegistrationStatusService();

  it('autorise la soumission d’un dossier brouillon', () => {
    expect(() =>
      service.assertTransition(RegistrationStatus.DRAFT, RegistrationStatus.SUBMITTED),
    ).not.toThrow();
  });

  it('interdit la validation directe d’un dossier brouillon', () => {
    expect(() =>
      service.assertTransition(RegistrationStatus.DRAFT, RegistrationStatus.VALIDATED),
    ).toThrow(BadRequestException);
  });

  it('interdit de réactiver un dossier archivé', () => {
    expect(() =>
      service.assertTransition(RegistrationStatus.ARCHIVED, RegistrationStatus.VALIDATED),
    ).toThrow(BadRequestException);
  });
});
