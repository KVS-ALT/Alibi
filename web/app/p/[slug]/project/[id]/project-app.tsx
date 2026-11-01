'use client';

import type { ProjectSection } from '@alibi/shared';
import { renderProjectDemo } from '@/lib/project-demo.cjs';

export default function ProjectApp({ project, storageKey }: { project: ProjectSection; theme: string; storageKey: string; back: string }) {
  return <iframe title={project.title} srcDoc={renderProjectDemo(project, storageKey)} className="h-dvh w-full border-0" sandbox="allow-scripts allow-forms allow-downloads" />;
}
