"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, ClipboardList, FilePlus2, LibraryBig, Mic2, Settings, Sparkles } from "lucide-react";

const nav = [
  ["/", "今日", ClipboardList],
  ["/cards", "录入", FilePlus2],
  ["/library", "卡片库", LibraryBig],
  ["/review", "复习", BookOpenCheck],
  ["/interview", "面试", Mic2],
  ["/knowledge-base", "知识库", Sparkles],
  ["/settings", "设置", Settings],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-frame">
    <aside className="side-nav" aria-label="主导航">
      <Link href="/" className="brand"><span>八</span><b>八股训练台</b></Link>
      <nav>{nav.map(([href, label, Icon]) => <Link key={href} href={href} className={pathname === href ? "nav-item active" : "nav-item"}><Icon size={20} /><span>{label}</span></Link>)}</nav>
      <p className="nav-note">每天把一个知识点，练成一句能说清的话。</p>
    </aside>
    <main className="page-main">{children}</main>
    <nav className="bottom-nav" aria-label="移动端主导航">{nav.slice(0, 5).map(([href, label, Icon]) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon size={20}/><span>{label}</span></Link>)}</nav>
  </div>;
}
