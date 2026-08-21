"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingCard, Notice, WebShell, membershipLabel } from "./web-shell";
import { webFetch } from "./web-client";

type Bootstrap = { membership: { state: string; canWriteCloud: boolean; trialAvailable: boolean }; cloud: { available: boolean; knowledgeBases: number; cards: number; due: number; updatedAt: string | null } };
export default function WebDashboard() {
  const [data, setData] = useState<Bootstrap | null>(null); const [error, setError] = useState("");
  useEffect(() => { webFetch<Bootstrap>("web/bootstrap").then(setData).catch((reason) => setError(reason.message)); }, []);
  return <WebShell title="今天学什么？" eyebrow="你的学习桌">
    {error && <Notice kind="warn">{error}</Notice>}{!data && !error && <LoadingCard />}
    {data && <><section className="web-hero-card"><div><span className="web-streak">学习进度</span><h2>{data.cloud.due ? `有 ${data.cloud.due} 张卡片等你复习` : "今天的复习已经完成"}</h2><p>{data.cloud.available ? `云端有 ${data.cloud.knowledgeBases} 个知识库、${data.cloud.cards} 张卡片。` : "请先在桌面端创建知识库并完成一次云同步。"}</p><Link className="web-primary" href={data.cloud.available ? "/app/review" : "/#download"}>{data.cloud.available ? "开始练习" : "下载桌面端"}</Link></div><div className="hero-score"><strong>{data.cloud.due}</strong><span>待复习</span></div></section>
    <div className="web-stat-grid"><article><small>账号状态</small><strong>{membershipLabel(data.membership.state)}</strong><p>{data.membership.canWriteCloud ? "可以读取和保存云端进度" : "自建知识库当前不可写"}</p></article><article><small>知识库</small><strong>{data.cloud.knowledgeBases}</strong><p>来自桌面端云同步</p></article><article><small>卡片</small><strong>{data.cloud.cards}</strong><p>浏览器仅支持修改笔记</p></article></div>
    {!data.membership.canWriteCloud && <Notice kind="warn">免费账号仍可练习免费或已购社区知识库。自建内容需要开始试用或充值会员。 <Link href="/app/settings">查看会员</Link></Notice>}</>}
  </WebShell>;
}
