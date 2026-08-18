import { BadRequestException } from '@nestjs/common';
import { FixturePlannerService, PlannerClub } from './fixture-planner.service';

describe('FixturePlannerService', () => {
  const service = new FixturePlannerService();
  const clubs: PlannerClub[] = [
    { id: 'dragons', name: 'Dragons FC' },
    { id: 'aziza', name: 'RC Aziza' },
    { id: 'beke', name: 'Béké FC' },
  ];

  it('refuse une compétition avec moins de deux clubs', () => {
    expect(() => service.generateRoundRobin([clubs[0]], true)).toThrow(
      BadRequestException,
    );
  });

  it('gère un nombre impair de clubs avec une exemption par journée', () => {
    const rounds = service.generateRoundRobin(clubs, false);
    expect(rounds).toHaveLength(3);
    expect(rounds.every((round) => round.matches.length === 1)).toBe(true);
    expect(rounds.every((round) => Boolean(round.byeClubId))).toBe(true);
  });

  it('ne planifie jamais un club contre lui-même', () => {
    const rounds = service.generateRoundRobin(clubs, true);
    const matches = rounds.flatMap((round) => round.matches);
    expect(
      matches.every((match) => match.homeClubId !== match.awayClubId),
    ).toBe(true);
  });

  it('inverse domicile et extérieur pendant la phase retour', () => {
    const rounds = service.generateRoundRobin(clubs, true);
    expect(rounds).toHaveLength(6);

    const pairings = rounds
      .flatMap((round) => round.matches)
      .filter(
        (match) =>
          [match.homeClubId, match.awayClubId].sort().join(':') ===
          ['dragons', 'aziza'].sort().join(':'),
      );

    expect(pairings).toHaveLength(2);
    expect(pairings[0].homeClubId).toBe(pairings[1].awayClubId);
    expect(pairings[0].awayClubId).toBe(pairings[1].homeClubId);
  });
});
