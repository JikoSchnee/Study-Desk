"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function WebLoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/web/session", { cache: "no-store" }).then((response) => { if (response.ok) location.replace("/app"); }); }, []);
  const next = typeof window === "undefined" ? "/app" : new URLSearchParams(location.search).get("next") || "/app";
  async function startGoogle() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/service/auth/oauth/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "google", intent: "sign-in", client: "web", returnPath: next }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      location.assign(body.authorizationUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法开始 Google 登录"); setBusy(false); }
  }
  async function sendEmail(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/service/auth/magic-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, client: "web", returnPath: next }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage("登录链接已发送。请在同一浏览器中打开邮件里的链接。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "发送失败"); }
    finally { setBusy(false); }
  }
  return <main className="web-login">
    <section className="login-story"><Link className="web-brand inverted" href="/"><span>S</span><strong>Study Desk</strong></Link><div><p>浏览器轻量客户端</p><h1>随时打开，<br />接着练习。</h1><ul><li>查看桌面端同步的知识库</li><li>在手机上完成今日复习</li><li>练习免费或已购社区内容</li></ul></div><small>完整编辑、离线学习和无限本地评分仍在桌面端。</small></section>
    <section className="login-form-wrap"><form className="login-card" onSubmit={sendEmail}><div className="login-mascot">S</div><p className="kicker">欢迎回来</p><h2>登录学习桌</h2><p>会话保存在安全的 HttpOnly Cookie 中，不把长期令牌交给网页脚本。</p><button className="google-login" type="button" onClick={startGoogle} disabled={busy}><b>G</b> 使用 Google 登录</button><div className="login-divider"><span>或者使用邮箱</span></div><label>邮箱地址<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><button className="web-primary" disabled={busy}>{busy ? "请稍候…" : "发送邮箱登录链接"}</button>{message && <output className="login-message">{message}</output>}<small>已有账号且 Google 邮箱不同？请先用原方式登录，再到设置中关联 Google。</small></form><p className="login-legal">继续即表示你同意 <Link href="/terms">服务条款</Link> 和 <Link href="/privacy">隐私政策</Link></p></section>
  </main>;
}
