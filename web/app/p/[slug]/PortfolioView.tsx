"use client";

import { useEffect, useState } from "react";
import { Portfolio as PortfolioSchema, type Portfolio } from "@alibi/shared";
import { TEMPLATES } from "@/templates";

const POLL_MS = 1500;
const EMPTY: Portfolio = { templateId: "showcase", skills: [], projects: {}, contradictions: [] };

export default function PortfolioView({ slug }: { slug: string }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let version = -1;
    const controller = new AbortController();
    setPortfolio(null); setMissing(false);

    async function tick() {
      try {
        const res = await fetch(`/api/p/${encodeURIComponent(slug)}`, { cache: "no-store", signal: controller.signal });
        if (stopped) return;
        if (res.status === 404) {
          setMissing(true);
          return;
        } else if (res.ok) {
          const data = await res.json();
          if (stopped) return;
          const checked = PortfolioSchema.safeParse(data.portfolio);
          const incomingVersion = Number.isSafeInteger(data.version) ? data.version as number : 0;
          if (checked.success && incomingVersion >= version) {
            version = incomingVersion; setMissing(false); setPortfolio(checked.data);
          }
          // A ready portfolio may keep changing while its conversation is active.
          if (checked.success && data.ready === true && data.active !== true && Object.values(checked.data.projects).every(project => project.status !== 'ready' || project.siteUrl)) return;
        }
      } catch {
        // network blip: keep polling
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [slug]);

  if (missing) return <p className="p-8 text-neutral-500">Portfolio not found.</p>;

  const p = portfolio ?? EMPTY;
  const Template = TEMPLATES[p.templateId] ?? TEMPLATES.showcase;
  return <><Template portfolio={p} /><nav aria-label="Project apps" className="mx-auto flex max-w-4xl flex-wrap gap-4 p-6">{Object.entries(p.projects).filter(([, project]) => project.status === 'ready').map(([id, project]) => <a className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 underline underline-offset-4" key={id} href={project.siteUrl} target="_blank" rel="noopener noreferrer" aria-disabled={!project.siteUrl}>{project.siteUrl ? 'Open ' : 'Deploying '}{project.title}</a>)}</nav></>;
}
