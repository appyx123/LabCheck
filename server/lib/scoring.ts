const EPS = 1e-9;

/**
 * Pembulatan ke atas (ceiling) ke bilangan bulat 0..100 tanpa desimal.
 * Mengurangi epsilon kecil agar hasil eksak seperti 100.00000000000001 tidak menjadi 101.
 */
export function roundScore(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.ceil(value - EPS));
}

export function pointsPerTask(taskCount: number): number {
  if (taskCount <= 0) return 0;
  return roundScore(100 / taskCount);
}

export function calcModuleScore(completedCount: number, taskCount: number): number {
  if (taskCount <= 0 || completedCount <= 0) return 0;
  const clamped = Math.min(completedCount, taskCount);
  return roundScore((clamped * 100) / taskCount);
}

export function calcAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((acc, v) => acc + v, 0);
  return roundScore(total / values.length);
}
