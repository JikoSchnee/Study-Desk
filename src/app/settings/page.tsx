"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, FlaskConical, KeyRound, Mic2, Save, ShieldCheck, SlidersHorizontal, Sparkles, Upload } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { DesktopUpdater } from "@/components/desktop-updater";
import { rarityPresetOptions, type StabilityRarityPreset } from "@/lib/card-tiers";
import { modelProviders, type ModelProviderId } from "@/lib/model-providers";
import type { AnswerComparisonMode } from "@/lib/types";

type EnvironmentSettings = { provider: ModelProviderId; baseUrl: string; model: string; apiKeyConfigured: boolean };
type LocalEmbeddingModelStatus = { state: "pending" | "downloading" | "verifying" | "retrying" | "ready" | "error"; onnxState: "pending" | "parsing" | "ready" | "failed"; downloadedBytes: number; totalBytes: number | null; attempt: number; error?: string };
const CUSTOM_MODEL_OPTION = "__custom_model__";

function sizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SettingsPage() {
  const [dailyInitialTarget, setDailyInitialTarget] = useState(5);
  const [dailyReviewTarget, setDailyReviewTarget] = useState(10);
  const [answerComparisonMode, setAnswerComparisonMode] = useState<AnswerComparisonMode>("embedding");
  const [stabilityRarityPreset, setStabilityRarityPreset] = useState<StabilityRarityPreset>("memory-cycle");
  const [notice, setNotice] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState<ModelProviderId>("custom");
  const [savedProvider, setSavedProvider] = useState<ModelProviderId>("custom");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [environmentNotice, setEnvironmentNotice] = useState("");
  const [savingEnvironment, setSavingEnvironment] = useState(false);
  const [backupPayload, setBackupPayload] = useState<unknown>(null);
  const [backupPreview, setBackupPreview] = useState<{ counts: Record<string, number>; cardConflicts: number } | null>(null);
  const [backupNotice, setBackupNotice] = useState("");
  const [warmingModel, setWarmingModel] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<LocalEmbeddingModelStatus>({ state: "pending", onnxState: "pending", downloadedBytes: 0, totalBytes: null, attempt: 0 });

  useEffect(() => {
    Promise.all([fetch("/api/settings").then((response) => response.json()), fetch("/api/settings/environment").then((response) => response.json())])
      .then(([settings, environment]) => {
        setDailyInitialTarget(settings.dailyInitialTarget ?? 5); setDailyReviewTarget(settings.dailyReviewTarget ?? 10); setAnswerComparisonMode(settings.answerComparisonMode === "llm" ? "llm" : "embedding"); setStabilityRarityPreset(["fast", "memory-cycle", "long-term"].includes(settings.stabilityRarityPreset) ? settings.stabilityRarityPreset : "memory-cycle");
        const config = environment as EnvironmentSettings;
        setProvider(config.provider ?? "custom"); setSavedProvider(config.provider ?? "custom"); setBaseUrl(config.baseUrl ?? ""); setModel(config.model ?? ""); setApiKeyConfigured(Boolean(config.apiKeyConfigured));
      });
  }, []);

  useEffect(() => {
    let active = true;
    const readStatus = async () => {
      try {
        const response = await fetch("/api/settings/prewarm", { cache: "no-store" });
        if (response.ok && active) setEmbeddingStatus(await response.json() as LocalEmbeddingModelStatus);
      } catch { /* The next polling pass can recover from a transient request error. */ }
    };
    void readStatus();
    const timer = window.setInterval(() => { void readStatus(); }, 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const save = async () => {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailyInitialTarget, dailyReviewTarget, answerComparisonMode, stabilityRarityPreset }) });
    setNotice("每日训练目标、答案比对与稀有度方案已保存。");
  };

  const saveEnvironment = async () => {
    setSavingEnvironment(true); setEnvironmentNotice("");
    try {
      const response = await fetch("/api/settings/environment", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, baseUrl, model, apiKey, clearApiKey }) });
      const data = await response.json() as EnvironmentSettings & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "无法保存本地环境配置。");
      setApiKey(""); setClearApiKey(false); setProvider(data.provider); setSavedProvider(data.provider); setBaseUrl(data.baseUrl); setModel(data.model); setApiKeyConfigured(data.apiKeyConfigured);
      setEnvironmentNotice("已保存到 .env.local，并应用于当前服务。API Key 不会显示在页面上。");
    } catch (error) { setEnvironmentNotice(error instanceof Error ? error.message : "无法保存本地环境配置。"); }
    finally { setSavingEnvironment(false); }
  };

  const chooseProvider = (next: ModelProviderId) => {
    setProvider(next);
    setClearApiKey(false);
    if (next !== "custom") { setBaseUrl(modelProviders[next].baseUrl); setModel(modelProviders[next].model); }
  };
  const preset = modelProviders[provider];
  const keyConfiguredForSelection = apiKeyConfigured && provider === savedProvider;
  const usesCustomModel = provider !== "custom" && !preset.models.some((item) => item.id === model);
  const selectedModel = preset.models.find((item) => item.id === model);

  const chooseModel = (next: string) => {
    if (next === CUSTOM_MODEL_OPTION) {
      setModel((current) => preset.models.some((item) => item.id === current) ? "" : current);
      return;
    }
    setModel(next);
  };

  const downloadBackup = async () => {
    const response = await fetch("/api/backup"); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `mock-interview-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const inspectBackup = async (file: File) => {
    try {
      const backup = JSON.parse(await file.text()); const response = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", backup }) }); const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法读取备份。"); setBackupPayload(backup); setBackupPreview(data.preview); setBackupNotice("备份已验证；选择合并或替换后才会写入本机数据。");
    } catch (error) { setBackupPayload(null); setBackupPreview(null); setBackupNotice(error instanceof Error ? error.message : "无法读取备份。"); }
  };
  const restoreBackup = async (mode: "merge" | "replace") => {
    if (!backupPayload) return;
    if (mode === "replace" && !window.confirm("替换会清除本机现有训练数据。请确认你已下载当前备份。")) return;
    if (mode === "replace") await downloadBackup();
    const response = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", backup: backupPayload, mode }) }); const data = await response.json(); setBackupNotice(response.ok ? "恢复完成，页面即将刷新。" : data.error ?? "恢复失败。"); if (response.ok) window.setTimeout(() => window.location.reload(), 700);
  };
  const redownloadEmbeddingModel = async () => {
    setWarmingModel(true); setNotice("已清理旧缓存，正在后台重新下载 bge-m3，本页会显示进度。");
    try { const response = await fetch("/api/settings/prewarm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) }); const data = await response.json() as LocalEmbeddingModelStatus & { error?: string }; if (!response.ok) throw new Error(data.error ?? "重新下载失败。"); setEmbeddingStatus(data); }
    catch (error) { setNotice(error instanceof Error ? error.message : "重新下载失败。"); }
    finally { setWarmingModel(false); }
  };

  return <>
    <header className="page-header"><div><p className="eyebrow"><SlidersHorizontal size={15}/> 设置</p><h1>把节奏调成适合你的样子。</h1><p>本地优先，配置只保存在你的设备上。</p></div></header>
    <div className="two-column">
      <Panel><div className="form-grid"><label className="field">每日首次学习数<select value={dailyInitialTarget} onChange={(event) => setDailyInitialTarget(Number(event.target.value))}>{[0, 3, 5, 8, 10, 15].map((count) => <option value={count} key={count}>{count} 张</option>)}</select><span className="field-help">首页安排新卡目标；完成后仍可继续首次学习。</span></label><label className="field">每日到期复习数<select value={dailyReviewTarget} onChange={(event) => setDailyReviewTarget(Number(event.target.value))}>{[0, 5, 10, 15, 20, 30].map((count) => <option value={count} key={count}>{count} 张</option>)}</select><span className="field-help">按 min(目标，到期数) 安排；你始终可以超额复习。</span></label><label className="field">Stability 稀有度方案<select value={stabilityRarityPreset} onChange={(event) => setStabilityRarityPreset(event.target.value as StabilityRarityPreset)}>{rarityPresetOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select><span className="field-help">{rarityPresetOptions.find((option) => option.id === stabilityRarityPreset)?.description}</span></label><label className="field">默认答案比对<select value={answerComparisonMode} onChange={(event) => setAnswerComparisonMode(event.target.value as AnswerComparisonMode)}><option value="embedding">本地语义（bge-m3，首次后台下载）</option><option value="llm">LLM 判断（使用已配置模型）</option></select><span className="field-help">每次进入都会检查模型；未完成时会在后台续传下载。LLM 模式会将参考答案与本次回答发送给当前服务商。</span></label><div className="embedding-download-status" role="status" aria-live="polite"><strong>{embeddingStatus.state === "ready" ? "bge-m3 已就绪" : embeddingStatus.state === "retrying" ? `下载失败，正在第 ${embeddingStatus.attempt} 次重试` : embeddingStatus.state === "error" ? "bge-m3 下载失败" : "正在准备 bge-m3"}</strong><div className="embedding-status-step"><b>1. 下载向量模型</b><progress value={embeddingStatus.totalBytes ? embeddingStatus.downloadedBytes : undefined} max={embeddingStatus.totalBytes ?? undefined} /><span>{embeddingStatus.totalBytes ? `${sizeLabel(embeddingStatus.downloadedBytes)} / ${sizeLabel(embeddingStatus.totalBytes)} · ${Math.min(100, Math.round(embeddingStatus.downloadedBytes / embeddingStatus.totalBytes * 100))}%` : embeddingStatus.downloadedBytes ? `已下载 ${sizeLabel(embeddingStatus.downloadedBytes)}` : "等待开始"}</span></div><div className="embedding-status-step"><b>2. 解析 ONNX 模型</b><progress value={embeddingStatus.onnxState === "ready" ? 1 : embeddingStatus.onnxState === "parsing" ? undefined : 0} max={1} /><span>{embeddingStatus.onnxState === "ready" ? "解析并加载完成" : embeddingStatus.onnxState === "parsing" ? "正在由 ONNX Runtime 解析模型…" : embeddingStatus.onnxState === "failed" ? "解析失败，将清理损坏文件后重试" : "等待模型文件下载完成"}</span></div>{embeddingStatus.state === "ready" && <span>本地模型已缓存，可离线进行语义比对。</span>}{embeddingStatus.error && <span>{embeddingStatus.error}</span>}</div><div className="form-actions"><Button type="button" variant="outline" disabled={warmingModel || embeddingStatus.state === "downloading" || embeddingStatus.state === "retrying" || embeddingStatus.state === "verifying"} onClick={redownloadEmbeddingModel}>{warmingModel ? "正在启动下载…" : "重新下载向量模型"}</Button><Button onClick={save}><Save size={17}/> 保存学习偏好</Button></div>{notice && <p className="muted-copy" role="status">{notice}</p>}</div></Panel>
      <Panel className="environment-panel">
        <p className="eyebrow"><KeyRound size={15}/> 本地 .env.local</p><h2>模型服务</h2><p className="muted-copy">选择服务商、具体模型并填写 API Key；未列出的模型可直接自定义填写。</p>
        <div className="form-grid">
          <label className="field">模型服务<select value={provider} onChange={(event) => chooseProvider(event.target.value as ModelProviderId)}>{Object.entries(modelProviders).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
          {provider !== "custom" && <>
            <div className="provider-preview"><Sparkles size={17}/><div><strong>{preset.label}</strong><p>{preset.detail}{selectedModel ? ` · ${selectedModel.detail}` : " · 自定义模型"}</p></div></div>
            <label className="field">具体模型<select value={usesCustomModel ? CUSTOM_MODEL_OPTION : model} onChange={(event) => chooseModel(event.target.value)}>{preset.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}<option value={CUSTOM_MODEL_OPTION}>自定义模型名称…</option></select></label>
            {usesCustomModel && <label className="field">自定义模型名称<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="输入此服务商提供的模型标识" /></label>}
          </>}
          {provider === "custom" && <><label className="field">兼容 API 地址<input type="url" inputMode="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label><label className="field">模型名称<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 gpt-4.1-mini" /></label></>}
          <label className="field">API Key<input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setClearApiKey(false); }} placeholder={keyConfiguredForSelection ? "已配置；留空则保持不变" : "粘贴此服务的 API Key"} /></label>
          {keyConfiguredForSelection && <label className="environment-check"><input type="checkbox" checked={clearApiKey} onChange={(event) => { setClearApiKey(event.target.checked); if (event.target.checked) setApiKey(""); }} /> 移除已保存的 API Key</label>}
          <Button type="button" variant="secondary" disabled={savingEnvironment} onClick={saveEnvironment}><Save size={17}/> 保存模型配置</Button>
        </div>
        <p className="environment-security"><ShieldCheck size={16}/> 密钥不会从服务器回传到浏览器；同一服务留空可保留已有密钥。</p>{provider === "claude" && <p className="provider-note">Claude 选项使用 Anthropic API Key；Claude Code 的订阅登录不能替代 API Key。</p>}{environmentNotice && <p className="muted-copy" role="status">{environmentNotice}</p>}
      </Panel>
    </div>
    <Panel className="test-features-panel"><p className="eyebrow"><FlaskConical size={15}/> 测试功能</p><h2>开发中的功能</h2><p className="muted-copy">以下功能仍在开发中，可能会调整或不稳定。</p><div className="test-feature-actions"><Link className="button secondary" href="/interview"><Mic2 size={17}/> 进入模拟面试</Link><Link className="button outline" href="/knowledge-base"><Sparkles size={17}/> 进入知识库</Link></div></Panel>
    <DesktopUpdater />
    <Panel className="backup-panel"><p className="eyebrow"><ShieldCheck size={15}/> 备份与迁移</p><h2>带走你的训练记录</h2><p className="muted-copy">备份包含卡片、复习、面试、任务和普通设置；不包含 API Key 或本地模型配置。</p><div className="form-actions"><Button type="button" variant="secondary" onClick={downloadBackup}><Download size={17}/> 下载 JSON 备份</Button><label className="button ghost"><Upload size={17}/> 选择备份恢复<input hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectBackup(file); event.target.value = ""; }} /></label></div>{backupPreview && <div className="backup-preview"><strong>已验证备份</strong><span>{Object.entries(backupPreview.counts).map(([key, count]) => `${key} ${count}`).join(" · ")}</span><span>卡片 ID 冲突：{backupPreview.cardConflicts}</span><div className="form-actions"><Button type="button" onClick={() => restoreBackup("merge")}>合并恢复</Button><Button type="button" variant="warning" onClick={() => restoreBackup("replace")}>下载当前备份并替换</Button></div></div>}{backupNotice && <p className="muted-copy" role="status">{backupNotice}</p>}</Panel>
  </>;
}
