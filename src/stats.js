// Race scoreboard bookkeeping. Pure: takes stats, returns new stats.
// Contender keys: 'p1', 'p2' (second human), 'cpu'. A null winner is a draw.

export const CONTENDERS = ['p1', 'p2', 'cpu'];

export function emptyStats() {
  return {
    rounds: 0,
    draws: 0,
    wins: { p1: 0, p2: 0, cpu: 0 },
    streak: { who: null, count: 0 },
    bestStreak: { who: null, count: 0 },
    fastestGoal: null, // { who, seconds }
  };
}

// Accept whatever storage hands back; fill anything missing or wrong-typed.
export function parseStats(raw) {
  const base = emptyStats();
  if (!raw || typeof raw !== 'object') return base;
  const num = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const who = (v) => (CONTENDERS.includes(v) ? v : null);
  base.rounds = num(raw.rounds);
  base.draws = num(raw.draws);
  for (const k of CONTENDERS) base.wins[k] = num(raw.wins?.[k]);
  base.streak = { who: who(raw.streak?.who), count: num(raw.streak?.count) };
  base.bestStreak = { who: who(raw.bestStreak?.who), count: num(raw.bestStreak?.count) };
  if (who(raw.fastestGoal?.who) && Number.isFinite(raw.fastestGoal?.seconds) && raw.fastestGoal.seconds > 0) {
    base.fastestGoal = { who: raw.fastestGoal.who, seconds: raw.fastestGoal.seconds };
  }
  return base;
}

export function recordResult(stats, { winner, reason, seconds }) {
  const next = structuredClone(stats);
  next.rounds++;
  if (winner === null) {
    next.draws++;
    next.streak = { who: null, count: 0 };
    return next;
  }
  next.wins[winner]++;
  next.streak = next.streak.who === winner
    ? { who: winner, count: next.streak.count + 1 }
    : { who: winner, count: 1 };
  if (next.streak.count > next.bestStreak.count) next.bestStreak = { ...next.streak };
  if (reason === 'goal' && (!next.fastestGoal || seconds < next.fastestGoal.seconds)) {
    next.fastestGoal = { who: winner, seconds: Math.round(seconds * 10) / 10 };
  }
  return next;
}
