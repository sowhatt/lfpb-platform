export type MatchClockPeriod = 'FIRST_HALF' | 'HALF_TIME' | 'SECOND_HALF' | 'EXTRA_TIME_FIRST' | 'EXTRA_TIME_BREAK' | 'EXTRA_TIME_SECOND' | 'PENALTIES' | 'FINISHED';

export type MatchClockState = { period: MatchClockPeriod; running: boolean; elapsedSeconds: number; periodStartedAt?: string | null; legacyClock: boolean };
export type OfficialClockMinute = { minute: number; stoppageMinute: number; period: MatchClockPeriod; label: string };
const LEGACY_RUNNING_LIMIT_SECONDS = 3 * 60 * 60;

export function clockFromEvents(events: Array<{ type: string; createdAt?: string }>, nowMs = Date.now()): MatchClockState {
  let period: MatchClockPeriod = 'FIRST_HALF'; let running = false; let elapsedSeconds = 0; let periodStartedAt: string | null = null; let legacyClock = false;
  for (const event of events) {
    if (event.type === 'MATCH_START') { period = 'FIRST_HALF'; running = true; elapsedSeconds = 0; periodStartedAt = event.createdAt ?? null; }
    else if (event.type === 'HALF_TIME') { if (running && periodStartedAt) elapsedSeconds += Math.max(0, Math.floor((new Date(event.createdAt ?? nowMs).getTime() - new Date(periodStartedAt).getTime()) / 1000)); period = 'HALF_TIME'; running = false; periodStartedAt = null; }
    else if (event.type === 'SECOND_HALF_START') { period = 'SECOND_HALF'; running = true; elapsedSeconds = 45 * 60; periodStartedAt = event.createdAt ?? null; }
    else if (event.type === 'MATCH_END') { if (running && periodStartedAt) elapsedSeconds += Math.max(0, Math.floor((new Date(event.createdAt ?? nowMs).getTime() - new Date(periodStartedAt).getTime()) / 1000)); period = 'FINISHED'; running = false; periodStartedAt = null; }
  }
  if (running && periodStartedAt) {
    const liveSeconds = Math.max(0, Math.floor((nowMs - new Date(periodStartedAt).getTime()) / 1000));
    if (liveSeconds > LEGACY_RUNNING_LIMIT_SECONDS) { legacyClock = true; running = false; elapsedSeconds = period === 'SECOND_HALF' ? 90 * 60 : 45 * 60; }
    else elapsedSeconds += liveSeconds;
  }
  return { period, running, elapsedSeconds, periodStartedAt, legacyClock };
}

export function officialClockMinute(state: MatchClockState): OfficialClockMinute {
  const elapsed = Math.floor(state.elapsedSeconds / 60);
  if (state.period === 'FIRST_HALF') { const stoppageMinute = Math.max(0, elapsed - 44); return { minute: Math.min(45, Math.max(1, elapsed + 1)), stoppageMinute, period: state.period, label: stoppageMinute ? `45+${stoppageMinute}` : String(Math.max(1, elapsed + 1)) }; }
  if (state.period === 'SECOND_HALF') { const stoppageMinute = Math.max(0, elapsed - 89); return { minute: Math.min(90, Math.max(46, elapsed + 1)), stoppageMinute, period: state.period, label: stoppageMinute ? `90+${stoppageMinute}` : String(Math.max(46, elapsed + 1)) }; }
  return { minute: Math.max(0, elapsed), stoppageMinute: 0, period: state.period, label: String(Math.max(0, elapsed)) };
}

export function officialMinute(state: MatchClockState) { return officialClockMinute(state).minute; }
export function displayMatchClock(state: MatchClockState) { const clockMinute = officialClockMinute(state); const seconds = state.elapsedSeconds % 60; return { minuteLabel: clockMinute.label, timeLabel: `${clockMinute.label}' · ${String(seconds).padStart(2, '0')}s` }; }
export function periodLabel(period: MatchClockPeriod) { const labels: Record<MatchClockPeriod, string> = { FIRST_HALF: '1re mi-temps', HALF_TIME: 'Mi-temps', SECOND_HALF: '2e mi-temps', EXTRA_TIME_FIRST: 'Prolongation · 1re période', EXTRA_TIME_BREAK: 'Pause prolongation', EXTRA_TIME_SECOND: 'Prolongation · 2e période', PENALTIES: 'Tirs au but', FINISHED: 'Match terminé' }; return labels[period]; }
