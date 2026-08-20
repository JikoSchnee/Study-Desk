"use client";

import type { AnswerComparisonMode } from "@/lib/types";
import { LLMConfigurationDialog } from "@/components/llm-configuration-dialog";
import { useState } from "react";

const confirmationKey = "mock-interview:llm-comparison-confirmed";

export function ComparisonModeControl({ mode, onChange, llmConfigured, compact = false }: { mode: AnswerComparisonMode; onChange: (mode: AnswerComparisonMode) => void; llmConfigured: boolean; compact?: boolean }) {
  const [needsConfiguration, setNeedsConfiguration] = useState(false);
  const choose = (next: AnswerComparisonMode) => {
    if (next === "llm" && !llmConfigured) { setNeedsConfiguration(true); return; }
    if (next === "llm" && !window.localStorage.getItem(confirmationKey)) {
      const accepted = window.confirm("LLM 比对会将这张卡片的参考答案和你的本次回答发送给当前配置的模型服务商，用于判断要点覆盖。是否继续？");
      if (!accepted) return;
      window.localStorage.setItem(confirmationKey, "true");
    }
    onChange(next);
  };
  return <><div className={`comparison-mode-control ${compact ? "compact" : ""}`} aria-label="答案比对模式"><span>比对方式</span><div role="group" aria-label="选择答案比对方式"><button type="button" className={mode === "embedding" ? "selected" : ""} onClick={() => choose("embedding")}>本地语义</button><button type="button" className={mode === "llm" ? "selected" : ""} onClick={() => choose("llm")} title={llmConfigured ? "使用当前配置的模型判断" : "需要先配置模型服务"}>LLM 判断</button></div>{mode === "llm" && <small>将发送给当前服务商</small>}</div><LLMConfigurationDialog open={needsConfiguration} onClose={() => setNeedsConfiguration(false)} purpose="LLM 答案判断" /></>;
}
