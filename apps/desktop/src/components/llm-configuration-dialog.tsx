"use client";

import Link from "next/link";
import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui";

export function LLMConfigurationDialog({ open, onClose, purpose = "此功能" }: { open: boolean; onClose: () => void; purpose?: string }) {
  if (!open) return null;
  return <div className="llm-config-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="llm-config-dialog" role="dialog" aria-modal="true" aria-labelledby="llm-config-title">
      <button type="button" className="icon-close" aria-label="关闭提示" onClick={onClose}><X size={18}/></button>
      <div className="llm-config-icon"><KeyRound size={24}/></div>
      <p className="eyebrow">需要模型服务</p>
      <h2 id="llm-config-title">先配置 LLM，才能使用{purpose}。</h2>
      <p>请在设置中选择服务商和具体模型，并保存对应的 API Key。配置只保存在本机。</p>
      <div className="form-actions"><Button type="button" variant="ghost" onClick={onClose}>暂不配置</Button><Link href="/settings"><Button><KeyRound size={16}/> 去配置</Button></Link></div>
    </section>
  </div>;
}
