"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, FolderInput, Tag, X } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui";

type BulkEditMode = "tags" | "track";

type Props = {
  mode: BulkEditMode;
  cardCount: number;
  tags: string[];
  tracks: string[];
  onClose: () => void;
  onSubmit: (value: string | string[]) => Promise<string | null>;
};

export function BulkCardEditDialog({ mode, cardCount, tags, tracks, onClose, onSubmit }: Props) {
  const [tagValues, setTagValues] = useState<string[]>([]);
  const [track, setTrack] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isTags = mode === "tags";
  const title = isTags ? "给所选卡片添加标签" : "移动所选卡片";
  const description = isTags ? `将为 ${cardCount} 张卡片追加标签，不会移除已有标签。` : `将把 ${cardCount} 张卡片统一移动到新的知识库类型。`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = isTags ? tagValues : track.trim();
    if (!Array.isArray(value) && !value) { setError("请选择或输入知识库类型。"); return; }
    if (Array.isArray(value) && !value.length) { setError("请至少添加一个标签。"); return; }
    setBusy(true);
    setError("");
    const result = await onSubmit(value);
    if (result) { setError(result); setBusy(false); return; }
    onClose();
  };

  return <div className="bulk-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="bulk-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title" aria-describedby="bulk-edit-description" aria-busy={busy}><button className="icon-close" type="button" onClick={onClose} disabled={busy} aria-label="关闭批量编辑"><X size={19}/></button><header><span>{isTags ? <Tag size={22}/> : <FolderInput size={22}/>}</span><div><p className="eyebrow">批量编辑</p><h2 id="bulk-edit-title">{title}</h2><p id="bulk-edit-description">{description}</p></div></header><form onSubmit={submit}>{isTags ? <label className="field"><span>标签</span><SearchableSelect multiple value={tagValues} onChange={setTagValues} options={tags} placeholder="选择或输入标签" ariaLabel="添加标签" allowCustom menuPlacement="top" /></label> : <label className="field"><span>知识库类型</span><SearchableSelect value={track} onChange={setTrack} options={tracks} placeholder="选择或输入新类型" ariaLabel="移动到知识库类型" allowCustom required menuPlacement="top" /></label>}{error && <p className="bulk-edit-error" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>取消</Button><Button type="submit" disabled={busy}>{busy ? "正在更新…" : <><CheckCircle2 size={16}/>{isTags ? "添加标签" : "确认移动"}</>}</Button></div></form></section></div>;
}
