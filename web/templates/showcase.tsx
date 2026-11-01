"use client";

import { useState } from "react";
import type { Portfolio, ProjectSection } from "@alibi/shared";
import { ProjectLaunch, Expand, Icon, MockFrame, ProjectDetails, Skeleton, portfolioTitle, projectPreviewHtml, type DetailsTheme } from "./parts";

// Designer-dev portfolio in the style of jonathanzhou.dev: big name, "currently" list,
// image-topped project cards with CATEGORY • YEAR tags.

const T: DetailsTheme = {
  muted: "text-neutral-500",
  border: "border-neutral-200",
  chip: "rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600",
  label: "text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500",
  graph: ["#f0f0f0", "#d4d4ff", "#a5a5ff", "#6c6cf5", "#3f3fd1"],
  mermaid: "neutral",
};

export default function Showcase({ portfolio }: { portfolio: Portfolio }) {
  const { hero, projects, skills } = portfolio;
  const entries = Object.entries(projects);

  return (
    <main className="min-h-screen bg-white text-neutral-900 selection:bg-indigo-100">
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-8">
        <nav className="flex items-center justify-between text-sm">
          <span className="font-semibold">{hero?.name ?? <Skeleton className="h-4 w-24" />}</span>
          <div className="flex items-center gap-5 text-neutral-500">
            <a href="#projects">projects</a>
            <span>resume</span>
            <span className="hidden items-center gap-3 sm:flex">
              {Icon.github}
              {Icon.linkedin}
              {Icon.mail}
            </span>
          </div>
        </nav>

        <header className="pb-14 pt-16 sm:pt-24">
          {hero ? (
            <div className="animate-[fadein_.6s_ease-out]">
              <div className="flex flex-wrap gap-x-3 text-sm text-neutral-500">
                {hero.roles.map((r) => (
                  <span key={r}>{r}</span>
                ))}
              </div>
              <h1 className="mt-2 break-words text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
                {portfolioTitle(hero.name)}
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-600">{hero.bio}</p>

              {hero.currently.length > 0 && (
                <div className="mt-8">
                  <div className={T.label}>currently</div>
                  <ul className="mt-3 space-y-1.5">
                    {hero.currently.map((c) => (
                      <li key={c} className="flex gap-2.5 text-neutral-700">
                        <span className="text-indigo-500">✳</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-8 flex items-center gap-4 text-neutral-500 sm:hidden">
                {Icon.github}
                {Icon.linkedin}
                {Icon.mail}
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-neutral-900">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16 w-72" />
              <Skeleton className="mt-8 h-24 w-full" />
            </div>
          )}
        </header>

        <section id="projects">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className={T.label}>selected projects</h2>
            {entries.length > 0 && <span className="text-xs text-neutral-500">{entries.length} projects</span>}
          </div>
          <div className="space-y-12">
            {entries.length === 0 && <CardSkeleton />}
            {entries.map(([id, p]) => (p.status === "ready" ? <Card key={id} p={p} /> : <CardSkeleton key={id} title={p.title} />))}
          </div>
        </section>

        {skills.length > 0 && (
          <section className="mt-16">
            <h2 className={T.label}>toolbox</h2>
            <p className="mt-3 text-neutral-600">{skills.join(" · ")}</p>
          </section>
        )}

        <footer className="mt-20 border-t border-neutral-100 pt-6 text-xs leading-relaxed text-neutral-500">
          Designed in Figma, built with Next.js, deployed on Render.
          <br />© {new Date().getFullYear()} {hero?.name}
        </footer>
      </div>
    </main>
  );
}

function Card({ p }: { p: ProjectSection }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="animate-[fadein_.6s_ease-out]">
      <ProjectLaunch url={p.siteUrl} onToggle={() => setOpen(!open)} open={open} className="group -m-2 block w-[calc(100%+1rem)] rounded-xl p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
        <div className="transition-transform duration-300 group-hover:-translate-y-1">
          <MockFrame html={projectPreviewHtml(p)} title={p.title} />
        </div>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">{p.title}</h3>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
              {p.category} • {p.year}
            </div>
          </div>
          <span
            className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition-transform ${open ? "rotate-45" : ""}`}
          >
            +
          </span>
        </div>
        <p className="mt-2 text-neutral-600">{p.tagline}</p>
        {p.award && <p className="mt-2 text-sm font-medium text-indigo-600">🏆 {p.award}</p>}
      </ProjectLaunch>
      <Expand open={open}>
        <div className="text-neutral-700">
          <ProjectDetails p={p} t={T} open={open} />
        </div>
      </Expand>
    </article>
  );
}

function CardSkeleton({ title }: { title?: string }) {
  return (
    <div className="text-neutral-900">
      <Skeleton className="aspect-[960/630] w-full rounded-xl" />
      {title ? <h3 className="mt-4 text-xl font-semibold text-neutral-300">{title}</h3> : <Skeleton className="mt-4 h-6 w-32" />}
      <Skeleton className="mt-3 h-4 w-3/4" />
    </div>
  );
}
