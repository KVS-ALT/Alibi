"use client";

import { useState } from "react";
import type { Portfolio, ProjectSection } from "@alibi/shared";
import ProjectQR from "@/components/ProjectQR";
import { ProjectLaunch, Expand, Icon, MockFrame, ProjectDetails, Skeleton, initials, portfolioTitle, projectPreviewHtml, type DetailsTheme } from "./parts";

// Personal, all-lowercase portfolio in the style of affa.nz: live activity card, text-first project
// cards (the mock UI only appears once a card is opened), guestbook, self-deprecating footer.

const T: DetailsTheme = {
  muted: "text-stone-500",
  border: "border-stone-200",
  chip: "rounded-md bg-stone-200/60 px-2 py-0.5 text-xs text-stone-600",
  label: "text-xs text-stone-500",
  graph: ["#ece9e2", "#f5d0a9", "#eba36a", "#d9762f", "#a8521a"],
  mermaid: "neutral",
};

export default function Lowercase({ portfolio }: { portfolio: Portfolio }) {
  const { hero, projects, skills } = portfolio;
  const entries = Object.entries(projects);
  const latest = entries.find(([, p]) => p.status === "ready")?.[1];

  return (
    <main className="min-h-screen bg-[#faf9f6] lowercase text-stone-800 selection:bg-orange-100">
      <div className="mx-auto max-w-xl px-5 pb-16 pt-6">
        <nav className="flex items-center justify-between text-sm">
          <span className="font-bold tracking-tight">{hero ? initials(hero.name).toLowerCase() : "··"}</span>
          <div className="flex gap-5 text-stone-500">
            <span className="text-stone-900">/</span>
            <a href="#work">work</a>
            <span>museum</span>
          </div>
        </nav>

        <header className="pb-10 pt-20">
          {hero ? (
            <div className="animate-[fadein_.6s_ease-out]">
              <h1 className="break-words text-5xl font-bold tracking-tight">{portfolioTitle(hero.name)}</h1>
              <p className="mt-3 text-stone-500">{hero.roles.join(", ")}.</p>
              <div className="mt-5 flex items-center gap-4 text-stone-500">
                {Icon.github}
                {Icon.linkedin}
                {Icon.mail}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-stone-900">
              <Skeleton className="h-12 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          )}
        </header>

        {hero && (
          <div className="mb-10 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-200 text-sm font-semibold text-stone-700">
                {initials(hero.name).toLowerCase()}
              </div>
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">@{hero.handle}</div>
              <div className="truncate text-stone-500">
                {latest ? (
                  <>
                    working on <span className="text-stone-800">{latest.title}</span> · {latest.lastPushed ?? "just now"}
                  </>
                ) : (
                  "fetching…"
                )}
              </div>
            </div>
            <span className="font-mono text-[10px] text-stone-500">live</span>
          </div>
        )}

        {hero && <p className="mb-14 leading-relaxed text-stone-600">{hero.bio}</p>}

        <section id="work">
          <h2 className="mb-4 text-sm text-stone-500">work</h2>
          <div className="space-y-3">
            {entries.length === 0 && <CardSkeleton />}
            {entries.map(([id, p]) => (p.status === "ready" ? <Card key={id} p={p} /> : <CardSkeleton key={id} title={p.title} />))}
          </div>
        </section>

        {hero && hero.currently.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-3 text-sm text-stone-500">now</h2>
            <ul className="space-y-1 text-stone-600">
              {hero.currently.map((c) => (
                <li key={c}>→ {c}</li>
              ))}
            </ul>
          </section>
        )}

        {skills.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-3 text-sm text-stone-500">oss / tools</h2>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <span key={s} className={T.chip}>
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="mt-14 rounded-2xl border border-dashed border-stone-300 p-5 text-center">
          <div className="font-medium">sign my website!</div>
          <div className="mt-1 text-sm text-stone-500">add your signature ↗</div>
        </section>

        <footer className="mt-14 flex items-center justify-between text-xs text-stone-500">
          <span>made with pain. &lt;3</span>
          <span>v2</span>
        </footer>
      </div>
    </main>
  );
}

function Card({ p }: { p: ProjectSection }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      className={`animate-[fadein_.6s_ease-out] rounded-2xl border bg-white p-4 transition-colors ${open ? "border-stone-300" : "border-stone-200 hover:border-stone-300"}`}
    >
      <ProjectLaunch url={p.siteUrl} onToggle={() => setOpen(!open)} open={open} className="-m-2 block w-[calc(100%+1rem)] rounded-lg p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">{p.title}</h3>
          <span className="shrink-0 text-xs text-stone-500">
            {p.year} {open ? "↑" : "↓"}
          </span>
        </div>
        <div className="mt-0.5 text-sm text-orange-800">{p.award ?? p.category}</div>
        <p className="mt-2 text-sm text-stone-500">{p.tagline}</p>
      </ProjectLaunch>
      {p.siteUrl && <div data-ui-actions className="mt-3 flex items-center gap-2 p-2"><a href={p.siteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-current px-4 text-sm underline">Open project</a><ProjectQR url={p.siteUrl} title={p.title} /></div>}
      <Expand open={open}>
        <div className="text-sm text-stone-700">
          <ProjectDetails
            p={p}
            t={T}
            open={open}
            mock={open ? <MockFrame html={projectPreviewHtml(p)} title={p.title} /> : undefined}
          />
        </div>
      </Expand>
    </article>
  );
}

function CardSkeleton({ title }: { title?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 text-stone-900">
      {title ? <h3 className="font-semibold text-stone-300">{title}</h3> : <Skeleton className="h-5 w-28" />}
      <Skeleton className="mt-2 h-3.5 w-24" />
      <Skeleton className="mt-3 h-3.5 w-full" />
    </div>
  );
}
