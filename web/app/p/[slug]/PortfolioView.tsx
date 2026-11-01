"use client";

import { useEffect, useState } from "react";
import type { Portfolio } from "@alibi/shared";
import { TEMPLATES } from "@/templates";

const POLL_MS = 1500;
const EMPTY: Portfolio = { templateId: "showcase", skills: [], projects: {}, contradictions: [] };

export default function PortfolioView({ slug }: { slug: string }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const res = await fetch(`/api/p/${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (res.status === 404) {
          setMissing(true);
        } else if (res.ok) {
          const data: { portfolio: Portfolio; ready: boolean } = await res.json();
          setPortfolio(data.portfolio);
          if (data.ready) return; // done building, stop polling
        }
      } catch {
        // network blip: keep polling
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [slug]);

  if (missing) return <p className="p-8 text-neutral-500">Portfolio not found.</p>;

  const p = portfolio ?? EMPTY;
  const Template = TEMPLATES[p.templateId] ?? TEMPLATES.showcase;
  return <Template portfolio={p} />;
}
