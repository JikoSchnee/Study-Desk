import type { Metadata } from "next";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@/app/globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "八股训练台", description: "把知识沉淀成能说出口的答案" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AppShell>{children}</AppShell></body></html>;
}
