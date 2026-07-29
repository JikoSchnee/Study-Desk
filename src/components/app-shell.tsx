"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpenCheck, ClipboardList, FilePlus2, LibraryBig, Menu, Mic2, Settings, Sparkles, X } from "lucide-react";
import { TourButton } from "@/components/tour";

const nav = [
  ["/", "今日", ClipboardList],
  ["/cards", "录入", FilePlus2],
  ["/library", "卡片库", LibraryBig],
  ["/review", "学习", BookOpenCheck],
  ["/interview", "面试", Mic2],
  ["/knowledge-base", "知识库", Sparkles],
  ["/settings", "设置", Settings],
] as const;

function tourTargetForNav(href: string) {
  if (href === "/cards") return "nav-cards";
  if (href === "/review") return "nav-review";
  if (href === "/library") return "nav-library";
  return undefined;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  return <div className="app-frame">
    <aside className="side-nav" aria-label="主导航">
      <Link href="/" className="brand"><span>八</span><b>八股训练台</b></Link>
      <nav>{nav.map(([href, label, Icon]) => <Link key={href} href={href} data-tour={tourTargetForNav(href)} className={pathname === href ? "nav-item active" : "nav-item"}><Icon size={20} /><span>{label}</span></Link>)}</nav>
      <p className="nav-note">每天把一个知识点，练成一句能说清的话。</p>
    </aside>
    <main className="page-main" data-tour="page-main">{children}</main>
    {pathname === "/settings" && <div className="page-tour-fab"><TourButton tour="settings" /></div>}
    <nav className="bottom-nav" aria-label="移动端主导航">{nav.slice(0, 5).map(([href, label, Icon]) => <Link key={href} href={href} data-tour={tourTargetForNav(href)} className={pathname === href ? "active" : ""}><Icon size={20}/><span>{label}</span></Link>)}<button type="button" className={moreOpen || pathname === "/knowledge-base" || pathname === "/settings" ? "active" : ""} onClick={() => setMoreOpen(true)}><Menu size={20}/><span>更多</span></button></nav>
    {moreOpen && <div className="more-nav-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoreOpen(false); }}><section className="more-nav-sheet" role="dialog" aria-modal="true" aria-label="更多功能"><button className="icon-close" type="button" aria-label="关闭更多功能" onClick={() => setMoreOpen(false)}><X size={19}/></button><p className="eyebrow">更多功能</p>{nav.slice(5).map(([href, label, Icon]) => <Link href={href} key={href} onClick={() => setMoreOpen(false)}><Icon size={19}/>{label}</Link>)}</section></div>}
  </div>;
}
