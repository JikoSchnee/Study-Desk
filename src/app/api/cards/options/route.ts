import { NextResponse } from "next/server";
import { listCards } from "@/lib/cards";

/** Full card records are only needed by the relationship picker while editing. */
export async function GET() {
  return NextResponse.json({ cards: listCards() });
}
