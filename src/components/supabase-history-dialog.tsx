"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Clock3, DatabaseBackup, FileDiff, History, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui";
import { fetchJson } from "@/lib/client-api";

type BackupPreview = { exportedAt: string; counts: Record<string, number>; cardConflicts: number };
type HistoryRecord = { id: string; version: number; createdAt: string; preview: BackupPreview };
type HistoryDiff = { record: HistoryRecord; local: BackupPreview; tables: Array<{ name: string; local: number; history: number; delta: number }> };
type SupabaseStatus = { configured: boolean; enabled: boolean; signedIn: boolean; email: string | null; lastSyncedAt: string | null; nextSyncAt: string | null; lastError: string | null; summary: string | null; pendingChoice: boolean };

const tableLabels: Record<string, string> = { cards: "卡片", card_relations: "关联", review_state: "复习状态", review_logs: "复习记录", initial_study_logs: "首学记录", daily_plans: "学习计划", daily_tasks: "计划任务", daily_reports: "学习日报", daily_report_items: "日报项目", interview_sessions: "访谈", interview_turns: "访谈轮次", knowledge_maintenance_proposals: "维护建议", knowledge_sync_records: "同步记录", practice_focus: "练习重点", settings: "可同步设置", tags: "标签" };
function summary(record: HistoryRecord) { return `${record.preview.counts.cards ?? 0} 张卡片 · ${record.preview.counts.review_logs ?? 0} 条复习记录`; }

export function SupabaseHistoryDialog({ onClose, onRestored }: { onClose: () => void; onRestored: (status: SupabaseStatus, summary: string) => void }) {
  const [records, setRecords] = useState<HistoryRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [diff, setDiff] = useState<HistoryDiff | null>(null); const [loadingDiffId, setLoadingDiffId] = useState<string | null>(null); const [confirming, setConfirming] = useState<HistoryRecord | null>(null); const [restoring, setRestoring] = useState(false);
  const load = async () => { setLoading(true); setError(""); try { const data = await fetchJson<{ records: HistoryRecord[] }>("/api/supabase-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "history-list" }), label: "读取同步记录" }); setRecords(data.records); } catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取同步记录。"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !restoring) onClose(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [onClose, restoring]);
  const showDiff = async (record: HistoryRecord) => { if (diff?.record.id === record.id) { setDiff(null); return; } setLoadingDiffId(record.id); setError(""); try { setDiff(await fetchJson<HistoryDiff>("/api/supabase-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "history-diff", id: record.id }), label: "读取版本差异" })); } catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取版本差异。"); } finally { setLoadingDiffId(null); } };
  const restore = async () => { if (!confirming) return; setRestoring(true); setError(""); try { const data = await fetchJson<{ summary: string; status: SupabaseStatus }>("/api/supabase-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "history-restore", id: confirming.id }), timeoutMs: 60_000, label: "恢复同步记录" }); onRestored(data.status, data.summary); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "恢复历史版本失败。"); setConfirming(null); } finally { setRestoring(false); } };
  return <div className="supabase-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !restoring) onClose(); }}>
    <section className="supabase-history-dialog" role="dialog" aria-modal="true" aria-labelledby="supabase-history-title" aria-busy={restoring}>
      <button className="icon-close" type="button" disabled={restoring} onClick={onClose} aria-label="关闭同步记录"><X size={19}/></button>
      <header><span><History size={22}/></span><div><p className="eyebrow">Supabase 云端历史</p><h2 id="supabase-history-title">同步记录</h2><p>只显示当前账号保留的历史版本。</p></div></header>
      <div className="supabase-history-body">
        {error && <div className="supabase-history-error" role="alert"><AlertCircle size={18}/><p>{error}</p></div>}
        {loading ? <div className="supabase-history-loading"><LoaderCircle size={23}/><span>正在读取同步记录…</span></div> : !records.length ? <div className="supabase-history-empty"><DatabaseBackup size={25}/><strong>还没有可恢复的历史版本</strong><p>完成一次 Supabase 同步后，记录会出现在这里。</p></div> : <div className="supabase-history-list">{records.map((record) => <article key={record.id} className="supabase-history-item"><div className="supabase-history-item-heading"><div><strong>版本 {record.version}</strong><span><Clock3 size={14}/>{new Date(record.createdAt).toLocaleString("zh-CN")}</span></div><small>{summary(record)}</small></div><div className="supabase-history-actions"><Button type="button" variant="outline" disabled={restoring || loadingDiffId === record.id} onClick={() => void showDiff(record)}><FileDiff size={15}/>{loadingDiffId === record.id ? "正在读取…" : diff?.record.id === record.id ? "收起 diff" : "查看 diff"}</Button><Button type="button" variant="secondary" disabled={restoring} onClick={() => setConfirming(record)}><RotateCcw size={15}/>恢复此版本</Button></div>{diff?.record.id === record.id && <div className="supabase-history-diff"><p><strong>历史导出：</strong>{new Date(diff.record.preview.exportedAt).toLocaleString("zh-CN")}　<strong>卡片重合：</strong>{diff.record.preview.cardConflicts} 张</p><div className="supabase-history-table"><div><span>数据</span><span>本机</span><span>历史</span><span>变化</span></div>{diff.tables.map((table) => <div key={table.name}><span>{tableLabels[table.name] ?? table.name}</span><span>{table.local}</span><span>{table.history}</span><span className={table.delta === 0 ? "same" : table.delta > 0 ? "more" : "less"}>{table.delta > 0 ? "+" : ""}{table.delta}</span></div>)}</div></div>}</article>)}</div>}
      </div>
      {confirming && <div className="supabase-history-confirm" role="alert"><strong>恢复版本 {confirming.version}？</strong><p>会先将当前本机完整数据保存为新的云端历史，再用此版本替换本机，并将恢复结果同步为最新云端版本。</p><div className="form-actions"><Button type="button" variant="ghost" disabled={restoring} onClick={() => setConfirming(null)}>取消</Button><Button type="button" variant="warning" disabled={restoring} onClick={() => void restore()}><RotateCcw size={16}/>{restoring ? "正在恢复…" : "确认恢复"}</Button></div></div>}
    </section>
  </div>;
}

export function SupabaseHistoryButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => { setTarget(document.querySelector(".supabase-sync-panel .supabase-account + .form-actions")); }, []);
  return target ? createPortal(<Button type="button" className="supabase-history-trigger" variant="outline" disabled={disabled} onClick={onClick}><History size={16}/>同步记录</Button>, target) : null;
}
