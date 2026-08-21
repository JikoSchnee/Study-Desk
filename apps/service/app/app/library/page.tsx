"use client";

import { useEffect, useState } from "react";
import { LoadingCard, Notice, WebShell } from "../web-shell";
import { webFetch } from "../web-client";

type Card = { id: string; question: string; note: string; knowledgeBaseId: string; updatedAt: string };
type Library = { knowledgeBases: Array<{ id: string; name: string; description: string; cardCount: number }>; cards: Card[]; readOnly: boolean; empty: boolean };
export default function LibraryPage() {
  const [data, setData] = useState<Library | null>(null); const [selected, setSelected] = useState<Card | null>(null); const [note, setNote] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { webFetch<Library>("web/library").then(setData).catch((error) => setMessage(error.message)); }, []);
  function choose(card: Card) { setSelected(card); setNote(card.note); setMessage(""); }
  async function save() { if (!selected) return; try { const response = await webFetch<{ result: { card: Card } }>(`web/cards/${selected.id}/note`, { method: "PATCH", body: JSON.stringify({ note, expectedUpdatedAt: selected.updatedAt }) }); setSelected(response.result.card); setMessage("笔记已安全保存到云端。"); } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); } }
  return <WebShell title="我的知识库" eyebrow="来自桌面端云同步"><div className="web-two-column"><section>{!data && !message && <LoadingCard />}{message && !data && <Notice kind="warn">{message}</Notice>}{data?.empty && <Notice>请先在桌面端创建知识库并同步，浏览器端不会创建或改变知识库结构。</Notice>}{data?.knowledgeBases.map((base) => <article className="library-group" key={base.id}><header><div><h2>{base.name}</h2><p>{base.description || "没有简介"}</p></div><span>{base.cardCount} 张</span></header><div>{data.cards.filter((card) => card.knowledgeBaseId === base.id).map((card) => <button className={selected?.id === card.id ? "selected" : ""} onClick={() => choose(card)} key={card.id}>{card.question}<i>›</i></button>)}</div></article>)}</section><aside className="note-editor">{selected ? <><small>卡片笔记</small><h2>{selected.question}</h2><textarea value={note} onChange={(event) => setNote(event.target.value)} readOnly={data?.readOnly} placeholder="记录自己的理解、例子或易错点…" /><button className="web-primary" disabled={data?.readOnly} onClick={save}>保存笔记</button>{data?.readOnly && <p>当前处于只读状态，续费后才能保存。</p>}{message && <output>{message}</output>}</> : <div className="empty-selection"><b>✎</b><p>选择一张卡片查看并修改笔记</p></div>}</aside></div></WebShell>;
}
