import { BadRequestException, Injectable } from '@nestjs/common';

export interface PlannerClub {
  id: string;
  name: string;
}

export interface PlannedPairing {
  homeClubId: string;
  awayClubId: string;
}

export interface PlannedRound {
  number: number;
  matches: PlannedPairing[];
  byeClubId?: string;
}

@Injectable()
export class FixturePlannerService {
  generateRoundRobin(
    clubs: PlannerClub[],
    doubleRound: boolean,
  ): PlannedRound[] {
    if (clubs.length < 2) {
      throw new BadRequestException(
        'Au moins deux clubs sont nécessaires pour planifier la compétition',
      );
    }

    const participants: Array<PlannerClub | null> = [...clubs];
    if (participants.length % 2 !== 0) participants.push(null);

    const firstLeg: PlannedRound[] = [];
    const rotating = [...participants];
    const roundCount = rotating.length - 1;

    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
      const matches: PlannedPairing[] = [];
      let byeClubId: string | undefined;

      for (let index = 0; index < rotating.length / 2; index += 1) {
        const left = rotating[index];
        const right = rotating[rotating.length - 1 - index];

        if (!left || !right) {
          byeClubId = (left ?? right)?.id;
          continue;
        }

        const reverseHome = (roundIndex + index) % 2 === 1;
        matches.push(
          reverseHome
            ? { homeClubId: right.id, awayClubId: left.id }
            : { homeClubId: left.id, awayClubId: right.id },
        );
      }

      firstLeg.push({
        number: roundIndex + 1,
        matches,
        ...(byeClubId ? { byeClubId } : {}),
      });

      const fixed = rotating[0];
      const tail = rotating.slice(1);
      tail.unshift(tail.pop() ?? null);
      rotating.splice(0, rotating.length, fixed, ...tail);
    }

    if (!doubleRound) return firstLeg;

    const secondLeg = firstLeg.map((round) => ({
      number: round.number + firstLeg.length,
      matches: round.matches.map((match) => ({
        homeClubId: match.awayClubId,
        awayClubId: match.homeClubId,
      })),
      ...(round.byeClubId ? { byeClubId: round.byeClubId } : {}),
    }));

    return [...firstLeg, ...secondLeg];
  }
}
