import { NextResponse } from "next/server";
import { createBackup } from "@/lib/backup";

export async function GET() { return NextResponse.json(createBackup(), { headers: { "Content-Disposition": "attachment; filename=mock-interview-backup.json" } }); }
