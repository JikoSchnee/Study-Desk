export type FsrsLearningMetrics = {
  difficulty: number | null;
  stability: number | null;
};

export function fsrsLearningMetrics(value: string | null): FsrsLearningMetrics {
  if (!value) return { difficulty: null, stability: null };
  try {
    const parsed = JSON.parse(value) as { difficulty?: unknown; stability?: unknown };
    const difficulty = Number(parsed.difficulty);
    const stability = Number(parsed.stability);
    return {
      difficulty: Number.isFinite(difficulty) && difficulty >= 1 && difficulty <= 10 ? difficulty : null,
      stability: Number.isFinite(stability) && stability >= 0 ? stability : null,
    };
  } catch {
    return { difficulty: null, stability: null };
  }
}
