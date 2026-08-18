import { BadRequestException } from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';
import { LicenseStatusService } from './license-status.service';

describe('LicenseStatusService', () => {
  const service = new LicenseStatusService();

  it('autorise la soumission d’une licence brouillon', () => {
    expect(() => service.assertTransition(LicenseStatus.DRAFT, LicenseStatus.SUBMITTED)).not.toThrow();
  });

  it('interdit à un club de valider directement un brouillon', () => {
    expect(() => service.assertTransition(LicenseStatus.DRAFT, LicenseStatus.APPROVED)).toThrow(
      BadRequestException,
    );
  });

  it('autorise la suspension d’une licence validée', () => {
    expect(() =>
      service.assertTransition(LicenseStatus.APPROVED, LicenseStatus.SUSPENDED),
    ).not.toThrow();
  });

  it('interdit de réactiver une licence expirée', () => {
    expect(() => service.assertTransition(LicenseStatus.EXPIRED, LicenseStatus.APPROVED)).toThrow(
      BadRequestException,
    );
  });
});
