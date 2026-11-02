import type { Portfolio, ProjectSection, TemplateId } from "@alibi/shared";

// Hand-written sample portfolio. Used by /preview, by /p/demo-backup, and later as few-shot examples
// for the agent's mock-UI prompt, so the mockHtml here is the quality bar for generated mocks.

const SHIPIT_MOCK = `
<div class="flex h-full bg-neutral-950 text-neutral-200">
  <aside class="w-52 border-r border-white/10 p-5">
    <div class="mb-8 flex items-center gap-2 text-lg font-semibold text-white"><div class="h-6 w-6 rounded-md bg-gradient-to-br from-emerald-400 to-cyan-500"></div>shipit</div>
    <nav class="space-y-1 text-sm">
      <div class="rounded-md bg-white/10 px-3 py-2 text-white">Deployments</div>
      <div class="px-3 py-2 text-neutral-400">Projects</div>
      <div class="px-3 py-2 text-neutral-400">Previews</div>
      <div class="px-3 py-2 text-neutral-400">Cache</div>
      <div class="px-3 py-2 text-neutral-400">Settings</div>
    </nav>
  </aside>
  <main class="flex-1 p-8">
    <div class="mb-6 flex items-end justify-between">
      <div><div class="text-sm text-neutral-500">robotics-club / website</div><h1 class="text-2xl font-semibold text-white">Deployments</h1></div>
      <div class="rounded-md bg-white px-4 py-2 text-sm font-medium text-black">Redeploy</div>
    </div>
    <div class="mb-6 grid grid-cols-3 gap-4">
      <div class="rounded-lg border border-white/10 p-4"><div class="text-xs text-neutral-500">Median build</div><div class="mt-1 text-2xl font-semibold text-white">41s</div><div class="text-xs text-emerald-400">−54% vs no cache</div></div>
      <div class="rounded-lg border border-white/10 p-4"><div class="text-xs text-neutral-500">Cache hit rate</div><div class="mt-1 text-2xl font-semibold text-white">87%</div><div class="text-xs text-neutral-500">last 7 days</div></div>
      <div class="rounded-lg border border-white/10 p-4"><div class="text-xs text-neutral-500">Deploys this week</div><div class="mt-1 text-2xl font-semibold text-white">23</div><div class="text-xs text-neutral-500">6 previews open</div></div>
    </div>
    <div class="overflow-hidden rounded-lg border border-white/10 text-sm">
      <div class="flex items-center gap-4 border-b border-white/10 px-4 py-3"><span class="h-2 w-2 rounded-full bg-emerald-400"></span><span class="w-24 font-mono text-neutral-400">a3f9c21</span><span class="flex-1 text-white">fix: hero image aspect ratio on mobile</span><span class="rounded bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-400">Ready</span><span class="w-16 text-right text-neutral-500">38s</span></div>
      <div class="flex items-center gap-4 border-b border-white/10 px-4 py-3"><span class="h-2 w-2 rounded-full bg-amber-400"></span><span class="w-24 font-mono text-neutral-400">7bd0e4a</span><span class="flex-1 text-white">feat: sponsors page</span><span class="rounded bg-amber-400/10 px-2 py-0.5 text-xs text-amber-400">Building</span><span class="w-16 text-right text-neutral-500">12s</span></div>
      <div class="flex items-center gap-4 border-b border-white/10 px-4 py-3"><span class="h-2 w-2 rounded-full bg-emerald-400"></span><span class="w-24 font-mono text-neutral-400">e01c88f</span><span class="flex-1 text-white">chore: bump astro to 4.15</span><span class="rounded bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-400">Ready</span><span class="w-16 text-right text-neutral-500">44s</span></div>
      <div class="flex items-center gap-4 border-b border-white/10 px-4 py-3"><span class="h-2 w-2 rounded-full bg-red-400"></span><span class="w-24 font-mono text-neutral-400">91aa3d2</span><span class="flex-1 text-white">feat: team roster from sheets</span><span class="rounded bg-red-400/10 px-2 py-0.5 text-xs text-red-400">Failed</span><span class="w-16 text-right text-neutral-500">19s</span></div>
      <div class="flex items-center gap-4 px-4 py-3"><span class="h-2 w-2 rounded-full bg-emerald-400"></span><span class="w-24 font-mono text-neutral-400">4c7e110</span><span class="flex-1 text-white">init</span><span class="rounded bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-400">Ready</span><span class="w-16 text-right text-neutral-500">1m 31s</span></div>
    </div>
  </main>
</div>`;

const STUDYMATCH_MOCK = `
<div class="h-full bg-[#f7f5f0] text-stone-800">
  <header class="flex items-center justify-between border-b border-stone-200 bg-white px-8 py-4">
    <div class="text-xl font-bold tracking-tight">study<span class="text-indigo-600">match</span></div>
    <div class="flex items-center gap-6 text-sm text-stone-500"><span class="font-medium text-stone-900">My groups</span><span>Browse</span><span>Schedule</span><div class="h-8 w-8 rounded-full bg-indigo-200"></div></div>
  </header>
  <main class="p-8">
    <div class="mb-1 text-sm text-stone-500">Fall 2026 · 5 courses</div>
    <h1 class="mb-6 text-3xl font-bold">Your matches this week</h1>
    <div class="grid grid-cols-3 gap-5">
      <div class="rounded-2xl bg-white p-5 shadow-sm"><div class="mb-3 flex items-center justify-between"><span class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">CS 341</span><span class="text-sm font-semibold text-emerald-600">94% match</span></div><div class="mb-1 text-lg font-semibold">Algorithms grind</div><div class="mb-4 text-sm text-stone-500">Tue + Thu · main library · 7pm</div><div class="flex -space-x-2"><div class="h-8 w-8 rounded-full border-2 border-white bg-rose-300"></div><div class="h-8 w-8 rounded-full border-2 border-white bg-amber-300"></div><div class="h-8 w-8 rounded-full border-2 border-white bg-sky-300"></div><div class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-stone-100 text-xs">+2</div></div><div class="mt-5 rounded-lg bg-indigo-600 py-2 text-center text-sm font-medium text-white">Join group</div></div>
      <div class="rounded-2xl bg-white p-5 shadow-sm"><div class="mb-3 flex items-center justify-between"><span class="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">MATH 239</span><span class="text-sm font-semibold text-emerald-600">88% match</span></div><div class="mb-1 text-lg font-semibold">Graph theory pset crew</div><div class="mb-4 text-sm text-stone-500">Sun · Discord · 3pm</div><div class="flex -space-x-2"><div class="h-8 w-8 rounded-full border-2 border-white bg-lime-300"></div><div class="h-8 w-8 rounded-full border-2 border-white bg-violet-300"></div><div class="h-8 w-8 rounded-full border-2 border-white bg-orange-300"></div></div><div class="mt-5 rounded-lg bg-indigo-600 py-2 text-center text-sm font-medium text-white">Join group</div></div>
      <div class="rounded-2xl bg-white p-5 shadow-sm"><div class="mb-3 flex items-center justify-between"><span class="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">STAT 230</span><span class="text-sm font-semibold text-amber-600">71% match</span></div><div class="mb-1 text-lg font-semibold">Midterm review</div><div class="mb-4 text-sm text-stone-500">Wed · Room 2034 · 6pm</div><div class="flex -space-x-2"><div class="h-8 w-8 rounded-full border-2 border-white bg-teal-300"></div><div class="h-8 w-8 rounded-full border-2 border-white bg-pink-300"></div></div><div class="mt-5 rounded-lg border border-stone-200 py-2 text-center text-sm font-medium">Request invite</div></div>
    </div>
    <div class="mt-6 flex items-center gap-3 rounded-xl bg-white p-4 text-sm shadow-sm"><span class="text-lg">⚡</span><span>Matching runs every Sunday at 9pm based on your calendar and course load.</span><span class="ml-auto text-indigo-600">Edit availability →</span></div>
  </main>
</div>`;

const FRIDGECAM_MOCK = `
<div class="flex h-full items-center justify-center gap-12 bg-gradient-to-br from-orange-50 to-rose-100 p-8">
  <div class="h-[540px] w-[260px] overflow-hidden rounded-[36px] border-[6px] border-neutral-900 bg-neutral-900 shadow-2xl">
    <div class="relative h-[320px] bg-gradient-to-b from-slate-200 to-slate-300">
      <div class="absolute inset-x-4 top-16 h-px bg-slate-400"></div><div class="absolute inset-x-4 top-40 h-px bg-slate-400"></div><div class="absolute inset-x-4 top-64 h-px bg-slate-400"></div>
      <div class="absolute left-6 top-7 text-4xl">🥚</div><div class="absolute left-5 top-5 h-12 w-14 rounded border-2 border-lime-400"><span class="absolute -top-4 left-0 rounded bg-lime-400 px-1 text-[8px] font-bold">eggs .97</span></div>
      <div class="absolute right-8 top-24 text-4xl">🥬</div><div class="absolute right-6 top-[88px] h-14 w-14 rounded border-2 border-lime-400"><span class="absolute -top-4 left-0 rounded bg-lime-400 px-1 text-[8px] font-bold">spinach .91</span></div>
      <div class="absolute left-10 top-[184px] text-4xl">🧀</div><div class="absolute left-8 top-[178px] h-12 w-14 rounded border-2 border-lime-400"><span class="absolute -top-4 left-0 rounded bg-lime-400 px-1 text-[8px] font-bold">feta .84</span></div>
      <div class="absolute right-10 top-[190px] text-4xl">🍅</div><div class="absolute right-8 top-[184px] h-12 w-12 rounded border-2 border-amber-400"><span class="absolute -top-4 left-0 rounded bg-amber-400 px-1 text-[8px] font-bold">tomato .62</span></div>
    </div>
    <div class="h-full bg-white p-4">
      <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">4 items found</div>
      <div class="mb-2 rounded-xl bg-orange-50 p-3"><div class="text-sm font-semibold">Spinach &amp; feta omelette</div><div class="text-xs text-neutral-500">12 min · uses 4/4</div></div>
      <div class="rounded-xl bg-neutral-50 p-3"><div class="text-sm font-semibold">Shakshuka</div><div class="text-xs text-neutral-500">25 min · uses 3/4 + onion</div></div>
    </div>
  </div>
  <div class="max-w-xs">
    <div class="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-600 shadow-sm">on-device · 38ms / frame</div>
    <h2 class="mb-3 text-4xl font-bold leading-tight text-neutral-900">Point your phone at the fridge. Get dinner.</h2>
    <p class="text-neutral-600">YOLOv8n fine-tuned on 2.1k labelled fridge photos, exported to Core ML. Recipes ranked by how much of what you have they use.</p>
  </div>
</div>`;

export const SAMPLE_PORTFOLIO: Portfolio = {
  templateId: "showcase",
  hero: {
    name: "Sam Rivera",
    handle: "samrivera",
    roles: ["cs student", "builder", "occasional designer"],
    bio: "I build small tools that people actually keep using: a deploy CLI six student clubs run on, a study-group matcher that made it through a whole semester, and an iOS app that tells you what to cook from a photo of your fridge.",
    currently: [
      "shipping shipit v2 with monorepo support",
      "ta for cs 136",
      "looking for summer 2027 swe internships",
    ],
    location: "Toronto, ON",
  },
  skills: ["TypeScript", "Go", "Python", "React", "Postgres", "Docker", "PyTorch", "Swift"],
  projects: {
    shipit: {
      status: "ready",
      title: "shipit",
      category: "DEV TOOL",
      year: 2026,
      tagline: "Zero-config deploys and branch previews for student club websites.",
      mockHtml: SHIPIT_MOCK,
      summary:
        "Club sites kept breaking because every exec team set up deploys differently. shipit detects the framework from the lockfile, builds in a cached container, and publishes to Cloudflare Pages with a preview URL per pull request.",
      highlights: [
        "Framework detection from lockfile + config heuristics, so no YAML for most repos",
        "Docker layer cache keyed on lockfile hash cut median build from 90s to 41s",
        "Posts preview links back to PRs as a GitHub App comment",
      ],
      metrics: [
        { label: "clubs using it", value: "6" },
        { label: "median deploy", value: "41s" },
        { label: "deploys", value: "380+" },
      ],
      stack: ["Go", "Docker", "GitHub Actions", "Cloudflare Pages"],
      diagramMermaid:
        "flowchart LR\n  push[git push] --> gha[GitHub Actions]\n  gha --> cli[shipit build]\n  cli <--> cache[(layer cache)]\n  cli --> cf[Cloudflare Pages]\n  cf --> pr[PR comment]",
      commitGraph: [0, 2, 5, 3, 0, 1, 4, 6, 2, 0, 3, 7, 5, 2, 1, 0, 4, 3, 6, 8, 2, 0, 1, 3, 5, 4, 2, 6, 3, 0, 0, 2, 4, 5, 1],
      commits: 214,
      lastPushed: "2 days ago",
      stars: 47,
      repo: "samrivera/shipit",
    },
    studymatch: {
      status: "ready",
      title: "studymatch",
      category: "WEB APP",
      year: 2025,
      tagline: "Matches classmates into study groups by course, schedule, and pace.",
      award: "Best Social Impact @ Hack the North",
      mockHtml: STUDYMATCH_MOCK,
      summary:
        "Started as a hackathon project and kept running for the rest of the term. Students connect their calendar and courses, and a weekly job groups them by overlap in free time and self-reported pace.",
      highlights: [
        "Weekly matching as a greedy pass over a course × time-slot overlap score",
        "Google Calendar free/busy sync, no event details stored",
        "Ran on a single Postgres instance for the whole term with no downtime",
      ],
      metrics: [
        { label: "signups", value: "312" },
        { label: "groups formed", value: "58" },
        { label: "weekly active", value: "~140" },
      ],
      stack: ["Next.js", "TypeScript", "Postgres", "Prisma", "Google Calendar API"],
      diagramMermaid:
        "flowchart LR\n  ui[Next.js app] --> api[API routes]\n  api --> pg[(Postgres)]\n  cron[weekly match job] --> pg\n  api --> gcal[Calendar free/busy]",
      commitGraph: [3, 8, 12, 9, 4, 0, 0, 1, 2, 3, 1, 0, 2, 1, 0, 0, 1, 2, 0, 1, 0, 0, 0, 1, 0, 2, 1, 0],
      commits: 163,
      lastPushed: "3 weeks ago",
      stars: 22,
      repo: "samrivera/studymatch",
    },
    fridgecam: {
      status: "ready",
      title: "fridgecam",
      category: "IOS · ML",
      year: 2026,
      tagline: "Snap your fridge, get recipes that use what you already have.",
      mockHtml: FRIDGECAM_MOCK,
      summary:
        "An iOS app that runs a small object detector on-device to find ingredients in a photo of your fridge, then ranks recipes by how much of what you have they use.",
      highlights: [
        "Fine-tuned YOLOv8n on 2.1k hand-labelled fridge photos (31 ingredient classes)",
        "Exported to Core ML, ~38ms per frame on an iPhone 13",
        "Recipe ranking is a simple coverage score, no LLM in the loop",
      ],
      metrics: [
        { label: "mAP@50", value: "0.71" },
        { label: "classes", value: "31" },
        { label: "TestFlight users", value: "40" },
      ],
      stack: ["Swift", "SwiftUI", "PyTorch", "Core ML", "Ultralytics"],
      diagramMermaid:
        "flowchart LR\n  cam[Camera] --> det[YOLOv8n Core ML]\n  det --> items[ingredients]\n  items --> rank[coverage ranker]\n  db[(recipe JSON)] --> rank\n  rank --> ui[SwiftUI list]",
      commitGraph: [0, 0, 1, 0, 2, 4, 3, 0, 5, 6, 2, 1, 0, 3, 4, 2, 0, 0, 1, 3, 2],
      commits: 97,
      lastPushed: "5 days ago",
      stars: 31,
      repo: "samrivera/fridgecam",
    },
  },
  contradictions: [],
};

// Build stages, so templates can be checked at every point of a live build.
export const STAGES = ["empty", "hero", "partial", "full"] as const;
export type Stage = (typeof STAGES)[number];

function pending(p: ProjectSection): ProjectSection {
  // Only the title is known from claims before write_project finishes.
  return { status: "pending", title: p.title, category: "", year: p.year, tagline: "", summary: "", highlights: [], metrics: [], stack: [] };
}

export function samplePortfolio(templateId: TemplateId, stage: Stage = "full"): Portfolio {
  const base = { ...SAMPLE_PORTFOLIO, templateId };
  const entries = Object.entries(SAMPLE_PORTFOLIO.projects);
  switch (stage) {
    case "empty":
      return { ...base, hero: undefined, skills: [], projects: {} };
    case "hero":
      return { ...base, projects: Object.fromEntries(entries.map(([id, p]) => [id, pending(p)])) };
    case "partial":
      return { ...base, projects: Object.fromEntries(entries.map(([id, p], i) => [id, i === 0 ? p : pending(p)])) };
    case "full":
      return base;
  }
}
