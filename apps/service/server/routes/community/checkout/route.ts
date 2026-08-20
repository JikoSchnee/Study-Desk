import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { communityCatalog, refundDeadline } from "@shared/community";
import { communityError, requireCommunityViewer } from "@service/lib/community-server";

const checkoutSchema = z.object({ productId: z.string().min(1), provider: z.enum(["wechat", "alipay", "sandbox"]).default("sandbox") });

export async function POST(request: Request) {
  try {
    const viewer = await requireCommunityViewer(request);
    const input = checkoutSchema.parse(await request.json());
    const product = communityCatalog.flatMap((item) => item.products).find((item) => item.id === input.productId);
    if (!product) return NextResponse.json({ error: "商品不存在或已经下架。" }, { status: 404 });
    if (process.env.NODE_ENV === "production" || input.provider !== "sandbox") {
      return NextResponse.json({ error: "真实支付尚未启用：请先完成微信/支付宝商户与分账资质。" }, { status: 503 });
    }
    const paidAt = new Date().toISOString();
    return NextResponse.json({ order: { id: randomUUID(), userId: viewer.id, productId: product.id, status: "paid", amountCents: product.priceCents, provider: "sandbox", paidAt, refundDeadline: refundDeadline(paidAt) }, entitlementPreview: { kind: product.kind, durationDays: product.durationDays ?? null } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "结算参数无效。" }, { status: 400 });
    const failure = communityError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
