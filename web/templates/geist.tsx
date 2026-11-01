"use client";

import { useState } from "react";
import type { Portfolio, ProjectSection } from "@alibi/shared";
import { ProjectLaunch, Expand, Icon, MockFrame, ProjectDetails, Skeleton, portfolioTitle, projectPreviewHtml, type DetailsTheme } from "./parts";

// Dark, dev-tool aesthetic in the style of the Vercel / Next.js docs: grid background, mono labels,
// projects shown as deployment cards (status dot, commit hash, build time).

const T: DetailsTheme = {
  muted: "text-neutral-400",
  border: "border-white/10",
  chip: "rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-neutral-300",
  label: "font-mono text-[11px] uppercase tracking-wider text-neutral-400",
  graph: ["#1a1a1a", "#0e4429", "#006d32", "#26a641", "#39d353"],
  mermaid: "dark",
};

export default function Geist({ portfolio }: { portfolio: Portfolio }) {
  const { hero, projects, skills } = portfolio;
  const entries = Object.entries(projects);

  return (
    <main className="relative min-h-screen bg-black text-neutral-200 selection:bg-white/20">
      <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-5 sm:px-8">
        <nav className="flex items-center justify-between border-b border-white/10 pb-4 text-sm">
          <span className="flex items-center gap-2 font-medium text-white">
            <span className="h-5 w-5 rounded-full bg-neutral-300" />
            {hero?.handle ?? "…"}
          </span>
          <div className="flex items-center gap-5 text-neutral-400">
            <a href="#projects">Projects</a>
            <span className="hidden sm:inline">Resume</span>
            {Icon.github}
          </div>
        </nav>

        <header className="py-16 sm:py-24">
          {hero ? (
            <div className="animate-[fadein_.6s_ease-out]">
              <div className="mb-5 flex flex-wrap gap-2">
                {hero.roles.map((r) => (
                  <span key={r} className="rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] text-neutral-400">
                    {r}
                  </span>
                ))}
              </div>
              <h1 className="break-words text-5xl font-semibold tracking-tighter text-white sm:text-7xl">
                {portfolioTitle(hero.name)}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400">{hero.bio}</p>

              {hero.currently.length > 0 && (
                <div className="mt-8 max-w-2xl overflow-hidden rounded-lg border border-white/10 bg-neutral-950 font-mono text-[13px]">
                  <div className="border-b border-white/10 px-4 py-2 text-[11px] text-neutral-400">~/{hero.handle} — zsh</div>
                  <div className="space-y-1 p-4">
                    <div>
                      <span aria-hidden className="mr-1 inline-block h-2 w-2 rotate-45 border-r-2 border-t-2 border-emerald-400 align-middle" /> <span className="text-white">status --now</span>
                    </div>
                    {hero.currently.map((c) => (
                      <div key={c} className="text-neutral-400">
                        <span aria-hidden className="mr-1 inline-block h-1 w-1 rounded-full bg-neutral-500 align-middle" /> {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-white">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-16 w-80" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
        </header>

        <section id="projects">
          <div className="mb-5 flex items-center justify-between">
            <h2 className={T.label}>Projects</h2>
            {entries.length > 0 && (
              <span className="font-mono text-[11px] text-neutral-400">
                {entries.filter(([, p]) => p.status === "ready").length}/{entries.length} projects
              </span>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {entries.length === 0 && <CardSkeleton />}
            {entries.map(([id, p]) => (p.status === "ready" ? <Card key={id} p={p} /> : <CardSkeleton key={id} title={p.title} />))}
          </div>
        </section>

        {skills.length > 0 && (
          <section className="mt-16">
            <h2 className={T.label}>Stack</h2>
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-4">
              {skills.map((s) => (
                <div key={s} className="bg-black px-4 py-3 font-mono text-sm text-neutral-300">
                  {s}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-20 flex items-center justify-between border-t border-white/10 pt-6 font-mono text-[11px] text-neutral-400">
          <span>© {new Date().getFullYear()} {hero?.name}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            All systems normal
          </span>
        </footer>
      </div>
    </main>
  );
}

function Card({ p }: { p: ProjectSection }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      className={`animate-[fadein_.6s_ease-out] overflow-hidden rounded-xl border bg-neutral-950 transition-colors ${open ? "border-white/25 md:col-span-2" : "border-white/10 hover:border-white/20"}`}
    >
      <ProjectLaunch url={p.siteUrl} onToggle={() => setOpen(!open)} open={open} className="block w-full text-left">
        <div className="border-b border-white/10 p-3 pb-0">
          <MockFrame html={projectPreviewHtml(p)} title={p.title} dark />
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-white">{p.title}</h3>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ready
            </span>
          </div>
          <p className="mt-1.5 text-sm text-neutral-400">{p.tagline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-neutral-400">
            <span>{p.category}</span>
            <span>{p.year}</span>
            {p.lastPushed && <span>{p.lastPushed}</span>}
            {p.stars !== undefined && (
              <span className="flex items-center gap-1">
                {Icon.star}
                {p.stars}
              </span>
            )}
          </div>
          {p.award && <div className="mt-3 text-xs text-amber-300/90">◆ {p.award}</div>}
        </div>
      </ProjectLaunch>
      <Expand open={open}>
        <div className="border-t border-white/10 px-4 pb-5 text-sm text-neutral-300">
          <ProjectDetails p={p} t={T} open={open} />
        </div>
      </Expand>
    </article>
  );
}

function CardSkeleton({ title }: { title?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950 p-3 text-white">
      <Skeleton className="aspect-[960/630] w-full rounded-lg" />
      <div className="flex items-center justify-between p-1 pt-4">
        {title ? <h3 className="font-semibold text-neutral-600">{title}</h3> : <Skeleton className="h-5 w-28" />}
        <span className="flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2 py-0.5 font-mono text-[11px] text-amber-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Building
        </span>
      </div>
      <Skeleton className="mx-1 mt-2 h-3.5 w-3/4" />
    </div>
  );
}
