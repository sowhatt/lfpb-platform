import { BadRequestException, Injectable } from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';

const LICENSE_TRANSITIONS: Record<LicenseStatus, LicenseStatus[]> = {
  DRAFT: [LicenseStatus.SUBMITTED_TO_LEAGUE],
  SUBMITTED_TO_LEAGUE: [LicenseStatus.INCOMPLETE, LicenseStatus.LEAGUE_FAVORABLE],
  INCOMPLETE: [LicenseStatus.SUBMITTED_TO_LEAGUE],
  LEAGUE_FAVORABLE: [LicenseStatus.TRANSMITTED_TO_FBF],
  TRANSMITTED_TO_FBF: [LicenseStatus.ISSUED_BY_FBF, LicenseStatus.REJECTED_BY_FBF],
  ISSUED_BY_FBF: [LicenseStatus.SUSPENDED, LicenseStatus.CANCELLED, LicenseStatus.EXPIRED],
  REJECTED_BY_FBF: [LicenseStatus.DRAFT],
  SUSPENDED: [LicenseStatus.ISSUED_BY_FBF, LicenseStatus.CANCELLED, LicenseStatus.EXPIRED],
  CANCELLED: [],
  EXPIRED: [],
};

@Injectable()
export class LicenseStatusService {
  assertTransition(from: LicenseStatus, to: LicenseStatus): void {
    if (!LICENSE_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Transition de licence interdite : ${from} vers ${to}`);
    }
  }
}
