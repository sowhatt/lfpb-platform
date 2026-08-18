import { BadRequestException, Injectable } from '@nestjs/common';
import { RegistrationStatus } from '@prisma/client';

const TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  DRAFT: [RegistrationStatus.SUBMITTED, RegistrationStatus.ARCHIVED],
  SUBMITTED: [RegistrationStatus.VALIDATED, RegistrationStatus.DRAFT],
  VALIDATED: [RegistrationStatus.SUSPENDED, RegistrationStatus.ARCHIVED],
  SUSPENDED: [RegistrationStatus.VALIDATED, RegistrationStatus.ARCHIVED],
  ARCHIVED: [],
};

@Injectable()
export class RegistrationStatusService {
  assertTransition(from: RegistrationStatus, to: RegistrationStatus): void {
    if (!TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Transition interdite : ${from} vers ${to}`);
    }
  }
}
