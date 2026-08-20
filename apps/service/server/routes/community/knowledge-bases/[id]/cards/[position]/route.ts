import { NextResponse } from "next/server";
import { z } from "zod";
import { communityCatalog } from "@shared/community";
import { getCommunityDemoCard } from "@service/lib/community-demo-content";
import { communityError, communitySupabase, requireCommunityViewer } from "@service/lib/community-server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; position: string }> }) {
  try {
    const viewer = await requireCommunityViewer(request);
    const { id, position: rawPosition } = await params;
    const position = z.coerce.number().int().min(0).parse(rawPosition);
    const api = communitySupabase(viewer.accessToken);
    if (api) {
      const parsedId = z.string().uuid().safeParse(id);
      let targetId = parsedId.success ? parsedId.data : "";
      if (!targetId) {
        const { data: knowledgeBase, error: lookupError } = await api.from("community_knowledge_bases").select("id").eq("slug", id).maybeSingle();
        if (lookupError) throw new Error(lookupError.message);
        if (!knowledgeBase?.id) throw new Error("COMMUNITY_CARD_NOT_FOUND");
        targetId = knowledgeBase.id as string;
      }
      const { data, error } = await api.rpc("get_community_card", { target_id: targetId, target_position: position });
      if (error) throw new Error(error.message);
      return NextResponse.json({ card: data?.[0] ?? null }, { headers: { "Cache-Control": "private, no-store", "X-Content-Protection": "account-entitlement" } });
    }
    if (process.env.NODE_ENV === "production") throw new Error("COMMUNITY_AUTH_REQUIRED");
    const knowledgeBase = communityCatalog.find((item) => item.id === id);
    if (!knowledgeBase || (!knowledgeBase.isFree && request.headers.get("x-community-demo-access") !== "1")) throw new Error("COMMUNITY_ACCESS_DENIED");
    const card = getCommunityDemoCard(id, position);
    if (!card) throw new Error("COMMUNITY_CARD_NOT_FOUND");
    return NextResponse.json({ card, watermark: `${viewer.email ?? viewer.id} · ${new Date().toISOString()}` }, { headers: { "Cache-Control": "private, no-store", "X-Content-Protection": "account-entitlement" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "知识库或题目位置无效。" }, { status: 400 });
    const failure = communityError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status, headers: { "Cache-Control": "private, no-store" } });
  }
}
