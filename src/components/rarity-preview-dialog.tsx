"use client";

import { useEffect } from "react";
import { Layers3, MousePointerClick, Sparkles, X } from "lucide-react";
import { rarityPresetOptions, stabilityRarityRange, stabilityRarityTiers, type StabilityRarityPreset } from "@/lib/card-tiers";

export function RarityPreviewDialog({ preset, onClose }: { preset: StabilityRarityPreset; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const selectedPreset = rarityPresetOptions.find((option) => option.id === preset)!;
  return <div className="rarity-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="rarity-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="rarity-preview-title" aria-describedby="rarity-preview-description">
      <button className="icon-close" type="button" onClick={onClose} aria-label="关闭 Stability 稀有度说明"><X size={19}/></button>
      <div className="rarity-preview-heading">
        <div className="rarity-preview-icon"><Layers3 size={23}/></div>
        <div><p className="eyebrow"><Sparkles size={15}/> Stability 稀有度</p><h2 id="rarity-preview-title">记忆越稳定，卡片越稀有</h2><p id="rarity-preview-description">当前采用“{selectedPreset.name}”：{selectedPreset.description} 稀有度只呈现学习成果，不会改变 FSRS 排程。</p></div>
      </div>
      <div className="rarity-preview-grid" aria-label="五种 Stability 稀有度效果预览">
        {stabilityRarityTiers.map((tier) => <article className={`rarity-preview-card rarity-preview-${tier.label.toLowerCase()}`} key={tier.label}>
          <div className="rarity-preview-top"><span className={`rarity-emblem rarity-${tier.label.toLowerCase()}`}>{tier.label}<small>{stabilityRarityRange(tier.label, preset)}</small></span><span>{tier.name}</span></div>
          <p>{tier.description}</p>
        </article>)}
      </div>
      <p className="rarity-preview-tip"><MousePointerClick size={17}/> 点击卡片顶部中央的稀有度刘海，可随时重新打开说明；UR 卡片支持一次低调的悬停流光。</p>
    </section>
  </div>;
}
