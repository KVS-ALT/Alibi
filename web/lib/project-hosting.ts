import 'server-only';
import { createHash } from 'node:crypto';
import type { Portfolio } from '@alibi/shared';

type Hosted = { url?: string; serviceId?: string; pending?: Promise<void>; retryAt?: number };
declare global { var __alibiProjectHosts: Map<string, Hosted> | undefined; }
const hosts = globalThis.__alibiProjectHosts ??= new Map<string, Hosted>();
async function render(path: string, init?: RequestInit) {
  const response = await fetch('https://api.render.com/v1' + path, { ...init, headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Render returned ${response.status}`);
  return response.json();
}
export function withProjectSites(slug: string, portfolio: Portfolio): Portfolio {
  const projects = Object.fromEntries(Object.entries(portfolio.projects).map(([id, project]) => {
    const key = slug + ':' + id;
    let host = hosts.get(key);
    if (!host) { host = {}; hosts.set(key, host); }
    if (project.status === 'ready' && !host.url && !host.pending && (host.retryAt ?? 0) < Date.now() && process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID) {
      const target = host;
      target.pending = (async () => {
        const source = await render('/services/' + encodeURIComponent(process.env.RENDER_SERVICE_ID!));
        const name = 'alibi-' + id.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 25) + '-' + createHash('sha256').update(key).digest('hex').slice(0, 10);
        const existing = await render('/services?name=' + encodeURIComponent(name) + '&limit=100');
        let service = (Array.isArray(existing) ? existing : []).map(row => row.service).find(item => item?.name === name);
        if (!service) {
          const created = await render('/services', { method: 'POST', body: JSON.stringify({ type: 'web_service', name, ownerId: source.ownerId, repo: source.repo, branch: process.env.RENDER_GIT_BRANCH || 'main', autoDeploy: 'no', envVars: [{ key: 'PROJECT_SOURCE_URL', value: (process.env.RENDER_EXTERNAL_URL || 'https://alibi-demo.onrender.com') + '/api/p/' + encodeURIComponent(slug) }, { key: 'PROJECT_ID', value: id }, { key: 'PROJECT_SNAPSHOT', value: Buffer.from(JSON.stringify(project)).toString('base64') }], serviceDetails: { runtime: 'node', plan: 'free', region: source.serviceDetails?.region || 'oregon', healthCheckPath: '/health', envSpecificDetails: { buildCommand: 'node --check scripts/standalone-project.cjs', startCommand: 'node scripts/standalone-project.cjs' } } }) });
          service = created.service;
        }
        if (!service?.serviceDetails?.url) throw new Error('Render did not return a service URL');
        if (!/^https:\/\/[a-z0-9-]+\.onrender\.com\/?$/.test(service.serviceDetails.url)) throw new Error('Unexpected Render service URL');
        target.url = service.serviceDetails.url; target.serviceId = service.id;
        console.info('[alibi:project-host]', JSON.stringify({ project: id, serviceId: target.serviceId, url: target.url }));
      })().catch(error => { target.retryAt = Date.now() + 60000; console.error('[alibi:project-host]', error instanceof Error ? error.message : 'Deployment unavailable'); }).finally(() => { target.pending = undefined; });
    }
    // Only server-created Render URLs are exposed, never URLs invented by a model.
    return [id, { ...project, siteUrl: host.url }];
  }));
  return { ...portfolio, projects };
}
