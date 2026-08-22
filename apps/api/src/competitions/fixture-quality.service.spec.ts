import { FixturePlannerService, PlannerClub } from './fixture-planner.service';
import { FixtureQualityService } from './fixture-quality.service';

describe('FixtureQualityService', () => {
  const planner = new FixturePlannerService();
  const quality = new FixtureQualityService();
  const clubs: PlannerClub[] = [
    { id: 'dragons', name: 'Dragons FC' },
    { id: 'aziza', name: 'RC Aziza' },
    { id: 'beke', name: 'Béké FC' },
  ];

  it('attribue 100 à un calendrier aller-retour équilibré', () => {
    const rounds = planner.generateRoundRobin(clubs, true);
    const report = quality.evaluate(clubs, rounds, 2, 2, 2);

    expect(report.score).toBe(100);
    expect(report.grade).toBe('EXCELLENT');
    expect(report.publishable).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it('mesure deux matchs à domicile et deux à l’extérieur par club', () => {
    const rounds = planner.generateRoundRobin(clubs, true);
    const report = quality.evaluate(clubs, rounds, 2, 2, 2);

    expect(
      report.clubMetrics.every(
        (metric) =>
          metric.homeMatches === 2 && metric.awayMatches === 2,
      ),
    ).toBe(true);
  });

  it('signale une limite domicile trop stricte', () => {
    const rounds = planner.generateRoundRobin(clubs, true);
    const report = quality.evaluate(clubs, rounds, 1, 2, 2);

    expect(report.score).toBeLessThan(100);
    expect(report.publishable).toBe(false);
    expect(
      report.violations.some((violation) =>
        violation.includes('réceptions consécutives'),
      ),
    ).toBe(true);
  });
});
