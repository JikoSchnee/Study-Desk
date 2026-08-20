import type { Metadata } from "next";
import { CommunityMarketplace } from "@/components/community-marketplace";

export const metadata: Metadata = { title: "知识社区 · Study Desk", description: "发现、购买并在线练习高质量知识库" };

export default function CommunityPage() {
  return <CommunityMarketplace/>;
}
