import { z } from "zod";

export const TemplateId = z.enum(["minimal", "terminal", "bold"]);
export type TemplateId = z.infer<typeof TemplateId>;

export const Claims = z.object({
  speakerName: z.string().optional(),
  role: z.string().optional(),
  vibe: TemplateId,
  skills: z.array(z.string()),
  // saidAbout = verbatim-ish claims from the transcript
  projects: z.array(
    z.object({ id: z.string(), name: z.string(), saidAbout: z.array(z.string()) }),
  ),
  // the OTHER person's email, if mentioned
  contactEmail: z.string().optional(),
});
export type Claims = z.infer<typeof Claims>;

export const ProjectSection = z.object({
  status: z.enum(["pending", "ready"]),
  title: z.string(),
  summary: z.string(),
  stack: z.array(z.string()),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })),
  highlights: z.array(z.string()),
  diagramMermaid: z.string().optional(),
  commitGraph: z.array(z.number()).optional(),
  stars: z.number().optional(),
});
export type ProjectSection = z.infer<typeof ProjectSection>;

export const Hero = z.object({ name: z.string(), headline: z.string(), bio: z.string() });
export type Hero = z.infer<typeof Hero>;

export const Portfolio = z.object({
  templateId: TemplateId,
  hero: Hero.optional(),
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
