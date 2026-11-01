import { NextResponse } from "next/server";
import { db, hasDb } from "@/lib/db";
import { SAMPLE_PORTFOLIO } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "demo-backup" || !hasDb()) {
    return NextResponse.json({ portfolio: SAMPLE_PORTFOLIO, ready: true });
  }
  const { rows } = await db().query(
    "select portfolio, metrics from sessions where slug = $1",
    [slug],
  );
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { portfolio, metrics } = rows[0];
  return NextResponse.json({ portfolio, ready: Boolean(metrics?.readyAt) });
}
