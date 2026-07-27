"use client";

import { useEffect, useState } from "react";
import { KeyRound, Save, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { modelProviders, type ModelProviderId } from "@/lib/model-providers";
import type { AnswerComparisonMode } from "@/lib/types";

type EnvironmentSettings = { provider: ModelProviderId; baseUrl: string; model: string; apiKeyConfigured: boolean };
const CUSTOM_MODEL_OPTION = "__custom_model__";

export default function SettingsPage() {
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [weeklyInterviews, setWeeklyInterviews] = useState(2);
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

  useEffect(() => {
    Promise.all([fetch("/api/settings").then((response) => response.json()), fetch("/api/settings/environment").then((response) => response.json())])
      .then(([settings, environment]) => {
        setDailyMinutes(settings.dailyMinutes); setWeeklyInterviews(settings.weeklyInterviews); setAnswerComparisonMode(settings.answerComparisonMode === "llm" ? "llm" : "embedding");
        const config = environment as EnvironmentSettings;
        setProvider(config.provider ?? "custom"); setSavedProvider(config.provider ?? "custom"); setBaseUrl(config.baseUrl ?? ""); setModel(config.model ?? ""); setApiKeyConfigured(Boolean(config.apiKeyConfigured));
      });
  }, []);

  const save = async () => {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailyMinutes, weeklyInterviews, answerComparisonMode }) });
    setNotice("学习节奏与答案比对偏好已保存。");
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

  return <>
    <header className="page-header"><div><p className="eyebrow"><SlidersHorizontal size={15}/> 设置</p><h1>把节奏调成适合你的样子。</h1><p>本地优先，配置只保存在你的设备上。</p></div></header>
    <div className="two-column">
      <Panel><div className="form-grid"><label className="field">每日学习时间<select value={dailyMinutes} onChange={(event) => setDailyMinutes(Number(event.target.value))}><option value="20">20 分钟</option><option value="30">30 分钟</option><option value="45">45 分钟</option><option value="60">60 分钟</option></select></label><label className="field">每周模拟面试<select value={weeklyInterviews} onChange={(event) => setWeeklyInterviews(Number(event.target.value))}><option value="1">1 次</option><option value="2">2 次</option><option value="3">3 次</option></select></label><label className="field">默认答案比对<select value={answerComparisonMode} onChange={(event) => setAnswerComparisonMode(event.target.value as AnswerComparisonMode)}><option value="embedding">本地语义（首次自动下载模型）</option><option value="llm">LLM 判断（使用已配置模型）</option></select><span className="field-help">作答时仍可临时切换。LLM 模式会将参考答案与本次回答发送给当前服务商。</span></label><Button onClick={save}><Save size={17}/> 保存学习偏好</Button>{notice && <p className="muted-copy" role="status">{notice}</p>}</div></Panel>
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
  </>;
}
