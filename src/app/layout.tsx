import type { Metadata } from "next";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@/app/globals.css";
import { AppShell } from "@/components/app-shell";
import { DesktopUpdateProvider } from "@/components/desktop-update-notice";
import { TourProvider } from "@/components/tour";
import { PageStateCacheProvider } from "@/components/page-state-cache";

export const metadata: Metadata = { title: "Study Desk", description: "把知识沉淀成能说出口的答案" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><PageStateCacheProvider><TourProvider><DesktopUpdateProvider><AppShell>{children}</AppShell></DesktopUpdateProvider></TourProvider></PageStateCacheProvider></body></html>;
}
