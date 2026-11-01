import { withProjectSites } from '@/lib/project-hosting';
import { NextResponse } from "next/server";
import { getPublicPortfolio } from "@/lib/live-sessions";
import { SAMPLE_PORTFOLIO } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "demo-backup") {
    return NextResponse.json({ portfolio: withProjectSites(slug, SAMPLE_PORTFOLIO), ready: true, active: false, version: 1, storage: 'fixture' });
  }
  try {
    const result=await getPublicPortfolio(slug);
    return result?NextResponse.json(result,{headers:{'Cache-Control':'no-store'}}):NextResponse.json({error:'not found'},{status:404});
  }catch{return NextResponse.json({error:'portfolio unavailable'},{status:503});}
}
