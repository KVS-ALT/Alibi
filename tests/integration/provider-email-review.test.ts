// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createFileEmailOutbox } from '../../server/email';
import { createConfiguredAgentboxdHandoff } from '../../server/providers/agentboxd';

const secret = 'synthetic-review-secret';
const config = { liveGate: true, apiKey: secret, inboxId: 'review_inbox', allowedRecipients: ['review@example.test'] };
const input = { eventId: 'event-a', sessionId: 'anonymous-owner-a', projectId: 'project-a', projectVersion: 1, ready: true, explicitRecipient: true, recipient: 'review@example.test', projectUrl: 'https://example.test/prototype', summary: 'Synthetic review fixture.' };
const directories: string[] = [];
async function path() { const directory = await mkdtemp(join(tmpdir(), 'provider-review-')); directories.push(directory); return join(directory, 'outbox.json'); }
afterEach(async () => { for (const directory of directories.splice(0)) { if (!resolve(directory).startsWith(resolve(tmpdir(), 'provider-review-'))) throw new Error('Unsafe cleanup'); await rm(directory, { recursive: true, force: true }); } });

describe('independent provider email security review', () => {
  it('never returns or persists an echoed credential disguised as a successful message identifier', async () => {
    const outboxPath = await path();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: secret }), { status: 202 }));
    const service = createConfiguredAgentboxdHandoff(config, { fetcher, outbox: createFileEmailOutbox(outboxPath) });
    const result = await service.handoff(input);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.status).toBe('unknown');
    expect(await readFile(outboxPath, 'utf8')).not.toContain(secret);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reserves once across concurrent independently reconstructed outboxes before an ambiguous send', async () => {
    const outboxPath = await path();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const fetcher = vi.fn(async () => { await pending; throw new Error('Synthetic connection interruption'); });
    const service = () => createConfiguredAgentboxdHandoff(config, { fetcher, outbox: createFileEmailOutbox(outboxPath) });
    const attempts = Array.from({ length: 8 }, (_, index) => service().handoff({ ...input, eventId: 'race-' + index }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    finish();
    const results = await Promise.all(attempts);
    expect(results.every(result => result.status === 'blocked' || result.status === 'unknown')).toBe(true);
    expect(await service().handoff(input)).toMatchObject({ status: 'unknown' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful reservation scoped to its anonymous session when another session uses identical content', async () => {
    const outboxPath = await path();
    let acceptedCount = 0;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'accepted_' + (++acceptedCount) }), { status: 202 }));
    const service = () => createConfiguredAgentboxdHandoff(config, { fetcher, outbox: createFileEmailOutbox(outboxPath), now: () => 1000 });
    const first = await service().handoff(input);
    const second = await service().handoff({ ...input, sessionId: 'anonymous-owner-b' });
    expect(first.status).toBe('queued'); expect(second.status).toBe('queued');
    expect(first.messageId).not.toBe(second.messageId);
    expect(await service().handoff(input)).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
