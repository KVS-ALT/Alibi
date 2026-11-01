import { notFound } from 'next/navigation';
import { getPublicPortfolio } from '@/lib/live-sessions';
import { SAMPLE_PORTFOLIO } from '@/lib/fixtures';
import ProjectApp from './project-app';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const portfolio = slug === 'demo-backup' ? SAMPLE_PORTFOLIO : (await getPublicPortfolio(slug))?.portfolio;
  if (!portfolio || !Object.hasOwn(portfolio.projects, id)) notFound();
  const project = portfolio.projects[id];
  if (project.status !== 'ready') notFound();
  return <ProjectApp key={`${slug}/${id}`} project={project} theme={portfolio.templateId} storageKey={`alibi-project:${slug}:${id}`} back={`/p/${encodeURIComponent(slug)}`} />;
}
