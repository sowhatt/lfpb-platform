import { BadRequestException } from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';
import { LicenseStatusService } from './license-status.service';

describe('LicenseStatusService', () => {
  const service = new LicenseStatusService();

  it('autorise le club à soumettre un dossier brouillon à la Ligue', () => {
    expect(() =>
      service.assertTransition(LicenseStatus.DRAFT, LicenseStatus.SUBMITTED_TO_LEAGUE),
    ).not.toThrow();
  });

  it('autorise la Ligue à demander des compléments puis le club à resoumettre', () => {
    expect(() =>
      service.assertTransition(LicenseStatus.SUBMITTED_TO_LEAGUE, LicenseStatus.INCOMPLETE),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(LicenseStatus.INCOMPLETE, LicenseStatus.SUBMITTED_TO_LEAGUE),
    ).not.toThrow();
  });

  it('impose avis favorable et transmission avant la décision FBF', () => {
    expect(() =>
      service.assertTransition(
        LicenseStatus.SUBMITTED_TO_LEAGUE,
        LicenseStatus.LEAGUE_FAVORABLE,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        LicenseStatus.LEAGUE_FAVORABLE,
        LicenseStatus.TRANSMITTED_TO_FBF,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        LicenseStatus.TRANSMITTED_TO_FBF,
        LicenseStatus.ISSUED_BY_FBF,
      ),
    ).not.toThrow();
  });

  it('interdit à la Ligue de délivrer directement une licence', () => {
    expect(() =>
      service.assertTransition(LicenseStatus.SUBMITTED_TO_LEAGUE, LicenseStatus.ISSUED_BY_FBF),
    ).toThrow(BadRequestException);
    expect(() =>
      service.assertTransition(LicenseStatus.LEAGUE_FAVORABLE, LicenseStatus.ISSUED_BY_FBF),
    ).toThrow(BadRequestException);
  });

  it('autorise la FBF à suspendre ou annuler une licence délivrée', () => {
    expect(() =>
      service.assertTransition(LicenseStatus.ISSUED_BY_FBF, LicenseStatus.SUSPENDED),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(LicenseStatus.ISSUED_BY_FBF, LicenseStatus.CANCELLED),
    ).not.toThrow();
  });

  it('interdit toute réactivation d’une licence expirée', () => {
    expect(() =>
      service.assertTransition(LicenseStatus.EXPIRED, LicenseStatus.ISSUED_BY_FBF),
    ).toThrow(BadRequestException);
  });
});
