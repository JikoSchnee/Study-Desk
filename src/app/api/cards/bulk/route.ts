import { NextResponse } from "next/server";
import { z } from "zod";
import { permanentlyDeleteCards, updateCardsBulk } from "@/lib/cards";

const schema = z.object({ action: z.enum(["archive", "restore", "move", "addTags", "delete"]), ids: z.array(z.string().uuid()).min(1).max(500), value: z.union([z.string(), z.array(z.string())]).optional() });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (input.action === "delete") { const deleted = permanentlyDeleteCards(input.ids); (await import("@/lib/auto-backup")).triggerAutoBackup(); return NextResponse.json({ deleted }); }
    if ((input.action === "move" || input.action === "addTags") && input.value === undefined) return NextResponse.json({ error: "请提供批量修改内容。" }, { status: 400 });
    const cards = updateCardsBulk(input.ids, input.action, input.value);
    (await import("@/lib/auto-backup")).triggerAutoBackup();
    return NextResponse.json({ cards });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法批量更新卡片。" }, { status: 400 }); }
}
