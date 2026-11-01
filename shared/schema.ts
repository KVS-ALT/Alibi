import { z } from "zod";

export const TemplateId = z.enum(["lowercase", "showcase", "geist"]);
export type TemplateId = z.infer<typeof TemplateId>;

export const Claims = z.object({
  speakerName: z.string().optional(),
  role: z.string().optional(),
  vibe: TemplateId,
  skills: z.array(z.string()),
  // saidAbout = verbatim-ish claims from the transcript
  projects: z.array(
    z.object({ id: z.string(), name: z.string(), saidAbout: z.array(z.string()), platform: z.string().optional() }),
  ),
  // the OTHER person's email, if mentioned
  contactEmail: z.string().optional(),
});
export type Claims = z.infer<typeof Claims>;

export const ProjectSection = z.object({
  // "pending" sections render as skeletons; title may already be known from claims
  status: z.enum(["pending", "ready"]),
  title: z.string(),

  // collapsed card
  category: z.string(), // "WEB APP", "CLI", "ML"
  year: z.number(),
  tagline: z.string(), // one line under the title
  award: z.string().optional(), // "1st place @ DeltaHacks"
  mockHtml: z.string().optional(), // agent-written mock UI (HTML + Tailwind), rendered in a sandboxed iframe

  // expanded card
  summary: z.string(),
  highlights: z.array(z.string()),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })),
  stack: z.array(z.string()),
  diagramMermaid: z.string().optional(),
  commitGraph: z.array(z.number()).optional(), // commits per day, oldest first
  commits: z.number().optional(),
  lastPushed: z.string().optional(), // "2 days ago"
  stars: z.number().optional(),
  repo: z.string().optional(), // "keithk/shipit" (shown as text, never linked)
});
export type ProjectSection = z.infer<typeof ProjectSection>;

export const Hero = z.object({
  name: z.string(),
  handle: z.string(), // "keithk"
  roles: z.array(z.string()), // ["cs @ uwaterloo", "builder"]
  bio: z.string(),
  currently: z.array(z.string()), // "building shipit v2", "looking for summer 2027 internships"
  location: z.string().optional(),
});
export type Hero = z.infer<typeof Hero>;

export const Portfolio = z.object({
  templateId: TemplateId,
  hero: Hero.optional(),
  skills: z.array(z.string()),
  projects: z.record(z.string(), ProjectSection),
  contradictions: z.array(z.string()),
});
export type Portfolio = z.infer<typeof Portfolio>;

export const Metrics = z.object({
  startedAt: z.number(),
  firstSectionAt: z.number().optional(),
  readyAt: z.number().optional(),
  tasks: z.array(z.object({ name: z.string(), ms: z.number(), ok: z.boolean() })),
  parallelTaskCount: z.number(),
  estCostUsd: z.number().optional(),
});
export type Metrics = z.infer<typeof Metrics>;
