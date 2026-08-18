import { NextResponse } from "next/server";
import { z } from "zod";
import { createStudyPlan, deleteStudyPlan, getActiveStudyPlanId, listStudyPlans, setActiveStudyPlan, updateStudyPlan } from "@/lib/study-plans";

const inputSchema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).default(""), knowledgeBaseIds: z.array(z.string().uuid()).default([]) });

export async function GET() { return NextResponse.json({ plans: listStudyPlans(), activePlanId: getActiveStudyPlanId() }); }
export async function POST(request: Request) { try { const input = inputSchema.omit({ id: true }).parse(await request.json()); return NextResponse.json({ plan: createStudyPlan(input) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建计划书。" }, { status: 400 }); } }
export async function PATCH(request: Request) { try { const body = await request.json(); if (body.action === "activate") { const { id } = z.object({ id: z.string().uuid() }).parse(body); return NextResponse.json({ plan: setActiveStudyPlan(id), activePlanId: id }); } const input = inputSchema.required({ id: true }).parse(body); const plan = updateStudyPlan(input.id, input); return plan ? NextResponse.json({ plan }) : NextResponse.json({ error: "找不到计划书。" }, { status: 404 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法更新计划书。" }, { status: 400 }); } }
export async function DELETE(request: Request) { try { const { id } = z.object({ id: z.string().uuid() }).parse(await request.json()); deleteStudyPlan(id); return NextResponse.json({ ok: true, activePlanId: getActiveStudyPlanId() }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法删除计划书。" }, { status: 400 }); } }

