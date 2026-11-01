"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProjectSection } from '@alibi/shared';
import { renderDesignedProject } from '@/lib/mock-designs';

// Shared building blocks for all three templates. Styling is passed in so each template keeps its own look.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-current opacity-10 ${className}`} />;
}

export function Mermaid({ source, theme = "neutral" }: { source: string; theme?: "neutral" | "dark" }) {
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

// GitHub-style contribution grid. Values are commits per day, oldest first.
export function CommitGraph({ data, colors }: { data: number[]; colors: [string, string, string, string, string] }) {
  const max = Math.max(1, ...data);
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const weeks: number[][] = [];
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));
  return (
    <div className="flex gap-[3px]" role="img" aria-label={`${data.reduce((a, b) => a + b, 0)} commits`}>
      {weeks.map((week, w) => (
        <div key={w} className="flex flex-col gap-[3px]">
          {week.map((n, d) => (
            <div key={d} className="h-[9px] w-[9px] rounded-[2px]" style={{ background: colors[level(n)] }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Static project previews have no scripts, external assets, or same-origin access.
// Trusted local renderers supply their own CSS, so preview rendering never waits on a CDN.
const MOCK_W = 960;
const MOCK_H = 600;

function srcDoc(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<style>html,body{margin:0;width:${MOCK_W}px;height:${MOCK_H}px;overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}</style>
</head><body>${html}</body></html>`;
}

export function MockFrame({ html, title = "Project preview", dark = false }: { html: string; title?: string; dark?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [kitCss, setKitCss] = useState('');

  useEffect(() => {
    if (!/data-kit=/.test(html)) return;
    let cancelled = false;
    const sheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).filter(link => new URL(link.href).origin === location.origin);
    Promise.all(sheets.map(async link => { const response = await fetch(link.href); return response.ok ? response.text() : ''; })).then(css => { if (!cancelled) setKitCss(css.join('\n')); }).catch(() => {});
    return () => { cancelled = true; };
  }, [html]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / MOCK_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={`overflow-hidden rounded-xl border ${dark ? "border-white/10 bg-neutral-900" : "border-black/10 bg-neutral-100"}`}
    >
      <div className={`flex items-center gap-1.5 px-3 py-2 ${dark ? "bg-neutral-900" : "bg-neutral-100"}`}>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className={`ml-3 truncate font-mono text-xs ${dark ? "text-neutral-300" : "text-neutral-600"}`}>{title}</span>
      </div>
      <div ref={boxRef} className="relative w-full" style={{ aspectRatio: `${MOCK_W} / ${MOCK_H}` }}>
        {scale > 0 && (
          <iframe
            title={`${title} project preview`}
            sandbox=""
            srcDoc={srcDoc(`<style>${kitCss}</style>${html}`)}
            loading="eager"
            tabIndex={-1}
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{ width: MOCK_W, height: MOCK_H, transform: `scale(${scale})` }}
          />
        )}
      </div>
    </div>
  );
}

// Unmount collapsed details so they are neither focusable nor clipped visible content.
export function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="animate-[fadein_.3s_ease-out] motion-reduce:animate-none">
      {children}
    </div>
  );
}

export function portfolioTitle(name?: string) {
  const value=name?.trim();
  if(!value || /^your\s*portfolio$/i.test(value))return "Your portfolio";
  return `${value}${/s$/i.test(value) ? "’" : "’s"} portfolio`;
}

export function projectPreviewHtml(project: ProjectSection) {
  return project.mockHtml && /\bdata-mock-design\s*=/.test(project.mockHtml)
    ? project.mockHtml
    : renderDesignedProject(project);
}

// Short deterministic "commit hash" so a project always shows the same one.
export function fakeHash(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

export const Icon = {
  github: (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M0 1.15C0 .52.52 0 1.18 0h13.64C15.48 0 16 .52 16 1.15v13.7c0 .63-.52 1.15-1.18 1.15H1.18C.52 16 0 15.48 0 14.85V1.15zm4.94 12.24V6.17H2.542v7.22H4.94zM3.74 5.18c.84 0 1.36-.55 1.36-1.25-.01-.71-.52-1.25-1.34-1.25-.82 0-1.36.54-1.36 1.25 0 .7.52 1.25 1.33 1.25h.01zm4.91 8.21V9.36c0-.22.02-.43.08-.58.17-.43.57-.88 1.23-.88.87 0 1.21.66 1.21 1.63v3.86h2.4V9.25c0-2.22-1.18-3.25-2.76-3.25-1.27 0-1.85.7-2.16 1.19v.03h-.02l.02-.03V6.17h-2.4c.03.68 0 7.22 0 7.22h2.4z" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M8 .25a.75.75 0 01.67.42l1.88 3.81 4.2.61a.75.75 0 01.42 1.28l-3.04 2.97.72 4.19a.75.75 0 01-1.09.79L8 12.35l-3.76 1.97a.75.75 0 01-1.09-.79l.72-4.19L.83 6.37a.75.75 0 01.42-1.28l4.2-.61L7.33.67A.75.75 0 018 .25z" />
    </svg>
  ),
};

// The expanded half of a project card. Same content in every template; `t` carries the template's styling.
export type DetailsTheme = {
  muted: string; // secondary text class
  border: string; // border color class
  chip: string; // stack chip classes
  label: string; // small section label classes
  graph: [string, string, string, string, string];
  mermaid: "neutral" | "dark";
};

export function ProjectDetails({
  p,
  t,
  open,
  mock,
}: {
  p: import("@alibi/shared").ProjectSection;
  t: DetailsTheme;
  open: boolean;
  mock?: React.ReactNode; // templates that hide the mock when collapsed pass it here
}) {
  return (
    <div className="space-y-6 pt-5">
      {mock}
      <p className="leading-relaxed">{p.summary}</p>

      {p.details && p.details.length > 0 && (
        <dl className={`divide-y rounded-lg border px-4 ${t.border}`}>
          {p.details.map((detail,index)=>(
            <div key={`${detail.label}:${index}`} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4">
              <dt className={`text-xs ${t.muted}`}>{detail.label}</dt>
              <dd className="min-w-0 break-words text-sm leading-relaxed">{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {p.metrics.length > 0 && (
        <dl className="grid grid-cols-3 gap-2">
          {p.metrics.map((m) => (
            <div key={m.label} className={`rounded-lg border p-3 ${t.border}`}>
              <dd className="text-lg font-semibold leading-tight">{m.value}</dd>
              <dt className={`mt-0.5 text-xs ${t.muted}`}>{m.label}</dt>
            </div>
          ))}
        </dl>
      )}

      {p.highlights.length > 0 && (
        <div>
          <div className={t.label}>how it works</div>
          <ul className="mt-2 space-y-2">
            {p.highlights.map((h) => (
              <li key={h} className="flex gap-2.5">
                <span className={`mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-current ${t.muted}`} />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.diagramMermaid && open && (
        <div>
          <div className={t.label}>architecture</div>
          <div className={`mt-2 rounded-lg border p-4 ${t.border}`}>
            <Mermaid source={p.diagramMermaid} theme={t.mermaid} />
          </div>
        </div>
      )}

      {p.stack.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {p.stack.map((s) => (
            <li key={s} className={t.chip}>
              {s}
            </li>
          ))}
        </ul>
      )}

      {p.commitGraph && p.commitGraph.length > 0 && (
        <div>
          <div className="overflow-x-auto">
            <CommitGraph data={p.commitGraph} colors={t.graph} />
          </div>
          <div className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${t.muted}`}>
            {p.commits !== undefined && <span>{p.commits} commits</span>}
            {p.stars !== undefined && (
              <span className="flex items-center gap-1">
                {Icon.star}
                {p.stars}
              </span>
            )}
            {p.lastPushed && <span>pushed {p.lastPushed}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
