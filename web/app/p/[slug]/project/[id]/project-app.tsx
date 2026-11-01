import type { ProjectSection } from '@alibi/shared';
import { renderProjectDemo } from '@/lib/project-demo.cjs';
import { renderProjectTemplate } from '@/lib/project-template.cjs';
import { MOCK_KIT_CSS } from '@/lib/mock-kit-styles';

export default function ProjectApp({ project, storageKey }: { project: ProjectSection; theme: string; storageKey: string; back: string }) {
  const html = project.mockHtml ? renderProjectTemplate(project, MOCK_KIT_CSS) : renderProjectDemo(project, storageKey);
  return <iframe title={project.title} srcDoc={html} className="h-dvh w-full border-0" sandbox="allow-scripts allow-forms allow-downloads" />;
}
