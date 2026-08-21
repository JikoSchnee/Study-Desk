import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceError } from "@service/lib/service-supabase";
import { sendEmailLogin } from "@service/lib/email-auth";

const inputSchema = z.object({ email: z.string().email(), client: z.enum(["desktop", "web"]).default("desktop"), returnPath: z.string().max(200).optional() });

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    return NextResponse.json(await sendEmailLogin(input));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "请输入有效邮箱。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
