"use client";

import type { Portfolio, ProjectSection } from "@alibi/shared";
import { CommitGraph, Mermaid, Skeleton } from "./parts";

const GRAPH: [string, string, string, string, string] = ["#ebedf0", "#c6e48b", "#7bc96f", "#239a3b", "#196127"];

export default function Minimal({ portfolio }: { portfolio: Portfolio }) {
  const { hero, projects } = portfolio;
  const entries = Object.entries(projects);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:py-20">
        <header className="mb-14">
          {hero ? (
            <>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{hero.name}</h1>
              <p className="mt-2 text-lg text-neutral-500">{hero.headline}</p>
              <p className="mt-6 leading-relaxed text-neutral-700">{hero.bio}</p>
            </>
          ) : (
            <div className="space-y-3 text-neutral-900">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-5 w-72" />
              <Skeleton className="mt-6 h-20 w-full" />
            </div>
          )}
        </header>

        <h2 className="mb-6 text-xs font-medium uppercase tracking-widest text-neutral-400">Projects</h2>
        <div className="space-y-14">
          {entries.length === 0 && <ProjectSkeleton />}
          {entries.map(([id, p]) => (p.status === "ready" ? <Project key={id} p={p} /> : <ProjectSkeleton key={id} />))}
        </div>

        <footer className="mt-20 border-t border-neutral-100 pt-6 text-xs text-neutral-400">
          {hero?.name ?? "Portfolio"} · {new Date().getFullYear()}
        </footer>
      </div>
    </main>
  );
}

function Project({ p }: { p: ProjectSection }) {
  return (
    <article className="animate-[fadein_.5s_ease-out]">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xl font-semibold">{p.title}</h3>
        {p.stars !== undefined && <span className="shrink-0 text-sm text-neutral-500">★ {p.stars}</span>}
      </div>
      <p className="mt-2 leading-relaxed text-neutral-700">{p.summary}</p>

      {p.stack.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {p.stack.map((s) => (
            <li key={s} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
              {s}
            </li>
          ))}
        </ul>
      )}

      {p.metrics.length > 0 && (
        <dl className="mt-6 grid grid-cols-3 gap-3">
          {p.metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-neutral-100 p-3">
              <dt className="text-xs text-neutral-500">{m.label}</dt>
              <dd className="mt-1 text-lg font-semibold">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {p.highlights.length > 0 && (
        <ul className="mt-6 list-disc space-y-1.5 pl-5 text-neutral-700 marker:text-neutral-300">
          {p.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      {p.diagramMermaid && (
        <div className="mt-6 rounded-lg border border-neutral-100 p-4">
          <Mermaid source={p.diagramMermaid} />
        </div>
      )}

      {p.commitGraph && p.commitGraph.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <CommitGraph data={p.commitGraph} colors={GRAPH} />
        </div>
      )}
    </article>
  );
}

function ProjectSkeleton() {
  return (
    <div className="space-y-3 text-neutral-900">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-16 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}
