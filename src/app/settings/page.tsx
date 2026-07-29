"use client";

import { useEffect, useState } from "react";
import { Download, KeyRound, Save, ShieldCheck, SlidersHorizontal, Sparkles, Upload } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { modelProviders, type ModelProviderId } from "@/lib/model-providers";
import type { AnswerComparisonMode } from "@/lib/types";

type EnvironmentSettings = { provider: ModelProviderId; baseUrl: string; model: string; apiKeyConfigured: boolean };
const CUSTOM_MODEL_OPTION = "__custom_model__";

export default function SettingsPage() {
  const [dailyInitialTarget, setDailyInitialTarget] = useState(5);
  const [dailyReviewTarget, setDailyReviewTarget] = useState(10);
  const [answerComparisonMode, setAnswerComparisonMode] = useState<AnswerComparisonMode>("embedding");
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

  useEffect(() => {
    Promise.all([fetch("/api/settings").then((response) => response.json()), fetch("/api/settings/environment").then((response) => response.json())])
      .then(([settings, environment]) => {
        setDailyInitialTarget(settings.dailyInitialTarget ?? 5); setDailyReviewTarget(settings.dailyReviewTarget ?? 10); setAnswerComparisonMode(settings.answerComparisonMode === "llm" ? "llm" : "embedding");
        const config = environment as EnvironmentSettings;
        setProvider(config.provider ?? "custom"); setSavedProvider(config.provider ?? "custom"); setBaseUrl(config.baseUrl ?? ""); setModel(config.model ?? ""); setApiKeyConfigured(Boolean(config.apiKeyConfigured));
      });
  }, []);

  const save = async () => {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailyInitialTarget, dailyReviewTarget, answerComparisonMode }) });
    setNotice("每日训练目标与答案比对偏好已保存。");
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
  const prewarmModel = async () => {
    setWarmingModel(true); setNotice("正在下载并加载本地语义模型；首次操作可能需要一些时间。");
    try { const response = await fetch("/api/settings/prewarm", { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "预热失败。"); setNotice("本地语义模型已准备好，之后作答可直接开始比对。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "预热失败。"); }
    finally { setWarmingModel(false); }
  };

  return <>
    <header className="page-header"><div><p className="eyebrow"><SlidersHorizontal size={15}/> 设置</p><h1>把节奏调成适合你的样子。</h1><p>本地优先，配置只保存在你的设备上。</p></div></header>
    <div className="two-column">
      <Panel data-tour="settings-goals"><div className="form-grid"><label className="field">每日首次学习数<select value={dailyInitialTarget} onChange={(event) => setDailyInitialTarget(Number(event.target.value))}>{[0, 3, 5, 8, 10, 15].map((count) => <option value={count} key={count}>{count} 张</option>)}</select><span className="field-help">首页安排新卡目标；完成后仍可继续首次学习。</span></label><label className="field">每日到期复习数<select value={dailyReviewTarget} onChange={(event) => setDailyReviewTarget(Number(event.target.value))}>{[0, 5, 10, 15, 20, 30].map((count) => <option value={count} key={count}>{count} 张</option>)}</select><span className="field-help">按 min(目标，到期数) 安排；你始终可以超额复习。</span></label><label className="field">默认答案比对<select value={answerComparisonMode} onChange={(event) => setAnswerComparisonMode(event.target.value as AnswerComparisonMode)}><option value="embedding">本地语义（首次自动下载模型）</option><option value="llm">LLM 判断（使用已配置模型）</option></select><span className="field-help">作答时仍可临时切换。LLM 模式会将参考答案与本次回答发送给当前服务商。</span></label><div className="form-actions"><Button onClick={save}><Save size={17}/> 保存学习偏好</Button><Button type="button" variant="outline" disabled={warmingModel} onClick={prewarmModel}>{warmingModel ? "正在预热本地模型…" : "预热本地语义模型"}</Button></div>{notice && <p className="muted-copy" role="status">{notice}</p>}</div></Panel>
      <Panel className="environment-panel" data-tour="settings-model">
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
    <Panel className="backup-panel" data-tour="settings-backup"><p className="eyebrow"><ShieldCheck size={15}/> 备份与迁移</p><h2>带走你的训练记录</h2><p className="muted-copy">备份包含卡片、复习、面试、任务和普通设置；不包含 API Key 或本地模型配置。</p><div className="form-actions"><Button type="button" variant="secondary" onClick={downloadBackup}><Download size={17}/> 下载 JSON 备份</Button><label className="button ghost"><Upload size={17}/> 选择备份恢复<input hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectBackup(file); event.target.value = ""; }} /></label></div>{backupPreview && <div className="backup-preview"><strong>已验证备份</strong><span>{Object.entries(backupPreview.counts).map(([key, count]) => `${key} ${count}`).join(" · ")}</span><span>卡片 ID 冲突：{backupPreview.cardConflicts}</span><div className="form-actions"><Button type="button" onClick={() => restoreBackup("merge")}>合并恢复</Button><Button type="button" variant="warning" onClick={() => restoreBackup("replace")}>下载当前备份并替换</Button></div></div>}{backupNotice && <p className="muted-copy" role="status">{backupNotice}</p>}</Panel>
  </>;
}
