import type { Metadata } from "next";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Desk · 把知识练成自己的",
  description: "用知识卡片整理、练习和复习，让学过的内容真正变成随时能说出口的答案。下载 Windows 与 Apple Silicon macOS 桌面版。",
  applicationName: "Study Desk",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Study Desk · 把知识练成自己的",
    description: "一张桌子，收好知识，也把它练熟。",
    type: "website",
    locale: "zh_CN",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
