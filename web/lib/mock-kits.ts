import { z } from "zod";
import type { ProjectSection } from '@alibi/shared';
import { MOCK_KIT_CSS } from './mock-kit-styles';

// Hand-built mock product UIs ("kits"). The agent picks a kit and fills a MockSpec; renderMock turns it
// into the static Tailwind HTML that MockFrame shows in a sandboxed iframe at 960x600. All text is escaped,
// so the model never writes markup and every mock looks as good as the hand-made fixtures.

export const KITS = ["dashboard", "cards", "phone", "terminal", "chat", "extension"] as const;
export const ACCENTS = ["emerald", "indigo", "sky", "violet", "orange", "rose", "amber", "teal"] as const;
type Status = "good" | "warn" | "bad" | "neutral";

const s = (max: number, fallback = "") => z.coerce.string().trim().transform((v) => v.slice(0, max)).catch(fallback);
const Item = z.object({
  title: s(64),
  subtitle: s(48),
  meta: s(20),
  tag: s(16),
  status: z.enum(["good", "warn", "bad", "neutral"]).catch("neutral"),
});
export const MockSpec = z.object({
  kit: z.enum(KITS).catch("dashboard"),
  theme: z.enum(["dark", "light"]).catch("dark"),
  accent: z.enum(ACCENTS).catch("indigo"),
  appName: s(24, "app"),
  context: s(48),
  nav: z.array(s(18)).catch([]).transform((a) => a.filter(Boolean).slice(0, 5)),
  heading: s(60),
  action: s(20, "New"),
  stats: z
    .array(z.object({ label: s(24), value: s(12), note: s(28) }))
    .catch([])
    .transform((a) => a.slice(0, 3)),
  items: z.array(Item).catch([]).transform((a) => a.filter((i) => i.title).slice(0, 6)),
  callout: s(140),
  user: s(24, "you"),
});
export type MockSpec = z.infer<typeof MockSpec>;

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STATUS: Record<Status, string> = { good: "emerald", warn: "amber", bad: "rose", neutral: "slate" };
const AVATARS = ["bg-rose-300", "bg-amber-300", "bg-sky-300", "bg-lime-300", "bg-violet-300", "bg-teal-300", "bg-orange-300", "bg-pink-300"];
const avatar = (seed: string, i: number) => AVATARS[(seed.length * 7 + i * 3) % AVATARS.length];
const initials = (v: string) => esc(v.replace(/[^\p{L}\p{N}\s_-]/gu, "").split(/[\s_-]+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "A");
// Kits add their own "#", "/" and "@" prefixes; models often include them too.
const bare = (v: string) => v.replace(/^[#/@\s]+/, "");

function theme(dark: boolean) {
  return dark
    ? { bg: "bg-neutral-950", text: "text-neutral-300", strong: "text-white", muted: "text-neutral-500", border: "border-white/10", card: "border border-white/10 bg-white/[0.03]", active: "bg-white/10" }
    : { bg: "bg-[#f7f6f3]", text: "text-neutral-700", strong: "text-neutral-900", muted: "text-neutral-500", border: "border-neutral-200", card: "border border-neutral-200 bg-white shadow-sm", active: "bg-neutral-900/5" };
}

function pad<T>(arr: T[], n: number, make: (i: number) => T): T[] {
  const out = [...arr];
  while (out.length < n) out.push(make(out.length));
  return out;
}

function normalize(spec: MockSpec) {
  return {
    ...spec,
    nav: pad(spec.nav.map(bare).filter(Boolean), 4, (i) => ["Overview", "Activity", "Insights", "Settings"][i]),
    action: bare(spec.action) || "New",
    user: spec.user || "you",
    stats: pad(spec.stats, 3, (i) => ({ label: ["Today", "This week", "Total"][i], value: ["12", "84", "1.2k"][i], note: "" })),
    items: pad(spec.items, 4, (i) => ({ title: `Item ${i + 1}`, subtitle: "", meta: `${i + 2}m ago`, tag: "", status: "neutral" as Status })),
  };
}
type Spec = ReturnType<typeof normalize>;

// Deterministic bar heights (percent) so a chart looks like real activity and stays stable per product.
function bars(seed: string, n = 14) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out: number[] = [];
  let v = 45;
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    v = Math.max(18, Math.min(100, v + ((h % 41) - 16)));
    out.push(v);
  }
  return out;
}

function dashboard(m: Spec) {
  const t = theme(m.theme === "dark"), a = m.accent;
  const chart = bars(m.appName);
  return `<div class="flex h-full ${t.bg} ${t.text}">
<aside class="flex w-52 flex-col border-r ${t.border} p-5">
<div class="mb-8 flex items-center gap-2.5 text-[17px] font-semibold tracking-tight ${t.strong}"><div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-${a}-400 to-${a}-600 text-xs font-bold text-white shadow-sm">${initials(m.appName).slice(0, 1)}</div>${esc(m.appName)}</div>
<nav class="space-y-0.5 text-[13px]">${m.nav.map((n, i) => `<div class="flex items-center gap-2.5 rounded-md px-3 py-2 ${i === 0 ? `${t.active} font-medium ${t.strong}` : t.muted}"><span class="h-1.5 w-1.5 rounded-full ${i === 0 ? `bg-${a}-500` : "bg-current opacity-40"}"></span>${esc(n)}</div>`).join("")}</nav>
<div class="mt-auto flex items-center gap-2 border-t ${t.border} pt-4 text-xs ${t.muted}"><div class="h-7 w-7 rounded-full ${avatar(m.user, 0)}"></div><div><div class="${t.strong} font-medium">${esc(m.user)}</div><div class="text-[10px]">Free plan</div></div></div>
</aside>
<main class="flex-1 p-7">
<div class="mb-5 flex items-end justify-between"><div><div class="text-xs ${t.muted}">${esc(m.context)}</div><h1 class="text-[22px] font-semibold tracking-tight ${t.strong}">${esc(m.heading)}</h1></div><div class="flex gap-2"><div class="rounded-md border ${t.border} px-3 py-1.5 text-xs ${t.muted}">Last 7 days ▾</div><div class="rounded-md bg-${a}-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm">${esc(m.action)}</div></div></div>
<div class="mb-4 grid grid-cols-3 gap-3">${m.stats.map((st) => `<div class="rounded-xl ${t.card} p-4"><div class="text-[11px] font-medium ${t.muted}">${esc(st.label)}</div><div class="mt-1 text-2xl font-semibold tracking-tight ${t.strong}">${esc(st.value)}</div><div class="mt-0.5 text-[11px] text-${a}-500">${esc(st.note)}</div></div>`).join("")}</div>
<div class="grid grid-cols-5 gap-3">
<div class="col-span-3 overflow-hidden rounded-xl ${t.card} text-[13px]">${m.items.slice(0, 5).map((it, i, arr) => `<div class="flex items-center gap-3 px-4 py-[11px] ${i < arr.length - 1 ? `border-b ${t.border}` : ""}"><span class="h-2 w-2 shrink-0 rounded-full bg-${STATUS[it.status]}-400"></span><div class="min-w-0 flex-1"><div class="truncate font-medium ${t.strong}">${esc(it.title)}</div>${it.subtitle ? `<div class="truncate text-[11px] ${t.muted}">${esc(it.subtitle)}</div>` : ""}</div>${it.tag ? `<span class="shrink-0 rounded-full bg-${STATUS[it.status]}-400/10 px-2 py-0.5 text-[10px] font-medium text-${STATUS[it.status]}-500">${esc(it.tag)}</span>` : ""}<span class="w-14 shrink-0 text-right text-[11px] ${t.muted}">${esc(it.meta)}</span></div>`).join("")}</div>
<div class="col-span-2 flex flex-col rounded-xl ${t.card} p-4"><div class="flex items-baseline justify-between"><div class="text-[11px] font-medium ${t.muted}">${esc(m.stats[0].label)}</div><div class="text-[11px] text-${a}-500">14d</div></div><div class="text-lg font-semibold ${t.strong}">${esc(m.stats[0].value)}</div><div class="mt-auto flex h-36 items-end gap-1">${chart.map((v, i) => `<div class="flex-1 rounded-t bg-${a}-500" style="height:${v}%;opacity:${(0.35 + (i / chart.length) * 0.65).toFixed(2)}"></div>`).join("")}</div></div>
</div>
${m.callout ? `<div class="mt-3 flex items-center gap-2 rounded-lg border ${t.border} px-3 py-2 text-[11px] ${t.muted}"><span class="h-1.5 w-1.5 rounded-full bg-${a}-500"></span>${esc(m.callout)}</div>` : ""}
</main></div>`;
}

function cards(m: Spec) {
  const dark = m.theme === "dark", t = theme(dark), a = m.accent;
  const pill = dark ? `bg-${a}-400/10 text-${a}-300` : `bg-${a}-50 text-${a}-700`;
  return `<div class="h-full ${t.bg} ${t.text}">
<header class="flex items-center justify-between border-b ${t.border} ${dark ? "bg-neutral-900" : "bg-white"} px-8 py-4">
<div class="text-xl font-bold tracking-tight ${t.strong}">${esc(m.appName)}<span class="text-${a}-500">.</span></div>
<div class="flex items-center gap-6 text-sm ${t.muted}">${m.nav.slice(0, 3).map((n, i) => `<span class="${i === 0 ? `font-medium ${t.strong}` : ""}">${esc(n)}</span>`).join("")}<div class="h-8 w-8 rounded-full ${avatar(m.user, 1)}"></div></div>
</header>
<main class="p-8">
<div class="mb-1 text-sm ${t.muted}">${esc(m.context)}</div>
<h1 class="mb-6 text-3xl font-bold ${t.strong}">${esc(m.heading)}</h1>
<div class="grid grid-cols-3 gap-5">${m.items.slice(0, 3).map((it, i) => `<div class="rounded-2xl ${dark ? "border border-white/10 bg-neutral-900" : "bg-white shadow-sm"} p-5">
<div class="mb-3 flex items-center justify-between">${it.tag ? `<span class="rounded-full ${pill} px-3 py-1 text-xs font-semibold">${esc(it.tag)}</span>` : "<span></span>"}<span class="text-sm font-semibold text-${STATUS[it.status]}-500">${esc(it.meta)}</span></div>
<div class="mb-1 text-lg font-semibold ${t.strong}">${esc(it.title)}</div><div class="mb-4 text-sm ${t.muted}">${esc(it.subtitle)}</div>
<div class="flex -space-x-2">${[0, 1, 2].map((k) => `<div class="h-8 w-8 rounded-full border-2 ${dark ? "border-neutral-900" : "border-white"} ${avatar(it.title, i + k)}"></div>`).join("")}</div>
<div class="mt-5 rounded-lg ${i === 2 ? `border ${t.border} ${t.strong}` : `bg-${a}-600 text-white`} py-2 text-center text-sm font-medium">${esc(m.action)}</div></div>`).join("")}</div>
${m.callout ? `<div class="mt-6 flex items-center gap-3 rounded-xl ${dark ? "border border-white/10 bg-neutral-900" : "bg-white shadow-sm"} p-4 text-sm"><span class="text-lg">⚡</span><span>${esc(m.callout)}</span><span class="ml-auto shrink-0 text-${a}-500">${esc(m.stats[0].value)} ${esc(m.stats[0].label)}</span></div>` : ""}
</main></div>`;
}

function phone(m: Spec) {
  const dark = m.theme === "dark", a = m.accent;
  const bg = dark ? `bg-gradient-to-br from-neutral-950 to-${a}-950` : `bg-gradient-to-br from-${a}-50 to-${a}-100`;
  const screen = dark ? "bg-neutral-900 text-neutral-200" : "bg-white text-neutral-800";
  const row = dark ? "bg-white/5" : "bg-neutral-50";
  return `<div class="flex h-full items-center justify-center gap-14 ${bg} p-8">
<div class="flex h-[540px] w-[264px] flex-col overflow-hidden rounded-[38px] border-[7px] border-neutral-900 ${screen} shadow-2xl">
<div class="flex justify-between px-5 pt-2 text-[10px] font-semibold"><span>9:41</span><span>●●● ▮</span></div>
<div class="px-4 pb-3 pt-3"><div class="text-[11px] font-semibold uppercase tracking-wide text-${a}-500">${esc(m.appName)}</div><div class="text-lg font-bold leading-tight">${esc(m.context || m.heading)}</div></div>
<div class="mx-4 mb-3 grid grid-cols-3 gap-1.5">${m.stats.map((st) => `<div class="rounded-xl bg-${a}-500/10 p-2 text-center"><div class="text-sm font-bold text-${a}-600">${esc(st.value)}</div><div class="truncate text-[9px] opacity-60">${esc(st.label)}</div></div>`).join("")}</div>
<div class="flex-1 space-y-2 px-4">${m.items.slice(0, 4).map((it, i) => `<div class="flex items-center gap-2.5 rounded-xl ${i === 0 ? `bg-${a}-500 text-white` : row} p-2.5"><div class="h-8 w-8 shrink-0 rounded-lg ${i === 0 ? "bg-white/25" : avatar(it.title, i)}"></div><div class="min-w-0 flex-1"><div class="truncate text-xs font-semibold">${esc(it.title)}</div><div class="truncate text-[10px] opacity-70">${esc(it.subtitle || it.meta)}</div></div>${it.tag ? `<span class="text-[9px] font-semibold opacity-80">${esc(it.tag)}</span>` : ""}</div>`).join("")}</div>
<div class="flex justify-around border-t ${dark ? "border-white/10" : "border-neutral-100"} py-2.5 text-[9px] opacity-70">${m.nav.slice(0, 4).map((n, i) => `<span class="${i === 0 ? `font-bold text-${a}-500 opacity-100` : ""}">${esc(n)}</span>`).join("")}</div>
</div>
<div class="max-w-xs">
<div class="mb-3 inline-block rounded-full ${dark ? "bg-white/10 text-white" : "bg-white"} px-3 py-1 text-xs font-semibold text-${a}-600 shadow-sm">${esc(m.stats[0].value)} ${esc(m.stats[0].label)}</div>
<h2 class="mb-3 text-4xl font-bold leading-tight ${dark ? "text-white" : "text-neutral-900"}">${esc(m.heading)}</h2>
<p class="${dark ? "text-neutral-400" : "text-neutral-600"}">${esc(m.callout)}</p>
</div></div>`;
}

function terminal(m: Spec) {
  const a = m.accent;
  const icon: Record<Status, string> = { good: "✓", warn: "!", bad: "✗", neutral: "•" };
  return `<div class="flex h-full items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-${a}-950 p-8">
<div class="h-[520px] w-[860px] overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0e] shadow-2xl">
<div class="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5"><span class="h-3 w-3 rounded-full bg-[#ff5f57]"></span><span class="h-3 w-3 rounded-full bg-[#febc2e]"></span><span class="h-3 w-3 rounded-full bg-[#28c840]"></span><span class="mx-auto font-mono text-xs text-neutral-500">${esc(m.appName)} — zsh — 120×32</span></div>
<div class="space-y-1.5 p-6 font-mono text-[13px] leading-relaxed text-neutral-300">
<div><span class="text-${a}-400">❯</span> <span class="text-white">${esc(m.appName.toLowerCase())} ${esc(m.action.toLowerCase())}</span></div>
<div class="text-neutral-500">${esc(m.context || m.heading)}</div>
<div class="h-2"></div>
${m.items.map((it) => `<div class="flex gap-3"><span class="w-4 text-${STATUS[it.status]}-400">${icon[it.status]}</span><span class="w-72 truncate text-white">${esc(it.title)}</span><span class="flex-1 truncate text-neutral-500">${esc(it.subtitle)}</span><span class="text-${STATUS[it.status]}-400">${esc(it.meta)}</span></div>`).join("")}
<div class="h-2"></div>
<div class="text-neutral-400">${m.stats.map((st) => `<span class="mr-6">${esc(st.label)}: <span class="font-semibold text-${a}-300">${esc(st.value)}</span></span>`).join("")}</div>
${m.callout ? `<div class="text-neutral-600"># ${esc(m.callout)}</div>` : ""}
<div class="h-2"></div>
<div><span class="text-${a}-400">❯</span> <span class="inline-block h-4 w-2 translate-y-0.5 bg-neutral-300"></span></div>
</div></div></div>`;
}

function chat(m: Spec) {
  const a = m.accent;

  return `<div class="flex h-full bg-[#313338] text-[#dbdee1]">
<div class="flex w-[72px] flex-col items-center gap-2 bg-[#1e1f22] py-3"><div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-${a}-500 text-sm font-bold text-white">${initials(m.context || m.appName)}</div><div class="h-0.5 w-8 bg-white/10"></div><div class="h-12 w-12 rounded-full bg-[#313338]"></div><div class="h-12 w-12 rounded-full bg-[#313338]"></div></div>
<div class="w-56 bg-[#2b2d31] p-3"><div class="mb-4 border-b border-black/30 pb-3 text-sm font-semibold text-white">${esc(m.context || m.appName)}</div><div class="mb-1 text-[11px] font-semibold uppercase text-neutral-400">Text channels</div>${m.nav.map((n, i) => `<div class="rounded px-2 py-1.5 text-sm ${i === 0 ? "bg-white/10 text-white" : "text-neutral-400"}"># ${esc(n.toLowerCase().replace(/\s+/g, "-"))}</div>`).join("")}</div>
<div class="flex flex-1 flex-col">
<div class="border-b border-black/30 px-4 py-3 text-sm font-semibold text-white"># ${esc(m.nav[0].toLowerCase().replace(/\s+/g, "-"))}</div>
<div class="flex-1 space-y-5 overflow-hidden px-4 py-4">
<div class="flex gap-3"><div class="h-10 w-10 shrink-0 rounded-full ${avatar(m.user, 2)}"></div><div><div class="text-sm"><span class="font-semibold text-white">${esc(m.user)}</span> <span class="text-xs text-neutral-500">Today at 9:02 AM</span></div><div class="text-sm">/${esc(m.action.toLowerCase().replace(/\s+/g, "-"))}</div></div></div>
<div class="flex gap-3"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-${a}-500 text-xs font-bold text-white">${initials(m.appName)}</div><div class="min-w-0 flex-1"><div class="text-sm"><span class="font-semibold text-${a}-300">${esc(m.appName)}</span> <span class="rounded bg-[#5865f2] px-1 text-[10px] font-semibold text-white">BOT</span> <span class="text-xs text-neutral-500">Today at 9:02 AM</span></div>
<div class="mt-1 max-w-[520px] rounded border-l-4 border-${a}-500 bg-[#2b2d31] p-3"><div class="mb-2 text-sm font-semibold text-white">${esc(m.heading)}</div>
<div class="mb-3 grid grid-cols-3 gap-2">${m.stats.map((st) => `<div><div class="text-[11px] font-semibold text-neutral-400">${esc(st.label)}</div><div class="text-sm text-white">${esc(st.value)}</div></div>`).join("")}</div>
<div class="space-y-1 text-sm">${m.items.slice(0, 4).map((it) => `<div class="flex items-baseline gap-2"><span class="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-${STATUS[it.status]}-400"></span><span class="truncate"><span class="font-semibold text-white">${esc(it.title)}</span> <span class="text-neutral-400">${esc(it.subtitle)}</span></span></div>`).join("")}</div>
${m.callout ? `<div class="mt-2 text-xs text-neutral-500">${esc(m.callout)}</div>` : ""}</div></div></div>
</div>
<div class="m-4 mt-0 rounded-lg bg-[#383a40] px-4 py-2.5 text-sm text-neutral-500">Message #${esc(m.nav[0].toLowerCase().replace(/\s+/g, "-"))}</div>
</div></div>`;
}

function extension(m: Spec) {
  const dark = m.theme === "dark", t = theme(dark), a = m.accent;
  return `<div class="relative h-full overflow-hidden bg-white">
<div class="mx-auto max-w-2xl space-y-4 p-10 opacity-60">
<div class="h-8 w-2/3 rounded bg-neutral-200"></div><div class="h-4 w-1/3 rounded bg-neutral-100"></div>
<div class="h-40 rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200"></div>
<div class="space-y-2"><div class="h-3 rounded bg-neutral-100"></div><div class="h-3 rounded bg-neutral-100"></div><div class="h-3 w-5/6 rounded bg-neutral-100"></div><div class="h-3 w-4/6 rounded bg-neutral-100"></div></div>
<div class="grid grid-cols-3 gap-3"><div class="h-24 rounded bg-neutral-100"></div><div class="h-24 rounded bg-neutral-100"></div><div class="h-24 rounded bg-neutral-100"></div></div>
</div>
<div class="absolute right-6 top-3 w-[340px] overflow-hidden rounded-xl border ${t.border} ${dark ? "bg-neutral-900 text-neutral-300" : "bg-white text-neutral-700"} shadow-2xl">
<div class="flex items-center justify-between border-b ${t.border} px-4 py-3"><div class="flex items-center gap-2 font-semibold ${t.strong}"><div class="h-5 w-5 rounded bg-gradient-to-br from-${a}-400 to-${a}-600"></div>${esc(m.appName)}</div><div class="flex h-5 w-9 items-center rounded-full bg-${a}-500 px-0.5"><div class="ml-auto h-4 w-4 rounded-full bg-white"></div></div></div>
<div class="px-4 pt-3"><div class="text-xs ${t.muted}">${esc(m.context)}</div><div class="text-sm font-semibold ${t.strong}">${esc(m.heading)}</div></div>
<div class="grid grid-cols-3 gap-2 p-4">${m.stats.map((st) => `<div class="rounded-lg bg-${a}-500/10 p-2"><div class="text-base font-bold text-${a}-600">${esc(st.value)}</div><div class="truncate text-[10px] ${t.muted}">${esc(st.label)}</div></div>`).join("")}</div>
<div class="space-y-1 px-2 pb-2">${m.items.slice(0, 4).map((it) => `<div class="flex items-center gap-2 rounded-lg px-2 py-2 ${dark ? "hover:bg-white/5" : ""}"><span class="h-2 w-2 shrink-0 rounded-full bg-${STATUS[it.status]}-400"></span><div class="min-w-0 flex-1"><div class="truncate text-xs font-medium ${t.strong}">${esc(it.title)}</div><div class="truncate text-[10px] ${t.muted}">${esc(it.subtitle)}</div></div>${it.tag ? `<span class="rounded bg-${STATUS[it.status]}-400/15 px-1.5 py-0.5 text-[10px] text-${STATUS[it.status]}-600">${esc(it.tag)}</span>` : ""}</div>`).join("")}</div>
<div class="flex items-center justify-between border-t ${t.border} px-4 py-2.5"><span class="truncate pr-2 text-[10px] ${t.muted}">${esc(m.callout)}</span><span class="shrink-0 rounded-md bg-${a}-500 px-3 py-1 text-xs font-medium text-white">${esc(m.action)}</span></div>
</div></div>`;
}

const RENDER: Record<MockSpec["kit"], (m: Spec) => string> = { dashboard, cards, phone, terminal, chat, extension };

export function renderMock(spec: MockSpec): string {
  const m = normalize(MockSpec.parse(spec));
  // Tag the root so MockFrame can match the backdrop to the kit and accent.
  return `<style>${MOCK_KIT_CSS}</style>` + RENDER[m.kit](m).replace(/\n/g, "").replace(/^<div /, `<div data-kit="${m.kit}" data-accent="${m.accent}" `);
}

/** Populate the original hand-built layouts with this product's own bounded facts. */
export function mockSpecForProject(project: ProjectSection, context = '', stableId?: string): MockSpec {
  const clean = (value: string) => value.replace(/https?:\/\/\S+|\b(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|ai|app|dev|co|xyz)(?:\/\S*)?/gi, '').trim();
  const evidence = [context, project.title, project.category, project.tagline, project.summary, ...project.highlights, ...(project.details ?? []).map(d => `${d.label} ${d.value}`)].join(' ').toLowerCase();
  const has = (pattern: RegExp) => pattern.test(evidence);
  const kit: MockSpec['kit'] = has(/\b(?:mobile(?: app)?|ios|android|iphone|react native|flutter)\b/) ? 'phone'
    : has(/\b(?:bot|chatbot)\b/) ? 'chat'
    : has(/\b(?:cli|command.line|terminal|sdk|software library|component library|npm package|python package)\b/) ? 'terminal'
    : has(/\b(?:extension|browser add.on)\b/) ? 'extension'
    : has(/\b(?:marketplace|catalog|booking|matchmaking|matching|shop|courses|groups)\b/) ? 'cards' : 'dashboard';
  let hash = 2166136261;
  for (const char of stableId ?? project.title) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const rows = has(/\b(?:car|vehicle|dealer|automotive)\b/) ? ['Compact hatchback', 'Electric crossover', 'Family sedan', 'Hybrid wagon']
    : has(/\b(?:cad|hardware|circuit|robot|prototype)\b/) ? ['Assembly revision', 'Clearance review', 'Material estimate', 'Prototype check']
    : has(/\b(?:school|student|study|education|course|learning)\b/) ? ['Practice session', 'Concept review', 'Study group', 'Progress check']
    : has(/\b(?:fitness|yoga|workout|health|training)\b/) ? ['Morning session', 'Weekly routine', 'Progress review', 'Upcoming booking']
    : has(/\b(?:finance|budget|invoice|payment|expense)\b/) ? ['Monthly summary', 'Recent transaction', 'Category review', 'Pending entry']
    : has(/\b(?:dog|pet|walking)\b/) ? ['Morning walk', 'Neighborhood route', 'Afternoon booking', 'Weekly schedule']
    : ['Recent activity', 'Current workflow', 'Saved result', 'Next milestone'];
  const details = project.details ?? [];
  const items = rows.map((title, index) => ({ title, subtitle: clean(details[index]?.value ?? project.highlights[index % Math.max(1, project.highlights.length)] ?? project.tagline), meta: '', tag: ['Ready', 'In progress', 'Reviewed', 'Scheduled'][index], status: index === 1 ? 'warn' as const : 'good' as const }));
  return MockSpec.parse({ kit, theme: hash % 2 ? 'light' : 'dark', accent: ACCENTS[hash % ACCENTS.length], appName: clean(project.title), context: clean(project.category), nav: kit === 'chat' ? ['Updates', 'Activity', 'Commands', 'Settings'] : ['Overview', 'Activity', 'Insights', 'Settings'], heading: clean(project.tagline || project.title), action: kit === 'terminal' ? 'run' : kit === 'chat' ? 'summary' : 'Open', stats: project.metrics.map(metric => ({ label: clean(metric.label), value: clean(metric.value), note: '' })), items, callout: clean(project.summary), user: 'you' });
}

// Reference specs: shown on /preview/kits and used as the example in the agent prompt.
export const KIT_SAMPLES: Record<MockSpec["kit"], MockSpec> = {
  dashboard: {
    kit: "dashboard", theme: "dark", accent: "emerald", appName: "shipit", context: "uw-robotics / website", heading: "Deployments", action: "Redeploy", user: "sam",
    nav: ["Deployments", "Projects", "Previews", "Cache", "Settings"],
    stats: [{ label: "Median build", value: "41s", note: "−54% vs no cache" }, { label: "Cache hit rate", value: "87%", note: "last 7 days" }, { label: "Deploys this week", value: "23", note: "6 previews open" }],
    items: [
      { title: "fix: hero image aspect ratio on mobile", subtitle: "a3f9c21 · main", meta: "38s", tag: "Ready", status: "good" },
      { title: "feat: sponsors page", subtitle: "7bd0e4a · sponsors", meta: "12s", tag: "Building", status: "warn" },
      { title: "chore: bump astro to 4.15", subtitle: "e01c88f · main", meta: "44s", tag: "Ready", status: "good" },
      { title: "feat: team roster from sheets", subtitle: "91aa3d2 · roster", meta: "19s", tag: "Failed", status: "bad" },
    ],
    callout: "",
  },
  cards: {
    kit: "cards", theme: "light", accent: "indigo", appName: "studymatch", context: "Fall 2026 · 5 courses", heading: "Your matches this week", action: "Join group", user: "sam",
    nav: ["My groups", "Browse", "Schedule"],
    stats: [{ label: "groups formed", value: "58", note: "" }, { label: "signups", value: "312", note: "" }, { label: "weekly active", value: "140", note: "" }],
    items: [
      { title: "Algorithms grind", subtitle: "Tue + Thu · DC library · 7pm", meta: "94% match", tag: "CS 341", status: "good" },
      { title: "Graph theory pset crew", subtitle: "Sun · Discord · 3pm", meta: "88% match", tag: "MATH 239", status: "good" },
      { title: "Midterm review", subtitle: "Wed · MC 2034 · 6pm", meta: "71% match", tag: "STAT 230", status: "warn" },
    ],
    callout: "Matching runs every Sunday at 9pm based on your calendar and course load.",
  },
  phone: {
    kit: "phone", theme: "light", accent: "orange", appName: "fridgecam", context: "4 items found", heading: "Point your phone at the fridge. Get dinner.", action: "Scan", user: "sam",
    nav: ["Scan", "Recipes", "Pantry", "Me"],
    stats: [{ label: "per frame", value: "38ms", note: "" }, { label: "mAP@50", value: "0.71", note: "" }, { label: "classes", value: "31", note: "" }],
    items: [
      { title: "Spinach & feta omelette", subtitle: "12 min · uses 4/4", meta: "", tag: "Best", status: "good" },
      { title: "Shakshuka", subtitle: "25 min · uses 3/4 + onion", meta: "", tag: "", status: "neutral" },
      { title: "Greek salad", subtitle: "10 min · uses 3/4", meta: "", tag: "", status: "neutral" },
    ],
    callout: "YOLOv8n fine-tuned on 2.1k labelled fridge photos, exported to Core ML. Recipes ranked by how much of what you have they use.",
  },
  terminal: {
    kit: "terminal", theme: "dark", accent: "sky", appName: "dotsync", context: "syncing 14 dotfiles to ~/  (profile: laptop)", heading: "", action: "apply --diff", user: "sam",
    nav: [],
    stats: [{ label: "linked", value: "11", note: "" }, { label: "skipped", value: "2", note: "" }, { label: "conflicts", value: "1", note: "" }],
    items: [
      { title: ".zshrc", subtitle: "symlink → dotfiles/zsh/.zshrc", meta: "linked", tag: "", status: "good" },
      { title: ".config/nvim/init.lua", subtitle: "templated (host=laptop)", meta: "linked", tag: "", status: "good" },
      { title: ".gitconfig", subtitle: "local file differs (3 lines)", meta: "conflict", tag: "", status: "bad" },
      { title: ".tmux.conf", subtitle: "unchanged", meta: "skipped", tag: "", status: "neutral" },
      { title: ".config/kitty/kitty.conf", subtitle: "created", meta: "linked", tag: "", status: "good" },
    ],
    callout: "run `dotsync resolve .gitconfig` to pick a side",
  },
  chat: {
    kit: "chat", theme: "dark", accent: "violet", appName: "Standup", context: "UW Robotics", heading: "Daily standup · Tue Nov 4", action: "standup", user: "maya",
    nav: ["standups", "general", "mechanical", "software"],
    stats: [{ label: "Submitted", value: "21 / 24", note: "" }, { label: "Blockers", value: "3", note: "" }, { label: "Streak", value: "38 days", note: "" }],
    items: [
      { title: "Software", subtitle: "path planner merged, sim at 60 fps", meta: "", tag: "", status: "good" },
      { title: "Mechanical", subtitle: "waiting on bearings (ETA Thu)", meta: "", tag: "", status: "warn" },
      { title: "Electrical", subtitle: "CAN bus dropping frames on arm", meta: "", tag: "", status: "bad" },
    ],
    callout: "Missing: @jules, @arjun, @lena · next digest 9:00 AM",
  },
  extension: {
    kit: "extension", theme: "light", accent: "teal", appName: "TabTamer", context: "38 tabs · 5 windows", heading: "Grouped into 6 topics", action: "Collapse all", user: "sam",
    nav: [],
    stats: [{ label: "tabs grouped", value: "38", note: "" }, { label: "memory saved", value: "1.4GB", note: "" }, { label: "topics", value: "6", note: "" }],
    items: [
      { title: "CS 341 · dynamic programming", subtitle: "9 tabs · lecture notes, LeetCode", meta: "", tag: "9", status: "good" },
      { title: "Internship apps", subtitle: "7 tabs · Greenhouse, Lever", meta: "", tag: "7", status: "warn" },
      { title: "Rust async book", subtitle: "5 tabs · docs.rs, blog posts", meta: "", tag: "5", status: "neutral" },
      { title: "Apartment hunting", subtitle: "4 tabs · listings", meta: "", tag: "4", status: "neutral" },
    ],
    callout: "Embeddings computed locally (MiniLM, 22MB)",
  },
};
