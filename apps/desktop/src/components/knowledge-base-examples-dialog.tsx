"use client";

import { Fragment, useEffect } from "react";
import { LayoutGrid, Sparkles, X } from "lucide-react";
import { KnowledgeCardFrame } from "@/components/knowledge-card-frame";
import { difficultyTiers, rarityPresetOptions, stabilityRarityTiers, type StabilityRarityPreset } from "@/lib/card-tiers";
import { knowledgeBaseExamples } from "@/lib/knowledge-base-examples";

export function KnowledgeBaseExamplesDialog({ preset, onClose }: { preset: StabilityRarityPreset; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const examples = knowledgeBaseExamples(preset);
  const presetName = rarityPresetOptions.find((option) => option.id === preset)!.name;

  return <div className="knowledge-examples-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="knowledge-examples-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-examples-title" aria-describedby="knowledge-examples-description">
      <button className="icon-close" type="button" onClick={onClose} aria-label="关闭知识库示例"><X size={19}/></button>
      <div className="knowledge-examples-heading">
        <div className="knowledge-examples-icon"><LayoutGrid size={23}/></div>
        <div><p className="eyebrow"><Sparkles size={15}/> 静态视觉示例</p><h2 id="knowledge-examples-title">知识库示例</h2><p id="knowledge-examples-description">以当前“{presetName}”方案展示 4 种难度与 5 种 Stability 稀有度的全部组合。它们只存在于此处，不会写入或影响你的知识库。</p></div>
      </div>
      <div className="knowledge-examples-scroll" aria-label="20 种卡片组合矩阵">
        <div className="knowledge-examples-matrix">
          <div className="knowledge-examples-corner">难度 × 稀有度</div>
          {stabilityRarityTiers.map((rarity) => <div className={`knowledge-examples-column rarity-${rarity.label.toLowerCase()}`} key={rarity.label}><strong>{rarity.label}</strong><span>{rarity.name}</span></div>)}
          {difficultyTiers.map((difficulty) => <Fragment key={difficulty.label}>
            <div className={`knowledge-examples-row difficulty-${difficulty.className}`}><strong>{difficulty.label}</strong><span>Difficulty {examples.find((example) => example.difficulty.label === difficulty.label)!.difficultyValue.toFixed(1)}</span></div>
            {examples.filter((example) => example.difficulty.label === difficulty.label).map((example) => <KnowledgeCardFrame
              key={example.id}
              compact
              tilt
              rarity={example.rarity.label}
              stability={example.stability}
              difficulty={{ label: example.difficulty.label, className: example.difficulty.className, value: example.difficultyValue }}
              topLeft={<span className="example-card-kind">只读示例</span>}
              title={`${example.difficulty.label} × ${example.rarity.label} 示例卡`}
              aria-label={`${example.difficulty.label} × ${example.rarity.label} 示例卡`}
            >
              <div className="example-card-values"><span>Difficulty <strong>{example.difficultyValue.toFixed(1)} / 10</strong></span><span>Stability <strong>{example.stability.toFixed(1)} 天</strong></span></div>
            </KnowledgeCardFrame>)}
          </Fragment>)}
        </div>
      </div>
    </section>
  </div>;
}
