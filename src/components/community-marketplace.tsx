"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, BookOpen, Check, ChevronRight, Clock3, Crown, FileCheck2, LockKeyhole, Search, ShieldCheck, Sparkles, Star, Store, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui";
import { communityCatalog, formatCommunityPrice, productLabel, type CommunityKnowledgeBase, type CommunityProduct } from "@/lib/community";
import { fetchJson } from "@/lib/client-api";

type CommunityView = "market" | "owned" | "creator";

function KnowledgeBaseCard({ item, onSelect }: { item: CommunityKnowledgeBase; onSelect: (item: CommunityKnowledgeBase) => void }) {
  const lowest = item.products.reduce<CommunityProduct | undefined>((best, product) => !best || product.priceCents < best.priceCents ? product : best, undefined);
  return <article className={`community-card accent-${item.accent}`}>
    <div className="community-card-art" aria-hidden="true"><span>{item.category.slice(0, 1)}</span><i/><i/><i/></div>
    <div className="community-card-copy">
      <div className="community-card-topline"><span>{item.category} · {item.level}</span><span><Star size={13} fill="currentColor"/> {item.rating}</span></div>
      <h2>{item.title}</h2>
      <p>{item.summary}</p>
      <div className="community-author"><span>{item.author.name}</span>{item.author.verified && <BadgeCheck size={16} aria-label="认证作者"/>}</div>
      <div className="community-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="community-card-footer"><div><strong>{item.isFree ? "免费" : lowest ? `${formatCommunityPrice(lowest.priceCents)} 起` : "暂未定价"}</strong><small><BookOpen size={14}/> {item.cardCount} 张卡片 · {item.learnerCount.toLocaleString("zh-CN")} 人学习</small></div><button type="button" onClick={() => onSelect(item)} aria-label={`查看 ${item.title}`}><ChevronRight size={21}/></button></div>
    </div>
  </article>;
}

function DetailDialog({ item, onClose }: { item: CommunityKnowledgeBase; onClose: () => void }) {
  const [selectedProduct, setSelectedProduct] = useState(item.products[0]?.id ?? "free");
  const [status, setStatus] = useState<"idle" | "processing" | "done">("idle");
  const [checkoutError, setCheckoutError] = useState("");
  const selected = item.products.find((product) => product.id === selectedProduct);
  const checkout = async () => {
    if (item.isFree) return;
    setStatus("processing");
    setCheckoutError("");
    try {
      await fetchJson("/api/community/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: selectedProduct, provider: "sandbox" }), label: "创建社区订单" });
      setStatus("done");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "暂时无法创建订单。");
      setStatus("idle");
    }
  };
  return <div className="community-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="community-dialog" role="dialog" aria-modal="true" aria-labelledby="community-dialog-title">
      <button className="community-dialog-close" type="button" onClick={onClose} aria-label="关闭"><X size={20}/></button>
      <div className={`community-detail-banner accent-${item.accent}`}><div><span>{item.category}</span><strong>{item.cardCount}</strong><small>张精练卡片</small></div><ShieldCheck size={68}/></div>
      <div className="community-detail-copy"><p className="eyebrow">{item.isFree ? "开放知识" : "受保护内容"}</p><h2 id="community-dialog-title">{item.title}</h2><p>{item.summary}</p>
        <div className="community-preview"><strong>公开试读</strong>{item.previewQuestions.map((question, index) => <div key={question}><span>0{index + 1}</span><p>{question}</p>{index === 1 && !item.isFree ? <LockKeyhole size={17}/> : <ChevronRight size={17}/>}</div>)}</div>
        {!item.isFree && <div className="community-products" aria-label="购买方式">{item.products.map((product) => <label key={product.id} className={selectedProduct === product.id ? "selected" : ""}><input type="radio" name="community-product" checked={selectedProduct === product.id} onChange={() => { setSelectedProduct(product.id); setStatus("idle"); }}/><span><strong>{productLabel(product)}</strong><small>{product.kind === "author-subscription" ? `解锁 ${item.author.name} 的订阅库` : product.kind === "lifetime" ? "内容更新也持续可用" : "从支付成功时开始计算"}</small></span><b>{formatCommunityPrice(product.priceCents)}</b></label>)}</div>}
        <div className="community-protection-note"><ShieldCheck size={19}/><span>按账号在线授权 · 逐题加载 · 动态水印 · 不进入本地导出与备份</span></div>
        <div className="community-dialog-actions">{status === "done" ? <><div className="community-checkout-success"><Check size={18}/><span>模拟支付完成，权益已预览</span></div><Link href={`/community/practice/${item.id}?demoAccess=1`}><Button>开始在线练习</Button></Link></> : item.isFree ? <Link href={`/community/practice/${item.id}`}><Button><BookOpen size={17}/> 免费开始</Button></Link> : <Button onClick={() => void checkout()} disabled={!selected || status === "processing"}>{status === "processing" ? "正在创建订单…" : `确认购买 ${selected ? formatCommunityPrice(selected.priceCents) : ""}`}</Button>}{checkoutError && <span className="community-checkout-error" role="alert">{checkoutError}</span>}<small>支付后 3 天内支持无理由退款；退款后立即撤销访问。</small></div>
      </div>
    </section>
  </div>;
}

function CreatorStudio() {
  const [submitted, setSubmitted] = useState(false);
  return <section className="community-creator">
    <div className="creator-roadmap"><p className="eyebrow"><UploadCloud size={16}/> 创作者工作台</p><h2>把经验，整理成一条能走的路。</h2><p>每个付费知识库都会经过结构检查、版权确认和人工审核。平台抽成 20%，其余收入进入作者分账账户。</p><ol><li className="active"><span>1</span><div><strong>建立知识库</strong><small>填写主题、受众和学习目标</small></div></li><li><span>2</span><div><strong>完善内容</strong><small>至少 10 张可练习卡片</small></div></li><li><span>3</span><div><strong>提交审核</strong><small>人工审核版权与内容质量</small></div></li></ol></div>
    <form className="creator-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}><div className="creator-form-heading"><FileCheck2 size={24}/><div><h2>创建投稿</h2><p>先保存基础信息，内容可稍后逐步完善。</p></div></div><label className="field">知识库名称<input required placeholder="例如：数据分析案例训练"/></label><div className="form-grid two"><label className="field">分类<select defaultValue="技术面试"><option>技术面试</option><option>产品面试</option><option>通用能力</option><option>行业知识</option></select></label><label className="field">访问方式<select defaultValue="审核后付费"><option>免费开放</option><option>审核后付费</option></select></label></div><label className="field">学习目标<textarea required rows={4} placeholder="学习者完成后，应该能够清楚回答什么？"/></label><label className="creator-rights"><input required type="checkbox"/><span>我确认拥有所提交内容的合法权利，并同意平台审核、分账与侵权处理规则。</span></label>{submitted && <div className="creator-saved"><Check size={18}/> 草稿已在当前演示会话中保存</div>}<Button type="submit">保存投稿草稿</Button></form>
  </section>;
}

export function CommunityMarketplace() {
  const [view, setView] = useState<CommunityView>("market");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState<CommunityKnowledgeBase | null>(null);
  const categories = ["全部", ...new Set(communityCatalog.map((item) => item.category))];
  const visible = useMemo(() => communityCatalog.filter((item) => (category === "全部" || item.category === category) && `${item.title}${item.summary}${item.author.name}${item.tags.join("")}`.toLowerCase().includes(query.trim().toLowerCase())), [category, query]);
  return <div className="community-page">
    <header className="community-hero"><div><p className="eyebrow"><Sparkles size={16}/> Study Desk 社区</p><h1>好知识，不只收藏。<br/><em>练成自己的。</em></h1><p>由真实创作者整理的知识路径。先试读，再决定；购买后始终按账号在线学习。</p><div className="community-trust"><span><ShieldCheck size={17}/> 先审后发</span><span><Clock3 size={17}/> 3 天无理由退款</span><span><Crown size={17}/> 作者获得 80%</span></div></div><div className="community-hero-stack" aria-hidden="true"><div><b>答</b><span>把复杂问题<br/>说得清楚</span></div><div><b>练</b><span>86 张<br/>系统设计卡</span></div><div><b>懂</b><span>来自经验<br/>不是题库堆砌</span></div></div></header>
    <nav className="community-tabs" aria-label="社区功能"><button className={view === "market" ? "active" : ""} onClick={() => setView("market")}><Store size={18}/> 发现知识库</button><button className={view === "owned" ? "active" : ""} onClick={() => setView("owned")}><BookOpen size={18}/> 我的学习</button><button className={view === "creator" ? "active" : ""} onClick={() => setView("creator")}><UploadCloud size={18}/> 创作者中心</button></nav>
    {view === "market" && <><div className="community-controls"><label><Search size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索主题、作者或标签" aria-label="搜索知识库"/></label><div>{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></div><section className="community-feature-strip"><div><span>本周精选</span><strong>从一道问题，进入一套思考方式。</strong></div><p>所有付费库都能先看目录和试读题。内容只在获得授权的账号中逐题加载。</p></section><div className="community-grid">{visible.map((item) => <KnowledgeBaseCard key={item.id} item={item} onSelect={setSelected}/>)}</div>{visible.length === 0 && <div className="community-empty"><Search size={34}/><h2>没有找到相符的知识库</h2><p>换一个关键词或分类试试看。</p></div>}</>}
    {view === "owned" && <section className="community-owned"><div className="owned-orbit"><BookOpen size={34}/></div><p className="eyebrow">我的在线书架</p><h2>登录后，在这里继续你的付费学习。</h2><p>权益与账号绑定，不会复制进本地知识库。桌面端和 Web 端使用同一账号读取学习进度。</p><div><Button onClick={() => setView("market")}>浏览知识库</Button><Button variant="outline" onClick={() => setSelected(communityCatalog[1])}>体验免费内容</Button></div></section>}
    {view === "creator" && <CreatorStudio/>}
    <footer className="community-footer"><span><ShieldCheck size={17}/> 受保护内容不会进入分享包、备份或离线导出</span><span>社区服务 MVP · 正式支付等待商户资质</span></footer>
    {selected && <DetailDialog item={selected} onClose={() => setSelected(null)}/>}
  </div>;
}
