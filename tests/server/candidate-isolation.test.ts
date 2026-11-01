// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { readRuntimeConfig } from '../../server/config';

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }))); });
async function start(cookieName: string) {
 const server = createApp({ cookieName }); servers.push(server);
 await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
 const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing local test address');
 return `http://127.0.0.1:${address.port}`;
}
it('keeps candidate cookies and sessions separate on the same host, where ports do not isolate cookies', async () => {
 const liveConfig = readRuntimeConfig({}), candidateConfig = readRuntimeConfig({}, ['--candidate']);
 const live = await start(liveConfig.cookieName), candidate = await start(candidateConfig.cookieName);
 const liveId = randomUUID(), candidateId = randomUUID();
 const create = (base: string, id: string, cookie?: string) => fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ id }) });
 const liveCreated = await create(live, liveId), liveCookie = liveCreated.headers.get('set-cookie')!.split(';')[0];
 const candidateCreated = await create(candidate, candidateId, liveCookie), candidateCookie = candidateCreated.headers.get('set-cookie')!.split(';')[0];
 expect(liveCookie).toMatch(/^larp_owner=/); expect(candidateCookie).toMatch(/^forme_candidate_owner=/);
 const hostCookieJar = `${liveCookie}; ${candidateCookie}`;
 expect((await fetch(`${live}/api/sessions/${liveId}`, { headers: { Cookie: hostCookieJar } })).status).toBe(200);
 expect((await fetch(`${candidate}/api/sessions/${candidateId}`, { headers: { Cookie: hostCookieJar } })).status).toBe(200);
 expect((await fetch(`${candidate}/api/sessions/${candidateId}`, { headers: { Cookie: liveCookie } })).status).toBe(404);
 expect((await fetch(`${live}/api/sessions/${liveId}`, { headers: { Cookie: candidateCookie } })).status).toBe(404);
});
