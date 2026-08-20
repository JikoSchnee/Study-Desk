import { notFound } from "next/navigation";
import { CommunityPractice } from "@/components/community-practice";
import { communityCatalog } from "@shared/community";

export default async function CommunityPracticePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ demoAccess?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const knowledgeBase = communityCatalog.find((item) => item.id === id);
  if (!knowledgeBase) notFound();
  // The API/RPC is authoritative in production. Rendering the practice shell
  // does not grant access; it only lets an authenticated account attempt the
  // protected card request and receive a 401/403 when no entitlement exists.
  const hasAccess = knowledgeBase.isFree || process.env.NODE_ENV === "production" || query.demoAccess === "1";
  return <CommunityPractice knowledgeBase={knowledgeBase} hasAccess={hasAccess}/>;
}
