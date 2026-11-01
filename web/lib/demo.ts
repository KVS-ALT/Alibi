import type { Portfolio } from "@alibi/shared";

// Pre-built fallback served at /p/demo-backup (and for any slug when there's no database).
export const DEMO_PORTFOLIO: Portfolio = {
  templateId: "minimal",
  hero: {
    name: "Keith K.",
    headline: "CS student building developer tools and small ML systems",
    bio: "I like shipping things people actually use: a CLI that cut my club's deploy time in half, and a study-group matcher that ran for a semester on a single Postgres box.",
  },
  projects: {
    "deploy-cli": {
      status: "ready",
      title: "shipit",
      summary:
        "A zero-config deploy CLI for student club websites. Detects the framework, builds in a container, and pushes to a static host with preview URLs per branch.",
      stack: ["Go", "Docker", "GitHub Actions", "Cloudflare Pages"],
      metrics: [
        { label: "Clubs using it", value: "6" },
        { label: "Median deploy", value: "41s" },
        { label: "Deploys", value: "380+" },
      ],
      highlights: [
        "Framework detection via lockfile + config heuristics, no YAML required",
        "Branch previews posted back to PRs as comments",
        "Cut average deploy time from ~90s to ~41s with layer caching",
      ],
      diagramMermaid:
        "flowchart LR\n  dev[git push] --> gha[GitHub Actions]\n  gha --> cli[shipit build]\n  cli --> cache[(layer cache)]\n  cli --> cf[Cloudflare Pages]\n  cf --> pr[PR preview comment]",
      commitGraph: [0, 2, 5, 3, 0, 1, 4, 6, 2, 0, 3, 7, 5, 2, 1, 0, 4, 3, 6, 8, 2, 0, 1, 3, 5, 4, 2, 6],
      stars: 47,
    },
    "study-match": {
      status: "pending",
      title: "",
      summary: "",
      stack: [],
      metrics: [],
      highlights: [],
    },
  },
  contradictions: [],
};
