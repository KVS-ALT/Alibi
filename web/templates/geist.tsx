"use client";

import { useState } from "react";
import type { Portfolio, ProjectSection } from "@alibi/shared";
import { Expand, Icon, MockFrame, ProjectDetails, Skeleton, fakeHash, slugUrl, type DetailsTheme } from "./parts";

// Dark, dev-tool aesthetic in the style of the Vercel / Next.js docs: grid background, mono labels,
// projects shown as deployment cards (status dot, commit hash, build time).

const T: DetailsTheme = {
  muted: "text-neutral-500",
  border: "border-white/10",
  chip: "rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-neutral-300",
  label: "font-mono text-[11px] uppercase tracking-wider text-neutral-500",
  graph: ["#1a1a1a", "#0e4429", "#006d32", "#26a641", "#39d353"],
  mermaid: "dark",
};

export default function Geist({ portfolio }: { portfolio: Portfolio }) {
  const { hero, projects, skills } = portfolio;
  const entries = Object.entries(projects);

  return (
    <main className="relative min-h-screen bg-black text-neutral-200 selection:bg-white/20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-5 sm:px-8">
        <nav className="flex items-center justify-between border-b border-white/10 pb-4 text-sm">
          <span className="flex items-center gap-2 font-medium text-white">
            <span className="h-5 w-5 rounded-full bg-gradient-to-tr from-neutral-200 to-neutral-500" />
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
              <h1 className="bg-gradient-to-b from-white to-neutral-500 bg-clip-text text-5xl font-semibold tracking-tighter text-transparent sm:text-7xl">
                {hero.name}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400">{hero.bio}</p>

              {hero.currently.length > 0 && (
                <div className="mt-8 max-w-2xl overflow-hidden rounded-lg border border-white/10 bg-neutral-950 font-mono text-[13px]">
                  <div className="border-b border-white/10 px-4 py-2 text-[11px] text-neutral-500">~/{hero.handle} — zsh</div>
                  <div className="space-y-1 p-4">
                    <div>
                      <span className="text-emerald-400">❯</span> <span className="text-white">status --now</span>
                    </div>
                    {hero.currently.map((c) => (
                      <div key={c} className="text-neutral-400">
                        <span className="text-neutral-600">•</span> {c}
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
              <span className="font-mono text-[11px] text-neutral-500">
                {entries.filter(([, p]) => p.status === "ready").length}/{entries.length} deployed
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

        <footer className="mt-20 flex items-center justify-between border-t border-white/10 pt-6 font-mono text-[11px] text-neutral-500">
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
      <button onClick={() => setOpen(!open)} className="block w-full text-left" aria-expanded={open}>
        {p.mockHtml && (
          <div className="border-b border-white/10 p-3 pb-0">
            <MockFrame html={p.mockHtml} url={slugUrl(p.title)} dark />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-white">{p.title}</h3>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ready
            </span>
          </div>
          <p className="mt-1.5 text-sm text-neutral-400">{p.tagline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-neutral-500">
            <span>{p.category}</span>
            <span>main@{fakeHash(p.title)}</span>
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
      </button>
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
