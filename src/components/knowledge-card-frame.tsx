import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import type { StabilityRarityLabel } from "@/lib/card-tiers";
import { beginCardTilt, resetCardTilt, updateCardTilt } from "@/lib/card-tilt";
import { Panel } from "@/components/ui";

type DifficultyBadge = {
  label: string;
  className: string;
  value: number;
};

export function KnowledgeCardDifficultyBadge({ difficulty }: { difficulty: DifficultyBadge }) {
  return <span className={`difficulty-badge difficulty-${difficulty.className}`} title={`FSRS Difficulty ${difficulty.value.toFixed(1)} / 10`}>
    {difficulty.label}<small>{difficulty.value.toFixed(1)}</small>
  </span>;
}

export function KnowledgeCardRarityNotch({ rarity, stability, onClick, ariaLabel }: { rarity: StabilityRarityLabel; stability: number; onClick?: () => void; ariaLabel?: string }) {
  const content = <>{rarity}<small>{stability.toFixed(1)}d</small></>;
  const title = `Stability ${stability.toFixed(1)} 天`;

  if (!onClick) return <span className="rarity-notch rarity-notch-static" title={title}>{content}</span>;
  return <button className="rarity-notch" type="button" title={title} aria-label={ariaLabel} onClick={(event) => { event.stopPropagation(); onClick(); }}>{content}</button>;
}

type KnowledgeCardFrameProps = Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> & {
  rarity: StabilityRarityLabel;
  stability: number;
  difficulty: DifficultyBadge | null;
  topLeft?: ReactNode;
  indicators?: ReactNode;
  title: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
  wrapContent?: boolean;
  tilt?: boolean;
  onRarityClick?: () => void;
  rarityAriaLabel?: string;
  children: ReactNode;
};

export const KnowledgeCardFrame = forwardRef<HTMLElement, KnowledgeCardFrameProps>(function KnowledgeCardFrame({
  rarity,
  stability,
  difficulty,
  topLeft,
  indicators,
  title,
  footer,
  compact = false,
  wrapContent = true,
  tilt = false,
  onRarityClick,
  rarityAriaLabel,
  className = "",
  children,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  ...props
}, ref) {
  return <Panel ref={ref} className={`knowledge-card rarity-${rarity.toLowerCase()}${compact ? " knowledge-card-compact" : ""} ${className}`} onPointerEnter={(event) => { if (tilt) beginCardTilt(event); onPointerEnter?.(event); }} onPointerMove={(event) => { if (tilt) updateCardTilt(event); onPointerMove?.(event); }} onPointerLeave={(event) => { if (tilt) resetCardTilt(event); onPointerLeave?.(event); }} {...props}>
    <KnowledgeCardRarityNotch rarity={rarity} stability={stability} onClick={onRarityClick} ariaLabel={rarityAriaLabel}/>
    <div className="knowledge-card-top">
      {topLeft ?? <span/>}
      <div className="card-indicators">
        {indicators}
        {difficulty && <KnowledgeCardDifficultyBadge difficulty={difficulty}/>}
      </div>
    </div>
    <h3>{title}</h3>
    {wrapContent ? <div className="knowledge-card-scroll-content">{children}</div> : children}
    {footer}
  </Panel>;
});
