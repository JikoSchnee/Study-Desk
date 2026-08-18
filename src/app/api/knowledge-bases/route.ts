import { NextResponse } from "next/server";
import { z } from "zod";
import { createKnowledgeBase, deleteKnowledgeBase, listKnowledgeBases, updateKnowledgeBase } from "@/lib/knowledge-bases";

const inputSchema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).default("") });

export async function GET() { return NextResponse.json({ knowledgeBases: listKnowledgeBases() }); }
export async function POST(request: Request) { try { const input = inputSchema.omit({ id: true }).parse(await request.json()); return NextResponse.json({ knowledgeBase: createKnowledgeBase(input) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建知识库。" }, { status: 400 }); } }
export async function PATCH(request: Request) { try { const input = inputSchema.required({ id: true }).parse(await request.json()); const knowledgeBase = updateKnowledgeBase(input.id, input); return knowledgeBase ? NextResponse.json({ knowledgeBase }) : NextResponse.json({ error: "找不到知识库。" }, { status: 404 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法更新知识库。" }, { status: 400 }); } }
export async function DELETE(request: Request) { try { const { id } = z.object({ id: z.string().uuid() }).parse(await request.json()); deleteKnowledgeBase(id); return NextResponse.json({ ok: true }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法删除知识库。" }, { status: 400 }); } }

