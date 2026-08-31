import { Injectable } from '@nestjs/common';
import { PlannedRound, PlannerClub } from './fixture-planner.service';

export interface ClubQuality {
  clubId: string;
  clubName: string;
  homeMatches: number;
  awayMatches: number;
  byes: number;
  maxHomeStreak: number;
  maxAwayStreak: number;
}

@Injectable()
export class FixtureQualityService {
  evaluate(
    clubs: PlannerClub[],
    rounds: PlannedRound[],
    maxConsecutiveHome: number,
    maxConsecutiveAway: number,
    expectedMeetingsPerPair: number,
  ) {
    const states = new Map(
      clubs.map((club) => [
        club.id,
        {
          clubId: club.id,
          clubName: club.name,
          homeMatches: 0,
          awayMatches: 0,
          byes: 0,
          maxHomeStreak: 0,
          maxAwayStreak: 0,
          lastRole: null as 'HOME' | 'AWAY' | null,
          currentStreak: 0,
        },
      ]),
    );
    const pairCounts = new Map<string, number>();

    for (const round of rounds) {
      if (round.byeClubId) {
        const state = states.get(round.byeClubId);
        if (state) state.byes += 1;
      }

      for (const match of round.matches) {
        const home = states.get(match.homeClubId);
        const away = states.get(match.awayClubId);
        if (!home || !away) continue;

        this.recordRole(home, 'HOME');
        this.recordRole(away, 'AWAY');

        const pairKey = [match.homeClubId, match.awayClubId].sort().join(':');
        pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
      }
    }

    const violations: string[] = [];
    const clubMetrics: ClubQuality[] = [...states.values()].map((state) => {
      if (state.maxHomeStreak > maxConsecutiveHome) {
        violations.push(
          `${state.clubName}: ${state.maxHomeStreak} réceptions consécutives`,
        );
      }
      if (state.maxAwayStreak > maxConsecutiveAway) {
        violations.push(
          `${state.clubName}: ${state.maxAwayStreak} déplacements consécutifs`,
        );
      }
      if (Math.abs(state.homeMatches - state.awayMatches) > 1) {
        violations.push(
          `${state.clubName}: déséquilibre domicile/extérieur`,
        );
      }

      return {
        clubId: state.clubId,
        clubName: state.clubName,
        homeMatches: state.homeMatches,
        awayMatches: state.awayMatches,
        byes: state.byes,
        maxHomeStreak: state.maxHomeStreak,
        maxAwayStreak: state.maxAwayStreak,
      };
    });

    const expectedPairs = (clubs.length * (clubs.length - 1)) / 2;
    if (
      pairCounts.size !== expectedPairs ||
      [...pairCounts.values()].some(
        (count) => count !== expectedMeetingsPerPair,
      )
    ) {
      violations.push('Toutes les confrontations attendues ne sont pas couvertes');
    }

    const score = Math.max(0, 100 - violations.length * 10);
    return {
      score,
      grade: score >= 90 ? 'EXCELLENT' : score >= 75 ? 'GOOD' : 'TO_REVIEW',
      publishable: violations.length === 0,
      violations,
      clubMetrics,
    };
  }

  private recordRole(
    state: {
      homeMatches: number;
      awayMatches: number;
      maxHomeStreak: number;
      maxAwayStreak: number;
      lastRole: 'HOME' | 'AWAY' | null;
      currentStreak: number;
    },
    role: 'HOME' | 'AWAY',
  ) {
    if (role === 'HOME') state.homeMatches += 1;
    else state.awayMatches += 1;

    state.currentStreak =
      state.lastRole === role ? state.currentStreak + 1 : 1;
    state.lastRole = role;

    if (role === 'HOME') {
      state.maxHomeStreak = Math.max(
        state.maxHomeStreak,
        state.currentStreak,
      );
    } else {
      state.maxAwayStreak = Math.max(
        state.maxAwayStreak,
        state.currentStreak,
      );
    }
  }
}
