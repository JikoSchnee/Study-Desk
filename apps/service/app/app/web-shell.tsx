"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { webFetch } from "./web-client";

type Session = { user: { email: string | null }; membership: { state: string; activeUntil: string | null } };
const nav = [["/app", "今天", "⌂"], ["/app/library", "知识库", "▤"], ["/app/review", "练习", "↻"], ["/app/community", "社区", "◎"], ["/app/settings", "设置", "⚙"]];

export function WebShell({ title, eyebrow, children, action }: { title: string; eyebrow?: string; children: ReactNode; action?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    webFetch<Session>("web/session").then(setSession).catch(() => router.replace(`/app/login?next=${encodeURIComponent(pathname)}`));
  }, [pathname, router]);
  return <div className="web-app">
    <aside className="web-sidebar">
      <Link className="web-brand" href="/app"><span>S</span><strong>Study Desk</strong></Link>
      <nav aria-label="浏览器客户端导航">{nav.map(([href, label, icon]) => <Link key={href} className={pathname === href ? "active" : ""} href={href}><i>{icon}</i><span>{label}</span></Link>)}</nav>
      <div className="web-account"><span>{session?.user.email?.slice(0, 1).toUpperCase() ?? "…"}</span><div><strong>{session?.user.email ?? "正在验证…"}</strong><small>{session ? membershipLabel(session.membership.state) : "安全会话"}</small></div></div>
    </aside>
    <main className="web-main">
      <header className="web-page-head"><div>{eyebrow && <p>{eyebrow}</p>}<h1>{title}</h1></div>{action}</header>
      {children}
    </main>
    <nav className="web-bottom-nav" aria-label="移动端导航">{nav.map(([href, label, icon]) => <Link key={href} className={pathname === href ? "active" : ""} href={href}><i>{icon}</i><span>{label}</span></Link>)}</nav>
  </div>;
}

export function Notice({ children, kind = "plain" }: { children: ReactNode; kind?: "plain" | "warn" | "good" }) { return <div className={`web-notice ${kind}`}>{children}</div>; }
export function LoadingCard() { return <div className="web-loading"><i /><i /><i /></div>; }
export function membershipLabel(state: string) { return ({ trial: "7 天试用中", active: "会员同步中", grace: "只读宽限期", expired: "会员已到期", free: "免费账号" } as Record<string, string>)[state] ?? state; }
