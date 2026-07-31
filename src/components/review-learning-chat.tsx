"use client";

import { useEffect, useState } from "react";
import { Bot, CheckSquare, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { LLMConfigurationDialog } from "@/components/llm-configuration-dialog";
import type { Card, FollowUpCardDraft } from "@/lib/types";

type ChatMessage = { role: "user" | "assistant"; content: string; cardId: string; question: string };

export function ReviewLearningChat({ card, llmConfigured, defaultOpen }: { card: Card; llmConfigured: boolean; defaultOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsConfiguration, setNeedsConfiguration] = useState(false);

  useEffect(() => { setOpen(defaultOpen); }, [card.id, defaultOpen]);

  const send = async () => {
    const message = prompt.trim();
    if (!message || busy) return;
    if (!llmConfigured) { setNeedsConfiguration(true); return; }
    const userMessage: ChatMessage = { role: "user", content: message, cardId: card.id, question: card.question };
    const history = [...messages, userMessage];
    setMessages(history); setPrompt(""); setBusy(true); setError("");
    try {
      const response = await fetch("/api/review/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", cardId: card.id, message, messages }) });
      const data = await response.json();
      if (!response.ok) { if (data.requiresConfiguration) setNeedsConfiguration(true); throw new Error(data.error ?? "学习助手暂时无法回答。"); }
      if (typeof data.message !== "string" || !data.message.trim()) throw new Error("学习助手没有返回内容，请重试。");
      setMessages([...history, { role: "assistant", content: data.message.trim(), cardId: card.id, question: card.question }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "学习助手暂时无法回答。"); }
    finally { setBusy(false); }
  };

  const createDraft = async () => {
    const chosen = messages.filter((_, index) => selected.has(index));
    if (!chosen.length || draftBusy) return;
    if (!llmConfigured) { setNeedsConfiguration(true); return; }
    setDraftBusy(true); setError("");
    try {
      const response = await fetch("/api/review/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", cardId: card.id, messages: chosen }) });
      const data = await response.json();
      if (!response.ok) { if (data.requiresConfiguration) setNeedsConfiguration(true); throw new Error(data.error ?? "暂时无法整理为卡片草稿。"); }
      const draft = data.draft as FollowUpCardDraft | undefined;
      if (!draft?.question || !Array.isArray(draft.answerPoints)) throw new Error("整理结果不完整，请重试。");
      window.localStorage.setItem("mock-interview:learning-chat-card-draft", JSON.stringify(draft));
      router.push("/library");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "暂时无法整理为卡片草稿。"); }
    finally { setDraftBusy(false); }
  };

  const toggleSelected = (index: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  return <aside className={`review-learning-chat ${open ? "open" : ""}`} aria-label="AI 学习助手">
    <LLMConfigurationDialog open={needsConfiguration} onClose={() => setNeedsConfiguration(false)} purpose="AI 学习助手" />
    <div className="review-learning-chat-heading"><div><p className="eyebrow"><Bot size={14}/> 学习助手</p><strong>围绕当前题继续追问</strong></div><button type="button" className="review-chat-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? <><X size={16}/> 收起</> : <><MessageCircle size={16}/> AI 对话</>}</button></div>
    {open && <div className="review-learning-chat-body">
      <p className="review-chat-context">当前围绕「{card.question}」答疑。勾选消息可整理为关联新卡。</p>
      <div className="review-chat-messages" aria-live="polite">
        {!messages.length && <div className="review-chat-empty"><Bot size={20}/><span>可以问概念、推导、边界或容易混淆的地方。</span></div>}
        {messages.map((item, index) => <article className={`review-chat-message ${item.role}`} key={`${index}-${item.content.slice(0, 24)}`}><label className="review-chat-select"><input type="checkbox" checked={selected.has(index)} onChange={() => toggleSelected(index)} aria-label={`选择${item.role === "user" ? "我的" : "助手的"}消息`} /><span><CheckSquare size={14}/></span></label><div><small>{item.role === "user" ? "我的提问" : "学习助手"} · {item.question}</small><p>{item.content}</p></div></article>)}
      </div>
      {selected.size > 0 && <div className="review-chat-draft-action"><span>已选 {selected.size} 条消息</span><Button type="button" variant="secondary" disabled={draftBusy} onClick={() => void createDraft()}><Sparkles size={16}/>{draftBusy ? "正在整理…" : "整理成新卡片"}</Button></div>}
      <div className="review-chat-compose"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void send(); } }} placeholder={llmConfigured ? "问问这道题的相关问题…" : "请先配置 LLM 以开始对话"} disabled={busy || !llmConfigured} rows={3} /><div><small>⌘/Ctrl + Enter 发送</small>{llmConfigured ? <Button type="button" disabled={!prompt.trim() || busy} onClick={() => void send()}><Send size={16}/>{busy ? "思考中…" : "发送"}</Button> : <Button type="button" variant="secondary" onClick={() => setNeedsConfiguration(true)}>配置 LLM</Button>}</div></div>
      {error && <p className="danger review-chat-error" role="alert">{error}</p>}
    </div>}
  </aside>;
}
