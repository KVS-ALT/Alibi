// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp, type ServerOptions } from '../../server/app';
import { publicProviderCapabilities, readRuntimeConfig } from '../../server/config';
import { createBrief } from '../../src/generation';

const token = 'a'.repeat(64), servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }))); });
const post = (body: unknown, cookie = ''): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
async function setup() {
 let clock = 1_000_000;
 const start = vi.fn(async () => ({ ok: true as const, streamId: randomUUID() }));
 const run = vi.fn(async () => { throw new Error('Injected mock runner: no external transport exists.'); });
 const proxy = { start, isConfigured: () => true, endSession: vi.fn(), dispose: vi.fn(), subscribe: vi.fn(() => () => {}), writePcm: vi.fn(), flush: vi.fn() };
 const config = readRuntimeConfig({ LIVE_PROVIDER_CALLS_ENABLED: 'true', GENERATION_PROVIDER: 'featherless', FEATHERLESS_API_KEY: 'mock-key', FEATHERLESS_MODEL: 'Qwen/Qwen2.5-7B-Instruct', SPEECH_PROVIDER: 'speechmatics', SPEECHMATICS_ENABLED: 'true', SPEECHMATICS_API_KEY: 'mock-speech-key' }, ['--allow-live-providers', '--approved-generation-requests=3', '--approved-speech-tokens=1', '--approved-audio-seconds=60']);
 const server = createApp({ interactiveTest: { token, expiresAt: clock + 600_000 }, now: () => clock, liveCallsAllowed: true, providerCapabilities: publicProviderCapabilities(config), speechProxy: proxy as unknown as NonNullable<ServerOptions['speechProxy']>, runner: { mode: 'featherless', requiresLive: true, run } });
 servers.push(server); await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
 const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing mock server address');
 const request = (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, init);
 const owner = async (existingCookie = '') => { const id = randomUUID(), response = await request('/api/sessions', post({ id }, existingCookie)); expect(response.status).toBe(201); return { id, cookie: response.headers.get('set-cookie')!.split(';')[0] }; };
 const claim = () => request(`/test/claim/${token}`, { redirect: 'manual' });
 const job = (id: string, cookie: string) => request(`/api/sessions/${id}/jobs`, post({ sessionId: id, requestId: randomUUID(), briefVersion: 1, brief: createBrief(id, 1, 'Create a bakery with a pickup form.') }, cookie));
 return { request, owner, claim, job, start, run, advance: (ms: number) => { clock += ms; } };
}

describe('independent private interactive grant boundary', () => {
 it('allows repeated link previews without consuming the grant or invoking any provider', async () => {
  const h = await setup();
  for (let i = 0; i < 2; i++) { const response = await h.claim(); expect(response.status).toBe(303); expect(response.headers.get('location')).toBe('/'); expect(response.headers.get('referrer-policy')).toBe('no-referrer'); expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict; Path=/api'); }
  expect(h.start).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
  const owner = await h.owner(), cookie = `${owner.cookie}; larp_owner_test=${token}`;
  expect((await h.job(owner.id, cookie)).status).toBe(403);
  expect((await h.request(`/api/sessions/${owner.id}/speech/start`, post({ consented: false }, cookie))).status).toBe(400);
  expect(h.start).not.toHaveBeenCalled();
  expect((await h.request(`/api/sessions/${owner.id}/speech/start`, post({ consented: true }, cookie))).status).toBe(200);
  expect(h.start).toHaveBeenCalledTimes(1);
 });

 it('rejects absent/wrong grants before provider calls, then binds exactly one owner and session', async () => {
  const h = await setup(), first = await h.owner(), unrelated = await h.owner();
  for (const cookie of [first.cookie, `${first.cookie}; larp_owner_test=${'b'.repeat(64)}`]) expect((await h.request(`/api/sessions/${first.id}/speech/start`, post({ consented: true }, cookie))).status).toBe(403);
  expect(h.start).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
  const approvedCookie = `${first.cookie}; larp_owner_test=${token}`;
  expect((await h.request(`/api/sessions/${first.id}/speech/start`, post({ consented: true }, approvedCookie))).status).toBe(200);
  expect((await h.request(`/api/sessions/${first.id}/speech/start`, post({ consented: true }, approvedCookie))).status).toBe(403);
  expect((await h.job(unrelated.id, `${unrelated.cookie}; larp_owner_test=${token}`)).status).toBe(403);
  const sameOwnerNewSession = await h.owner(first.cookie);
  expect((await h.job(sameOwnerNewSession.id, approvedCookie)).status).toBe(403);
  expect((await h.request(`/api/sessions/${sameOwnerNewSession.id}/speech/start`, post({ consented: true }, approvedCookie))).status).toBe(403);
  expect(h.start).toHaveBeenCalledTimes(1); expect(h.run).not.toHaveBeenCalled();
  expect((await h.job(first.id, first.cookie)).status).toBe(202);
  expect(h.run).toHaveBeenCalledTimes(1);
 });

 it('atomically permits only one of two concurrent explicitly consented starts', async () => {
  const h = await setup(), first = await h.owner(), second = await h.owner();
  const results = await Promise.all([first, second].map(owner => h.request(`/api/sessions/${owner.id}/speech/start`, post({ consented: true }, `${owner.cookie}; larp_owner_test=${token}`))));
  expect(results.map(response => response.status).sort()).toEqual([200, 403]); expect(h.start).toHaveBeenCalledTimes(1);
 });

 it('rejects expired links without calls and ends live authorization at the 90-second bound', async () => {
  const expired = await setup(); expired.advance(600_000); expect((await expired.claim()).status).toBe(404); expect(expired.start).not.toHaveBeenCalled();
  const h = await setup(), owner = await h.owner(), cookie = `${owner.cookie}; larp_owner_test=${token}`;
  expect((await h.request(`/api/sessions/${owner.id}/speech/start`, post({ consented: true }, cookie))).status).toBe(200);
  h.advance(90_000); expect((await h.job(owner.id, owner.cookie)).status).toBe(403); expect(h.run).not.toHaveBeenCalled(); expect(h.start).toHaveBeenCalledTimes(1);
 });
});
