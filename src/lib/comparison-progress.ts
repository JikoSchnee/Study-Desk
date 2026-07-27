import "server-only";

export type ComparisonProgress = { percent: number; stage: "preparing" | "downloading" | "recognizing" | "matching" | "complete" | "fallback"; message: string };

type StoredProgress = ComparisonProgress & { updatedAt: number };
const globalForComparisonProgress = globalThis as unknown as { comparisonProgressByJob?: Map<string, StoredProgress> };
const progressByJob = globalForComparisonProgress.comparisonProgressByJob ?? new Map<string, StoredProgress>();
globalForComparisonProgress.comparisonProgressByJob = progressByJob;

export function setComparisonProgress(jobId: string | undefined, progress: ComparisonProgress) {
  if (!jobId) return;
  progressByJob.set(jobId, { ...progress, updatedAt: Date.now() });
  for (const [id, value] of progressByJob) if (Date.now() - value.updatedAt > 5 * 60_000) progressByJob.delete(id);
}

export function getComparisonProgress(jobId: string) {
  const progress = progressByJob.get(jobId);
  if (!progress) return null;
  return { percent: progress.percent, stage: progress.stage, message: progress.message };
}
