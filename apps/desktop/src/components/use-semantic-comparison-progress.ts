"use client";

import { useCallback, useState } from "react";

type Progress = { percent: number; stage: string; message: string };
const initialProgress: Progress = { percent: 6, stage: "preparing", message: "正在准备本地语义模型…" };

function newJobId() { return globalThis.crypto?.randomUUID?.() ?? `comparison-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function useSemanticComparisonProgress() {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const request = useCallback(async <T,>(url: string, body: Record<string, unknown>, track: boolean): Promise<T> => {
    const jobId = track ? newJobId() : undefined;
    if (jobId) { setProgress(initialProgress); setOpen(true); }
    const timer = jobId ? window.setInterval(async () => {
      try {
        const response = await fetch(`/api/comparison-progress?jobId=${encodeURIComponent(jobId)}`);
        const data = await response.json() as { progress?: Progress | null };
        if (data.progress) setProgress(data.progress);
      } catch { /* Keep the last helpful progress message while the request continues. */ }
    }, 280) : undefined;
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, comparisonProgressId: jobId }) });
      return await response.json() as T;
    } finally {
      if (timer) window.clearInterval(timer);
      if (jobId) { setProgress({ percent: 100, stage: "complete", message: "比对完成，正在展示结果…" }); window.setTimeout(() => setOpen(false), 280); }
    }
  }, []);
  return { open, progress, request };
}
