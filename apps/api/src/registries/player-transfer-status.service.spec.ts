import { BadRequestException } from '@nestjs/common';
import { PlayerTransferStatus } from '@prisma/client';
import { PlayerTransferStatusService } from './player-transfer-status.service';

describe('PlayerTransferStatusService', () => {
  const service = new PlayerTransferStatusService();

  it('permet le cycle normal avec accord du club quitté', () => {
    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.DRAFT,
        PlayerTransferStatus.REQUESTED,
      ),
    ).not.toThrow();

    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.REQUESTED,
        PlayerTransferStatus.AGREED,
      ),
    ).not.toThrow();

    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.AGREED,
        PlayerTransferStatus.LEAGUE_REVIEW,
      ),
    ).not.toThrow();

    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.LEAGUE_REVIEW,
        PlayerTransferStatus.APPROVED,
      ),
    ).not.toThrow();

    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.APPROVED,
        PlayerTransferStatus.EFFECTIVE,
      ),
    ).not.toThrow();
  });

  it('permet à la Ligue d examiner une opposition du club quitté', () => {
    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.REQUESTED,
        PlayerTransferStatus.OPPOSED,
      ),
    ).not.toThrow();

    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.OPPOSED,
        PlayerTransferStatus.LEAGUE_REVIEW,
      ),
    ).not.toThrow();
  });

  it('permet à la Ligue de rejeter un dossier en examen', () => {
    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.LEAGUE_REVIEW,
        PlayerTransferStatus.REJECTED,
      ),
    ).not.toThrow();
  });

  it('interdit de rendre directement une demande effective', () => {
    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.REQUESTED,
        PlayerTransferStatus.EFFECTIVE,
      ),
    ).toThrow(BadRequestException);
  });

  it('interdit de sauter le contrôle Ligue après accord', () => {
    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.AGREED,
        PlayerTransferStatus.EFFECTIVE,
      ),
    ).toThrow(BadRequestException);
  });

  it('rend EFFECTIVE terminal', () => {
    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.EFFECTIVE,
        PlayerTransferStatus.DRAFT,
      ),
    ).toThrow(BadRequestException);
  });

  it('rend REJECTED terminal', () => {
    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.REJECTED,
        PlayerTransferStatus.REQUESTED,
      ),
    ).toThrow(BadRequestException);
  });

  it('rend CANCELLED terminal', () => {
    expect(() =>
      service.assertTransition(
        PlayerTransferStatus.CANCELLED,
        PlayerTransferStatus.REQUESTED,
      ),
    ).toThrow(BadRequestException);
  });
});
