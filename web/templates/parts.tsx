"use client";

import { useEffect, useId, useState } from "react";

// Shared building blocks for all three templates. Styling is passed in so each template keeps its own look.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-current opacity-10 ${className}`} />;
}

export function Mermaid({ source, theme = "neutral" }: { source: string; theme?: "neutral" | "dark" | "base" }) {
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme, securityLevel: "strict" });
        const { svg } = await mermaid.render(id, source);
        if (!cancelled) setSvg(svg);
      } catch {
        // LLM-generated Mermaid can be invalid; hide the diagram rather than show an error box.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, source, theme]);

  if (failed) return null;
  if (!svg) return <Skeleton className="h-40 w-full" />;
  return (
    <div
      className="w-full overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// GitHub-style contribution strip. Values are commits per day, oldest first.
export function CommitGraph({ data, colors }: { data: number[]; colors: [string, string, string, string, string] }) {
  const max = Math.max(1, ...data);
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const weeks: number[][] = [];
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));
  return (
    <div className="flex gap-[3px]" aria-label={`${data.reduce((a, b) => a + b, 0)} commits`}>
      {weeks.map((week, w) => (
        <div key={w} className="flex flex-col gap-[3px]">
          {week.map((n, d) => (
            <div key={d} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: colors[level(n)] }} title={`${n} commits`} />
          ))}
        </div>
      ))}
    </div>
  );
}
