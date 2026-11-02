"use client";

import { useState } from "react";
import type { Portfolio, ProjectSection } from "@alibi/shared";
import { Expand, Icon, MockFrame, ProjectDetails, Skeleton, initials, slugUrl, type DetailsTheme } from "./parts";

// Designer-dev portfolio in the style of jonathanzhou.dev: big name with a serif accent, profile card,
// a featured project followed by a two-column grid, numbered sections and a contact block.

const T: DetailsTheme = {
  muted: "text-neutral-500",
  border: "border-neutral-200",
  chip: "rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-600",
  label: "text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-400",
  graph: ["#f0f0f0", "#d4d4ff", "#a5a5ff", "#6c6cf5", "#3f3fd1"],
  mermaid: "neutral",
};

function SectionTitle({ n, children, aside }: { n: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-8 flex items-baseline justify-between border-b border-neutral-100 pb-3">
      <h2 className="flex items-baseline gap-3 text-sm font-medium text-neutral-900">
        <span className="font-mono text-xs text-indigo-500">{n}</span>
        {children}
      </h2>
      {aside && <span className="text-xs text-neutral-400">{aside}</span>}
    </div>
  );
}

export default function Showcase({ portfolio }: { portfolio: Portfolio }) {
  const { hero, projects, skills } = portfolio;
  const entries = Object.entries(projects);
  const ready = entries.map(([, p]) => p).filter((p) => p.status === "ready");
  const stars = ready.reduce((sum, p) => sum + (p.stars ?? 0), 0);
  const commits = ready.reduce((sum, p) => sum + (p.commits ?? 0), 0);
  const [first, ...rest] = (hero?.name ?? "").split(" ");

  return (
    <main className="min-h-screen bg-[#fcfcfb] text-neutral-900 selection:bg-indigo-100">
      <nav className="sticky top-0 z-20 border-b border-neutral-200/60 bg-[#fcfcfb]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 sm:px-8">
          <span className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">{hero ? initials(hero.name) : "··"}</span>
            {hero?.name ?? <Skeleton className="h-4 w-24" />}
          </span>
          <div className="flex items-center gap-1 text-sm text-neutral-500">
            <a href="#work" className="hidden rounded-md px-3 py-1.5 hover:bg-neutral-100 sm:block">Work</a>
            <a href="#now" className="hidden rounded-md px-3 py-1.5 hover:bg-neutral-100 sm:block">About</a>
            <a href="#contact" className="rounded-md bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700">Contact</a>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <header className="grid gap-10 pb-20 pt-14 sm:pt-20 md:grid-cols-[1fr_260px] md:items-end">
          {hero ? (
            <>
              <div className="animate-[fadein_.6s_ease-out]">
                <div className="flex flex-wrap gap-2">
                  {hero.roles.map((r) => (
                    <span key={r} className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600">
                      {r}
                    </span>
                  ))}
                </div>
                <h1 className="mt-6 text-[52px] font-semibold leading-[0.95] tracking-[-0.03em] sm:text-[84px]">
                  {first}
                  {rest.length > 0 && (
                    <>
                      {" "}
                      <span className="font-[family-name:var(--font-serif)] font-normal italic tracking-normal text-indigo-600">{rest.join(" ")}</span>
                    </>
                  )}
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-relaxed text-neutral-600">{hero.bio}</p>
                <div className="mt-8 flex flex-wrap gap-2.5">
                  <a href="#contact" className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700">
                    {Icon.mail}
                    Get in touch
                  </a>
                  <a href="#work" className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium hover:border-neutral-300">
                    {Icon.github}
                    @{hero.handle}
                  </a>
                </div>
              </div>

              <aside className="animate-[fadein_.8s_ease-out] rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-indigo-400 via-violet-400 to-rose-300 text-sm font-semibold text-white">
                    {initials(hero.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{hero.name}</div>
                    <div className="truncate text-xs text-neutral-500">{hero.location ?? hero.roles[0]}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Open to internships
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    [String(ready.length), "projects"],
                    [String(stars), "stars"],
                    [commits >= 1000 ? `${(commits / 1000).toFixed(1)}k` : String(commits), "commits"],
                  ].map(([v, l]) => (
                    <div key={l} className="rounded-lg bg-neutral-50 py-2">
                      <dd className="text-base font-semibold">{v}</dd>
                      <dt className="text-[10px] text-neutral-500">{l}</dt>
                    </div>
                  ))}
                </dl>
              </aside>
            </>
          ) : (
            <div className="space-y-4 text-neutral-900">
              <Skeleton className="h-6 w-56 rounded-full" />
              <Skeleton className="h-20 w-80" />
              <Skeleton className="mt-8 h-24 w-full max-w-2xl" />
            </div>
          )}
        </header>

        <section id="work" className="scroll-mt-20">
          <SectionTitle n="01" aside={entries.length > 0 ? `${entries.length} project${entries.length === 1 ? "" : "s"}` : undefined}>
            Selected work
          </SectionTitle>
          <div className="grid gap-x-6 gap-y-12 md:grid-cols-2">
            {entries.length === 0 && <CardSkeleton featured />}
            {entries.map(([id, p], i) =>
              p.status === "ready" ? <Card key={id} p={p} featured={i === 0} /> : <CardSkeleton key={id} title={p.title} featured={i === 0} />,
            )}
          </div>
        </section>

        {hero && (hero.currently.length > 0 || skills.length > 0) && (
          <section id="now" className="mt-24 grid scroll-mt-20 gap-12 md:grid-cols-2">
            {hero.currently.length > 0 && (
              <div>
                <SectionTitle n="02">Now</SectionTitle>
                <ul className="space-y-3">
                  {hero.currently.map((c) => (
                    <li key={c} className="flex gap-3 text-neutral-700">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                      <span className="first-letter:uppercase">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {skills.length > 0 && (
              <div>
                <SectionTitle n="03">Toolbox</SectionTitle>
                <ul className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <li key={s} className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {hero && (
          <section id="contact" className="mt-24 scroll-mt-20 overflow-hidden rounded-3xl bg-neutral-900 px-8 py-12 text-white sm:px-12 sm:py-16">
            <div className="text-sm text-neutral-400">Have something in mind?</div>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Let&apos;s build something <span className="font-[family-name:var(--font-serif)] font-normal italic text-indigo-300">together.</span>
            </h2>
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-neutral-900">
                {Icon.mail}
                Say hi
              </span>
              <span className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-sm">
                {Icon.linkedin}
                LinkedIn
              </span>
            </div>
          </section>
        )}

        <footer className="flex flex-wrap justify-between gap-2 py-10 text-xs text-neutral-400">
          <span>
            © {new Date().getFullYear()} {hero?.name}
          </span>
          <span>Built with Next.js</span>
        </footer>
      </div>
    </main>
  );
}

function Card({ p, featured }: { p: ProjectSection; featured: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`animate-[fadein_.6s_ease-out] ${featured || open ? "md:col-span-2" : ""}`}>
      <button onClick={() => setOpen(!open)} className="group block w-full text-left" aria-expanded={open}>
        {p.mockHtml && (
          <div className="transition-transform duration-300 group-hover:-translate-y-1">
            <MockFrame html={p.mockHtml} url={slugUrl(p.title)} />
          </div>
        )}
        <div className="mt-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-xl font-semibold tracking-tight">{p.title}</h3>
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400">
                {p.category} · {p.year}
              </span>
            </div>
            <p className="mt-1.5 text-neutral-600">{p.tagline}</p>
          </div>
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition group-hover:border-neutral-300 ${open ? "rotate-45" : ""}`}
          >
            +
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {p.award && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">◆ {p.award}</span>
          )}
          {p.stack.slice(0, featured ? 5 : 3).map((s) => (
            <span key={s} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
              {s}
            </span>
          ))}
          {p.stars !== undefined && (
            <span className="ml-auto flex items-center gap-1 text-xs text-neutral-400">
              {Icon.star}
              {p.stars}
            </span>
          )}
        </div>
      </button>
      <Expand open={open}>
        <div className="text-neutral-700">
          <ProjectDetails p={p} t={T} open={open} />
        </div>
      </Expand>
    </article>
  );
}

function CardSkeleton({ title, featured }: { title?: string; featured?: boolean }) {
  return (
    <div className={`text-neutral-900 ${featured ? "md:col-span-2" : ""}`}>
      <Skeleton className="aspect-[960/700] w-full rounded-2xl" />
      {title ? <h3 className="mt-5 text-xl font-semibold text-neutral-300">{title}</h3> : <Skeleton className="mt-5 h-6 w-32" />}
      <Skeleton className="mt-3 h-4 w-3/4" />
    </div>
  );
}
