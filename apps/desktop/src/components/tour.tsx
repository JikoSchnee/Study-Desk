"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Compass, X } from "lucide-react";
import { Button } from "@/components/ui";

type Step = { selector: string; title: string; detail: string };
export type TourId = "today" | "cards" | "library" | "review" | "interview" | "knowledge";

const tours: Record<TourId, Step[]> = {
  today: [
    { selector: '[data-tour="today-summary"]', title: "今天的全景", detail: "这里汇总待复习、今日完成和任务进度。" },
    { selector: '[data-tour="home-tutorial"]', title: "基础教程", detail: "随时从这里重新走一遍录入到首次学习的最短路径。" },
    { selector: '[data-tour="daily-tasks"]', title: "任务路径", detail: "开始任务会直达对应卡片；完成首学或真实复习后进度自动同步。" },
    { selector: '[data-tour="training-calendar"]', title: "训练日历", detail: "按日期查看计划完成情况，持续练习会在这里留下轨迹。" },
  ],
  cards: [
    { selector: '[data-tour="card-composer"]', title: "手动录入", detail: "一张卡聚焦一个知识点：问题清楚、答案要点可验证。" },
    { selector: '[data-tour="answer-points"]', title: "答案要点与提示", detail: "把答案拆开，后续比对才能指出具体遗漏。" },
    { selector: '[data-tour="card-save"]', title: "保存并学习", detail: "保存后卡片进入首次学习队列；也可以从文件导入已有资料。" },
  ],
  library: [
    { selector: '[data-tour="library-filters"]', title: "查找卡片", detail: "按关键词、类型、标签和学习状态筛选你的内容。" },
    { selector: '[data-tour="library-selection"]', title: "批量管理", detail: "选择多张卡片后，可归档、恢复、移动类型、添加标签或导出。" },
    { selector: '[data-tour="library-card"]', title: "查看学习轨迹", detail: "打开卡片详情可回放作答、得分和 FSRS 复习间隔。" },
  ],
  review: [
    { selector: '[data-tour="review-initial"]', title: "选择学习队列", detail: "首次学习、到期复习和薄弱复习彼此独立；完成目标后仍可继续练。" },
    { selector: '[data-tour="review-answer"]', title: "作答与提示", detail: "先回答，再看提示。⌘/Ctrl + Enter 可以快速提交。" },
    { selector: '[data-tour="review-rating"]', title: "确认记忆状态", detail: "这是每次练习必经的一步；完成后可按需展开可选回流操作。" },
  ],
  interview: [{ selector: '[data-tour="interview-start"]', title: "开始模拟", detail: "问题来自你的卡片，回答会被记录到本场报告。" }, { selector: '[data-tour="interview-followup"]', title: "AI 拓展追问", detail: "完成原题后可让 LLM 针对回答生成一条追问；报告会清晰标注。" }, { selector: '[data-tour="interview-report"]', title: "复盘报告", detail: "模拟结束后查看逐题反馈和遗漏要点，把薄弱点带回训练。" }],
  knowledge: [{ selector: '[data-tour="knowledge-analysis"]', title: "分析建议", detail: "应用根据你的卡片生成需要补充或维护的知识库建议。" }, { selector: '[data-tour="knowledge-review"]', title: "审核后手动修改", detail: "先确认，再复制到 Obsidian 手动修改；应用不会写入原笔记。" }],
};

type TourContextValue = { startTour: (id: TourId) => void; activeId: TourId | null };
const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const value = useContext(TourContext);
  if (!value) throw new Error("useTour 必须在 TourProvider 内使用");
  return value;
}

export function TourButton({ tour, label = "本页教程", iconOnly = false }: { tour: TourId; label?: string; iconOnly?: boolean }) {
  const { startTour } = useTour();
  return <Button type="button" variant="ghost" className={`tour-trigger ${iconOnly ? "icon-only" : ""}`} data-tooltip={iconOnly ? label : undefined} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} onClick={() => startTour(tour)}><Compass size={17}/>{!iconOnly && label}</Button>;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [activeId, setActiveId] = useState<TourId | null>(null); const [index, setIndex] = useState(0); const [rect, setRect] = useState<DOMRect | null>(null); const targetRef = useRef<HTMLElement | null>(null); const targetContainerRef = useRef<HTMLElement | null>(null); const blockedContainersRef = useRef<HTMLElement[]>([]);
  const active = activeId ? tours[activeId] : []; const step = active[index]; const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { targetRef.current?.classList.remove("tour-target-active"); targetContainerRef.current?.classList.remove("tour-target-container"); blockedContainersRef.current.forEach((node) => node.classList.remove("tour-blocked-container")); targetRef.current = null; targetContainerRef.current = null; blockedContainersRef.current = []; setActiveId(null); setIndex(0); setRect(null); }, []);
  const startTour = useCallback((id: TourId) => { setActiveId(id); setIndex(0); }, []);
  const next = useCallback(() => {
    if (!step) return;
    if (index >= active.length - 1) close(); else setIndex(index + 1);
  }, [active.length, close, index, step]);
  useLayoutEffect(() => {
    if (!step) return;
    let settleTimer: number | undefined;
    let retryTimer: number | undefined;
    let observer: ResizeObserver | undefined;
    let attempts = 0;
    const position = (node: HTMLElement) => setRect(node.getBoundingClientRect());
    const update = (scroll = false) => {
      const node = [...document.querySelectorAll(step.selector)].find((item): item is HTMLElement => item instanceof HTMLElement && item.getClientRects().length > 0);
      if (!(node instanceof HTMLElement)) {
        setRect(null);
        if (attempts++ < 25) retryTimer = window.setTimeout(() => update(scroll), 120);
        return;
      }
      if (targetRef.current !== node) {
        targetRef.current?.classList.remove("tour-target-active"); targetContainerRef.current?.classList.remove("tour-target-container"); blockedContainersRef.current.forEach((item) => item.classList.remove("tour-blocked-container"));
        targetRef.current = node; targetContainerRef.current = node.closest(".side-nav, .bottom-nav, .page-main"); blockedContainersRef.current = [...document.querySelectorAll(".side-nav, .bottom-nav, .page-main")].filter((item): item is HTMLElement => item instanceof HTMLElement && item.getClientRects().length > 0);
        node.classList.add("tour-target-active"); blockedContainersRef.current.forEach((item) => item.classList.add("tour-blocked-container")); targetContainerRef.current?.classList.add("tour-target-container");
        observer?.disconnect(); observer = new ResizeObserver(() => position(node)); observer.observe(node);
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (scroll) node.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
      window.clearTimeout(settleTimer); settleTimer = window.setTimeout(() => position(node), reduced ? 0 : 360);
    };
    const timer = window.setTimeout(() => update(true), 100);
    const onViewportChange = () => update(false);
    window.addEventListener("resize", onViewportChange); window.addEventListener("scroll", onViewportChange, true);
    return () => { window.clearTimeout(timer); window.clearTimeout(settleTimer); window.clearTimeout(retryTimer); observer?.disconnect(); targetRef.current?.classList.remove("tour-target-active"); targetContainerRef.current?.classList.remove("tour-target-container"); blockedContainersRef.current.forEach((item) => item.classList.remove("tour-blocked-container")); blockedContainersRef.current = []; window.removeEventListener("resize", onViewportChange); window.removeEventListener("scroll", onViewportChange, true); };
  }, [pathname, step]);
  useEffect(() => { if (!activeId) return; dialogRef.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); if (event.key === "ArrowRight") next(); if (event.key === "ArrowLeft") setIndex((value) => Math.max(value - 1, 0)); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [activeId, close, next]);
  const style = useMemo(() => rect ? { top: Math.max(8, rect.top - 8), left: Math.max(8, rect.left - 8), width: rect.width + 16, height: rect.height + 16 } : undefined, [rect]);
  const dialogStyle = useMemo(() => {
    if (!rect || typeof window === "undefined") return undefined;
    const width = 320; const gap = 16;
    if (window.innerWidth - rect.right >= width + gap) return { right: gap, width };
    if (rect.left >= width + gap) return { left: gap, right: "auto", width };
    return undefined;
  }, [rect]);
  const nextLabel = index >= active.length - 1 ? "完成教程" : "下一步";
  return <TourContext.Provider value={{ startTour, activeId }}>{children}{activeId && step && <div className="tour-layer" aria-live="polite"><div className="tour-scrim"/><div className="tour-spotlight" style={style}/><div className="tour-dialog" style={dialogStyle} ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title"><button className="icon-close tour-close" type="button" aria-label="关闭教程" onClick={close}><X size={18}/></button><p className="eyebrow"><Compass size={15}/> 本页教程 · {index + 1}/{active.length}</p><h2 id="tour-title">{step.title}</h2><p>{step.detail}</p>{!rect && <small>正在定位此页内容；你仍可以继续教程。</small>}<div className="tour-actions"><Button type="button" variant="ghost" onClick={close}>跳过</Button><Button type="button" variant="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>上一步</Button><Button type="button" onClick={next}>{nextLabel}</Button></div></div></div>}</TourContext.Provider>;
}
