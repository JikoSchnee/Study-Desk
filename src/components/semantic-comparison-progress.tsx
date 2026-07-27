"use client";

import { BrainCircuit, Download, ScanSearch } from "lucide-react";

type Progress = { percent: number; stage: string; message: string };

export function SemanticComparisonProgress({ open, progress }: { open: boolean; progress: Progress }) {
  if (!open) return null;
  const Icon = progress.stage === "downloading" ? Download : progress.stage === "recognizing" || progress.stage === "matching" ? ScanSearch : BrainCircuit;
  return <div className="semantic-progress-backdrop" role="status" aria-live="polite"><section className="semantic-progress-dialog" aria-label="本地语义比对进度"><div className="semantic-progress-icon"><Icon size={25}/></div><p className="eyebrow">本地语义比对</p><h2>{progress.message}</h2><div className="semantic-progress-track" aria-label={`进度 ${progress.percent}%`}><i style={{ width: `${progress.percent}%` }} /></div><div className="semantic-progress-meta"><span>{progress.percent}%</span><span>{progress.stage === "downloading" ? "首次使用仅需下载一次" : "不会发送你的答案"}</span></div></section></div>;
}
