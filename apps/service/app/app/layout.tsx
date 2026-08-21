import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Study Desk 浏览器客户端",
  description: "在浏览器中查看同步知识库、完成复习并练习社区内容。",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) { return children; }
