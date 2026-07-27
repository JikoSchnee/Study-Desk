"use client";

import { useEffect } from "react";
import { Layers3, MousePointerClick, Sparkles, X } from "lucide-react";

const rarityTiers = [
  { label: "N", name: "Normal", range: "1.0–2.7", description: "石墨灰纸卡质感，安静呈现已掌握的基础内容。" },
  { label: "R", name: "Rare", range: "2.8–4.5", description: "稀有蓝搭配微金属边缘，提示需要多一次巩固。" },
  { label: "SR", name: "Super Rare", range: "4.6–6.3", description: "能量紫与内高光，用于需要主动回忆的知识点。" },
  { label: "SSR", name: "Super Special Rare", range: "6.4–8.1", description: "琥珀金标签，更醒目地标出高难度卡片。" },
  { label: "UR", name: "Ultra Rare", range: "8.2–10.0", description: "白金边缘与虹彩镭射；悬停标签会掠过一次流光。" },
] as const;

export function DifficultyPreviewDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="difficulty-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="difficulty-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="difficulty-preview-title" aria-describedby="difficulty-preview-description">
      <button className="icon-close" type="button" onClick={onClose} aria-label="关闭难度标签预览"><X size={19}/></button>
      <div className="difficulty-preview-heading">
        <div className="difficulty-preview-icon"><Layers3 size={23}/></div>
        <div><p className="eyebrow"><Sparkles size={15}/> 卡片难度标签</p><h2 id="difficulty-preview-title">五档稀有度，一眼看懂难点</h2><p id="difficulty-preview-description">难度来自 FSRS 的学习模型；标签颜色只帮助你快速识别，不会改变排程。</p></div>
      </div>
      <div className="rarity-preview-grid" aria-label="五种难度标签效果预览">
        {rarityTiers.map((tier) => <article className={`rarity-preview-card rarity-preview-${tier.label.toLowerCase()}`} key={tier.label}>
          <div className="rarity-preview-top"><span className={`difficulty-badge difficulty-preview-swatch difficulty-${tier.label.toLowerCase()}`}>{tier.label}<small>{tier.range}</small></span><span>{tier.name}</span></div>
          <p>{tier.description}</p>
        </article>)}
      </div>
      <p className="difficulty-preview-tip"><MousePointerClick size={17}/> 点击任意卡片上的难度标签，可随时重新打开此预览；UR 标签支持一次低调的悬停流光。</p>
    </section>
  </div>;
}
