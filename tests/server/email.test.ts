import { describe, expect, it, vi } from 'vitest';
import { createAgentboxdTransport, createEmailHandoff, createMemoryEmailOutbox } from '../../server/email';
import type { EmailTransportRequest } from '../../server/email';

const input = { eventId: 'event1', sessionId: 's1', projectId: 'p1', projectVersion: 1, ready: true, explicitRecipient: true, recipient: 'owner@example.com', projectUrl: 'http://localhost:3000/projects/p1', summary: 'A booking prototype.' };
const config = { enabled: true, apiKey: 'test-secret', inboxId: 'inbox1', allowedRecipients: ['owner@example.com'] };
const durableForTest = () => Object.assign(createMemoryEmailOutbox(), { durable: true });

describe('optional email handoff', () => {
  it('defaults to ready/not sent without a transport or external side effect', async () => {
    const transport = vi.fn();
    const service = createEmailHandoff({}, { transport });
    expect(await service.handoff(input)).toMatchObject({ status: 'ready', notSent: true });
    expect(transport).not.toHaveBeenCalled();
  });
  it('requires explicit recipient consent, a ready artifact, allowlist and durable outbox before transport', async () => {
    const transport = vi.fn();
    const cases = [
      [{ ...config }, { ...input, explicitRecipient: false }, durableForTest()],
      [{ ...config }, { ...input, ready: false }, durableForTest()],
      [{ ...config, allowedRecipients: [] }, input, durableForTest()],
      [{ ...config }, { ...input, recipient: 'other@example.com' }, durableForTest()],
      [{ ...config }, { ...input, recipient: 'owner@example.com,other@example.com' }, durableForTest()],
      [{ ...config }, input, createMemoryEmailOutbox()],
    ] as const;
    for (const [settings, request, outbox] of cases) {
      expect(await createEmailHandoff(settings, { transport, outbox }).handoff(request)).toMatchObject({ status: 'blocked', notSent: true });
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it('queues once across concurrent retries, without exposing keys or treating acceptance as delivery', async () => {
    const transport = vi.fn(async (_request: EmailTransportRequest) => ({ status: 202, body: { id: 'mail1', status: 'queued' } }));
    const service = createEmailHandoff(config, { transport, outbox: durableForTest() });
    const results = await Promise.all([service.handoff(input), service.handoff({ ...input, eventId: 'retry' })]);
    expect(results[0]).toMatchObject({ status: 'queued', messageId: 'mail1' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(results)).not.toContain('test-secret');
    const request = transport.mock.calls[0][0];
    expect(request.url).toBe('https://api.agentboxd.com/v1/inboxes/inbox1/messages/send');
    expect(request.body).toEqual({ to: 'owner@example.com', subject: 'Your prototype is ready', text: 'A booking prototype.\n\nOpen your prototype: http://localhost:3000/projects/p1' });
    expect(request.headers['Idempotency-Key']).toMatch(/^larp-email-[a-f0-9]{64}$/);
    expect(await service.handoff(input)).toMatchObject({ status: 'queued', messageId: 'mail1' });
  });
  it('locks each project recipient and enforces local caps across new artifact versions', async () => {
    const transport = vi.fn(async () => ({ status: 202, body: { id: 'mail1' } }));
    const service = createEmailHandoff({ ...config, allowedRecipients: ['owner@example.com', 'other@example.com'] }, { transport, outbox: durableForTest(), now: () => 1000 });
    await service.handoff(input);
    expect(await service.handoff({ ...input, projectVersion: 2, recipient: 'other@example.com' })).toMatchObject({ status: 'blocked', reason: 'recipient_locked' });
    expect(await service.handoff({ ...input, projectVersion: 2 })).toMatchObject({ status: 'blocked', reason: 'rate_limited' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not resend after an uncertain transport outcome or accept changed content under the same key', async () => {
    const transport = vi.fn(async () => { throw new Error('network failure with test-secret'); });
    const service = createEmailHandoff(config, { transport, outbox: durableForTest() });
    expect(await service.handoff(input)).toMatchObject({ status: 'unknown', reason: 'delivery_unknown' });
    expect(await service.handoff(input)).toMatchObject({ status: 'unknown' });
    expect(await service.handoff({ ...input, summary: 'Different content' })).toMatchObject({ status: 'blocked', reason: 'idempotency_conflict' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([[429, 'rate_limited'], [402, 'plan_limit_emails'], [409, 'idempotency_in_progress'], [422, 'idempotency_key_reused']])('preserves provider refusal %s as an honest non-send/unknown result', async (status, code) => {
    const transport = vi.fn(async () => ({ status, body: { error: { code, message: 'test-secret' } }, headers: { 'retry-after': '60' } }));
    const result = await createEmailHandoff(config, { transport, outbox: durableForTest() }).handoff(input);
    expect(result.status).toBe(status === 409 ? 'unknown' : 'blocked');
    expect(result.reason).toBe(code);
    expect(JSON.stringify(result)).not.toContain('test-secret');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('adapts an explicitly injected fetch implementation without using global fetch', async () => {
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => new Response(JSON.stringify({ id: 'm1', status: 'queued' }), { status: 202 }));
    const transport = createAgentboxdTransport(fetcher);
    const result = await transport({ url: 'https://api.agentboxd.com/v1/inboxes/i/messages/send', headers: { Authorization: 'Bearer test-secret','Idempotency-Key':'larp-email-'+'a'.repeat(64) }, body: { to: 'owner@example.com', subject: 'Ready', text: 'Ready' } });
    expect(result).toMatchObject({ status: 202, body: { id: 'm1' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error' });
  });
});
