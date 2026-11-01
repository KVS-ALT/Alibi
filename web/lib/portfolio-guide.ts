import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Resolve both Next's web cwd and repository-root tooling; load once per server module.
const guideName = 'portfolio-guide.md';
const moduleDirectory = typeof __dirname === 'string' ? __dirname : '.';
const workingDirectory = typeof process.cwd === 'function' ? process.cwd() : '.';
const candidates = [
  path.join(moduleDirectory, 'prompts', guideName),
  path.join(workingDirectory, 'web', 'lib', 'prompts', guideName),
  path.join(workingDirectory, 'lib', 'prompts', guideName),
];
const guidePath = candidates.find(candidate => existsSync(candidate));
if (!guidePath) throw new Error('Portfolio writing guide is missing from the server bundle.');
export const PORTFOLIO_WRITING_GUIDE = readFileSync(guidePath, 'utf8');
export const PORTFOLIO_GUIDE_AUTHORITY = 'APPLICATION AUTHORITY: The supplied registered builder identity, project IDs and names win over examples and style advice. Never invent a person or product name, brand an unnamed project, normalize spelling without an explicit spoken correction, or fabricate URLs, domains, repositories or contacts. Personal introductions and incomplete construction phrases are not products. Resolve ambiguity silently; never ask questions or output UI. The generation output contract wins over the guide: for compact patches output only allowed fields, prefer two short details/project, at most 80 words total, and never output names, titles, HTML, diagrams or metrics. For legacy output preserve its complete schema and all registered identities.';
