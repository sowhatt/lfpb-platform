import { BadRequestException, Injectable } from '@nestjs/common';
import { PlayerTransferStatus } from '@prisma/client';

const TRANSITIONS: Record<PlayerTransferStatus, PlayerTransferStatus[]> = {
  DRAFT: [
    PlayerTransferStatus.REQUESTED,
    PlayerTransferStatus.CANCELLED,
  ],

  REQUESTED: [
    PlayerTransferStatus.AGREED,
    PlayerTransferStatus.OPPOSED,
    PlayerTransferStatus.CANCELLED,
  ],

  AGREED: [
    PlayerTransferStatus.LEAGUE_REVIEW,
    PlayerTransferStatus.CANCELLED,
  ],

  OPPOSED: [
    PlayerTransferStatus.LEAGUE_REVIEW,
    PlayerTransferStatus.CANCELLED,
  ],

  LEAGUE_REVIEW: [
    PlayerTransferStatus.APPROVED,
    PlayerTransferStatus.REJECTED,
  ],

  APPROVED: [
    PlayerTransferStatus.EFFECTIVE,
    PlayerTransferStatus.CANCELLED,
  ],

  REJECTED: [],
  CANCELLED: [],
  EFFECTIVE: [],
};

@Injectable()
export class PlayerTransferStatusService {
  assertTransition(
    from: PlayerTransferStatus,
    to: PlayerTransferStatus,
  ): void {
    if (!TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `Transition de transfert interdite : ${from} vers ${to}`,
      );
    }
  }
}
