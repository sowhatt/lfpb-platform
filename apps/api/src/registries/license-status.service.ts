import { BadRequestException, Injectable } from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';

const LICENSE_TRANSITIONS: Record<LicenseStatus, LicenseStatus[]> = {
  DRAFT: [LicenseStatus.SUBMITTED],
  SUBMITTED: [LicenseStatus.APPROVED, LicenseStatus.REJECTED, LicenseStatus.DRAFT],
  APPROVED: [LicenseStatus.SUSPENDED, LicenseStatus.EXPIRED],
  REJECTED: [LicenseStatus.DRAFT],
  SUSPENDED: [LicenseStatus.APPROVED, LicenseStatus.EXPIRED],
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
