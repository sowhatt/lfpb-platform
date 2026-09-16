export type MatchClockPeriod = 'FIRST_HALF' | 'HALF_TIME' | 'SECOND_HALF' | 'EXTRA_TIME_FIRST' | 'EXTRA_TIME_BREAK' | 'EXTRA_TIME_SECOND' | 'PENALTIES' | 'FINISHED';

export type MatchClockState = {
  period: MatchClockPeriod;
  running: boolean;
  elapsedSeconds: number;
  periodStartedAt?: string | null;
};

export function clockFromEvents(events: Array<{ type: string; createdAt?: string }>, nowMs = Date.now()): MatchClockState {
  let period: MatchClockPeriod = 'FIRST_HALF';
  let running = false;
  let elapsedSeconds = 0;
  let periodStartedAt: string | null = null;

  for (const event of events) {
    if (event.type === 'MATCH_START') { period = 'FIRST_HALF'; running = true; elapsedSeconds = 0; periodStartedAt = event.createdAt ?? null; }
    else if (event.type === 'HALF_TIME') { if (running && periodStartedAt) elapsedSeconds += Math.max(0, Math.floor((new Date(event.createdAt ?? nowMs).getTime() - new Date(periodStartedAt).getTime()) / 1000)); period = 'HALF_TIME'; running = false; periodStartedAt = null; }
    else if (event.type === 'SECOND_HALF_START') { period = 'SECOND_HALF'; running = true; elapsedSeconds = 45 * 60; periodStartedAt = event.createdAt ?? null; }
    else if (event.type === 'MATCH_END') { if (running && periodStartedAt) elapsedSeconds += Math.max(0, Math.floor((new Date(event.createdAt ?? nowMs).getTime() - new Date(periodStartedAt).getTime()) / 1000)); period = 'FINISHED'; running = false; periodStartedAt = null; }
  }

  if (running && periodStartedAt) elapsedSeconds += Math.max(0, Math.floor((nowMs - new Date(periodStartedAt).getTime()) / 1000));
  return { period, running, elapsedSeconds, periodStartedAt };
}

export function officialMinute(state: MatchClockState) {
  const elapsedMinutes = Math.floor(state.elapsedSeconds / 60);
  if (state.period === 'FIRST_HALF') return Math.max(1, Math.min(45, elapsedMinutes + 1));
  if (state.period === 'SECOND_HALF') return Math.max(46, Math.min(90, elapsedMinutes + 1));
  return Math.max(0, elapsedMinutes);
}

export function displayMatchClock(state: MatchClockState) {
  const elapsed = Math.floor(state.elapsedSeconds / 60);
  const seconds = state.elapsedSeconds % 60;
  let minuteLabel: string;
  if (state.period === 'FIRST_HALF' && elapsed >= 45) minuteLabel = `45+${Math.max(1, elapsed - 44)}`;
  else if (state.period === 'SECOND_HALF' && elapsed >= 90) minuteLabel = `90+${Math.max(1, elapsed - 89)}`;
  else minuteLabel = String(Math.max(state.running ? 1 : 0, elapsed + (state.running ? 1 : 0)));
  return { minuteLabel, timeLabel: `${minuteLabel}' · ${String(seconds).padStart(2, '0')}s` };
}

export function periodLabel(period: MatchClockPeriod) {
  const labels: Record<MatchClockPeriod, string> = {
    FIRST_HALF: '1re mi-temps', HALF_TIME: 'Mi-temps', SECOND_HALF: '2e mi-temps', EXTRA_TIME_FIRST: 'Prolongation · 1re période', EXTRA_TIME_BREAK: 'Pause prolongation', EXTRA_TIME_SECOND: 'Prolongation · 2e période', PENALTIES: 'Tirs au but', FINISHED: 'Match terminé',
  };
  return labels[period];
}
