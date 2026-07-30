"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, Check, FileSpreadsheet, LibraryBig, PencilLine, Play, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui";

const steps = [
  { id: "manual", icon: PencilLine, label: "手动录入", kicker: "01 · 从一题开始", title: "手动写下一张卡", detail: "填入问题、答案要点和提示；保存后，它就进入首次学习队列。" },
  { id: "batch", icon: FileSpreadsheet, label: "批量导入", kicker: "02 · 把资料带进来", title: "批量整理已有资料", detail: "上传 CSV 或 XLSX，映射字段、逐张预览，再确认导入。" },
  { id: "library", icon: LibraryBig, label: "卡片库", kicker: "03 · 随时翻出来", title: "在卡片库继续打磨", detail: "按类型和标签查找内容，查看学习轨迹，持续整理自己的知识。" },
  { id: "review", icon: BookOpenCheck, label: "学习与复习", kicker: "04 · 练成能说的话", title: "学习一次，按时复习", detail: "先理解并复述新题；之后按计划主动回忆，让知识留下来。" },
] as const;

type TutorialStepId = (typeof steps)[number]["id"];

function StepPreview({ step, animationKey }: { step: TutorialStepId; animationKey: number }) {
  return <div className={`home-tutorial-preview ${step}`} key={`${step}-${animationKey}`} aria-hidden="true">
    {step === "manual" && <div className="mini-window mini-manual">
      <div className="mini-window-bar"><span /><span /><span /><b>创建卡片</b></div>
      <div className="mini-form-row"><i>问题</i><strong>什么是 JVM 内存模型？</strong></div>
      <div className="mini-answer-points"><span><b>1</b><i /></span><span><b>2</b><i /></span><span><b>3</b><i /></span></div>
      <div className="mini-save"><Check size={14} strokeWidth={3} /> 保存并加入学习</div>
      <div className="mini-pencil"><PencilLine size={20} /></div>
    </div>}
    {step === "batch" && <div className="mini-window mini-batch">
      <div className="mini-window-bar"><span /><span /><span /><b>文件导入</b></div>
      <div className="mini-file"><FileSpreadsheet size={34} /><strong>后端基础.csv</strong><small>24 张待整理卡片</small></div>
      <div className="mini-import-steps"><span className="done">1</span><i /><span className="done">2</span><i /><span>3</span></div>
      <div className="mini-import-confirm"><Check size={14} strokeWidth={3} /> 确认导入 24 张</div>
      <div className="mini-batch-cards"><i /><i /><i /></div>
    </div>}
    {step === "library" && <div className="mini-window mini-library">
      <div className="mini-window-bar"><span /><span /><span /><b>我的卡片库</b></div>
      <div className="mini-search"><span>⌕</span><i>搜索卡片…</i><b>Java 后端⌄</b></div>
      <div className="mini-library-list"><div><em>JVM</em><strong>垃圾回收有哪些算法？</strong><small>3 个答案要点</small></div><div><em>SQL</em><strong>索引为什么会失效？</strong><small>2 天后复习</small></div><div><em>网络</em><strong>TCP 三次握手</strong><small>已学习</small></div></div>
      <div className="mini-library-cursor" />
    </div>}
    {step === "review" && <div className="mini-window mini-review">
      <div className="mini-window-bar"><span /><span /><span /><b>今日学习</b></div>
      <div className="mini-question"><small>首次学习 · 1 / 3</small><strong>为什么需要索引？</strong></div>
      <div className="mini-recall"><span>提示</span><i>缩小扫描范围，减少磁盘 I/O</i></div>
      <div className="mini-review-path"><div><Check size={14} strokeWidth={3} /><span>首次学习</span></div><i /><div><RefreshCw size={14} strokeWidth={3} /><span>按时复习</span></div></div>
      <div className="mini-stars">✦ ✦ ✦</div>
    </div>}
  </div>;
}

export function HomeTutorialDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const step = steps[index];
  const StepIcon = step.icon;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setAnimationKey((value) => value + 1);
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || reducedMotion) return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % steps.length);
      setAnimationKey((value) => value + 1);
    }, 4300);
    return () => window.clearInterval(timer);
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((value) => (value + 1) % steps.length);
      if (event.key === "ArrowLeft") setIndex((value) => (value - 1 + steps.length) % steps.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const selectStep = (nextIndex: number) => {
    setIndex(nextIndex);
    setAnimationKey((value) => value + 1);
  };
  const restart = () => {
    setIndex(0);
    setAnimationKey((value) => value + 1);
  };

  return <div className="home-tutorial-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="home-tutorial-dialog" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="home-tutorial-title" aria-describedby="home-tutorial-description">
      <button className="icon-close home-tutorial-close" type="button" aria-label="关闭基础教程" onClick={onClose}><X size={20} /></button>
      <div className="home-tutorial-heading">
        <p className="eyebrow"><Play size={15} fill="currentColor" /> 基础教程 · 缩略流程</p>
        <h2 id="home-tutorial-title">把知识变成<br />随时能说的话。</h2>
        <p id="home-tutorial-description">不用真的导入或创建卡片，花一分钟看看一张题目如何走完训练路径。</p>
      </div>
      <div className="home-tutorial-stage">
        <div className="home-tutorial-copy" aria-live="polite">
          <p>{step.kicker}</p>
          <div className="home-tutorial-copy-title"><span><StepIcon size={20} /></span><h3>{step.title}</h3></div>
          <p>{step.detail}</p>
        </div>
        <StepPreview step={step.id} animationKey={animationKey} />
      </div>
      <div className="home-tutorial-footer">
        <div className="home-tutorial-steps" role="tablist" aria-label="教程步骤">
          {steps.map((item, itemIndex) => {
            const Icon = item.icon;
            return <button type="button" key={item.id} className={itemIndex === index ? "active" : ""} role="tab" aria-selected={itemIndex === index} aria-label={`查看${item.label}`} onClick={() => selectStep(itemIndex)}><span><Icon size={16} /></span><b>{item.label}</b></button>;
          })}
        </div>
        <Button type="button" variant="ghost" className="tutorial-restart" onClick={restart}><RefreshCw size={16} /> 重新播放</Button>
      </div>
      <p className="home-tutorial-note">{reducedMotion ? "已根据系统设置暂停自动播放；可手动切换步骤。" : "自动播放中 · 可使用 ← → 键切换步骤"}</p>
    </section>
  </div>;
}
