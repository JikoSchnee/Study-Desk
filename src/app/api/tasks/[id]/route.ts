import { NextResponse } from "next/server";
import { z } from "zod";
import { updateTask } from "@/lib/planner";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { status } = z.object({ status: z.enum(["todo", "done", "skipped"]) }).parse(await request.json());
  return NextResponse.json({ task: updateTask(id, status) });
}
