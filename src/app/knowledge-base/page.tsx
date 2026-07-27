"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, CircleCheckBig, FilePenLine, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Chip, EmptyState, Panel } from "@/components/ui";

type ProposalStatus = "pending" | "confirmed" | "completed";
type Proposal = { id: string; cardId: string; question: string; targetPath: string; status: ProposalStatus; summary: string[]; block: string; createdAt: string; confirmedAt: string | null; completedAt: string | null };

export default function KnowledgeBasePage() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useMemo(() => proposals?.filter((item) => item.status === "pending") ?? [], [proposals]);

  const analyze = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/knowledge-base/analyze");
      const data = await response.json() as { proposals: Proposal[]; error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "无法保存分析建议。");
      setProposals(data.proposals);
      setSelected(data.proposals.filter((item) => item.status === "pending").map((item) => item.id));
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法保存分析建议。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { analyze(); }, [analyze]);

  const confirm = async () => {
    if (!selected.length) return;
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge-base/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected }) });
      const data = await response.json() as { confirmed?: number; error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "确认失败。");
      await analyze();
      setNotice(`已确认 ${data.confirmed ?? 0} 条建议。请在 Obsidian 中手动修改对应笔记。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "确认失败。"); }
    finally { setLoading(false); }
  };

  const complete = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge-base/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "状态更新失败。");
      await analyze();
      setNotice("已记录为手动完成；原笔记从未由本应用改动。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "状态更新失败。"); }
    finally { setLoading(false); }
  };

  const copy = async (proposal: Proposal) => {
    try {
      await navigator.clipboard.writeText(proposal.block.trim());
      setNotice(`已复制“${proposal.question}”的修改建议。`);
    } catch { setNotice("复制失败，请直接从下方建议内容手动复制。"); }
  };

  const toggleAll = (checked: boolean) => setSelected(checked ? pending.map((item) => item.id) : []);

  if (proposals === null) return <div className="loading">正在保存你的 Agent 知识建议…</div>;
  return <><header className="page-header"><div><p className="eyebrow"><FilePenLine size={15}/> Obsidian 知识库</p><h1>让学过的内容留下来。</h1><p>建议会先保存，原文只由你在 Obsidian 中手动修改。</p></div><Button variant="ghost" onClick={analyze} disabled={loading}><RefreshCw size={17}/> 重新分析</Button></header>{notice && <div className="notice" role="status" style={{ marginBottom: 20 }}>{notice}</div>}<Panel><div className="section-title"><div><p className="eyebrow"><ShieldCheck size={15}/> 审核队列</p><h2>待维护建议</h2></div><Button disabled={!selected.length || loading} onClick={confirm}><Check size={17}/> 确认待手动修改 {selected.length} 条</Button></div><p className="muted-copy">分析结果会保存在本地。确认只记录审核状态，不会写入 Obsidian、创建备份或提交 Git。</p>{pending.length > 0 && <label className="proposal-selection"><input type="checkbox" checked={selected.length === pending.length} onChange={(event) => toggleAll(event.target.checked)} /> 全选待确认建议</label>}{proposals.length ? <div>{proposals.map((proposal) => <article className="proposal" key={proposal.id}><div className="proposal-header"><label><input type="checkbox" disabled={proposal.status !== "pending"} checked={selected.includes(proposal.id)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, proposal.id] : items.filter((id) => id !== proposal.id))} /> <strong>{proposal.question}</strong></label><Chip tone={proposal.status === "pending" ? "green" : "ink"}>{proposal.status === "pending" ? "待确认" : proposal.status === "confirmed" ? "已确认，待手动修改" : "已手动完成"}</Chip></div><p>建议位置：{proposal.targetPath}</p><code>{proposal.block}</code>{proposal.status === "confirmed" && <div className="proposal-actions"><Button type="button" variant="ghost" onClick={() => copy(proposal)}><ClipboardCopy size={16}/> 复制修改内容</Button><Button type="button" variant="secondary" disabled={loading} onClick={() => complete(proposal.id)}><CircleCheckBig size={16}/> 标记已手动完成</Button></div>}</article>)}</div> : <EmptyState title="还没有待确认的建议" detail="先创建或导入 Agent 相关知识卡片。" />}</Panel></>;
}
