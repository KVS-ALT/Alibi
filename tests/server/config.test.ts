import { describe, expect, it } from 'vitest';
import { publicProviderCapabilities, readRuntimeConfig } from '../../server/config';
import { createProviderBudget } from '../../server/provider-budget';

const populated = { PORT: '3001', HOST: '0.0.0.0', NODE_ENV: 'production', LIVE_PROVIDER_CALLS_ENABLED: 'true', GENERATION_PROVIDER: 'openai', OPENAI_API_KEY: 'test-secret-ai', SPEECH_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'test-secret-speech', EMAIL_SEND_ENABLED: 'true', AGENTBOXD_API_KEY: 'test-secret-email', AGENTBOXD_INBOX_ID: 'private-inbox', EMAIL_ALLOWED_RECIPIENTS: 'approved@example.test', EMAIL_OUTBOX_PATH: 'private-outbox.json', RENDER_USE_LOCAL_DEV: 'true' };
describe('server-only provider authorization', () => {
 it('requires explicit runtime authorization in addition to environment flags and keys', () => {
  expect(readRuntimeConfig(populated).liveCallsAllowed).toBe(false);
  expect(readRuntimeConfig(populated, ['--allow-live-providers']).liveCallsAllowed).toBe(true);
  expect(readRuntimeConfig({}, ['--allow-live-providers']).liveCallsAllowed).toBe(false);
  expect(readRuntimeConfig(populated, ['--allow-live-providers', '--no-live-providers']).liveCallsAllowed).toBe(false);
 });
 it('forces candidate isolation even when every provider and production flag is set', () => {
  const config = readRuntimeConfig(populated, ['--candidate', '--allow-live-providers']);
  expect(config.liveCallsAllowed).toBe(false); expect(config.port).toBe(3002); expect(config.host).toBe('127.0.0.1');
  expect(config.cookieName).toBe('forme_candidate_owner'); expect(config.secureCookies).toBe(false); expect(config.renderLocal).toBe(false);
  expect(config.email.outboxPath).toBeUndefined(); expect(config.email.liveGate).toBe(false);
  expect(() => readRuntimeConfig(populated, ['--candidate', '--candidate-port=3001'])).toThrow();
 });
 it('never includes credential values, recipients, inbox IDs or private paths in health metadata', () => {
  const serialized = JSON.stringify(publicProviderCapabilities(readRuntimeConfig(populated)));
  for (const secret of ['test-secret-ai', 'test-secret-speech', 'test-secret-email', 'private-inbox', 'approved@example.test', 'private-outbox.json']) expect(serialized).not.toContain(secret);
 });
 it('rejects arbitrary provider/model choices instead of forwarding them', () => {
  expect(() => readRuntimeConfig({ GENERATION_PROVIDER: 'https://untrusted.test' })).toThrow();
  expect(() => readRuntimeConfig({ OPENAI_MODEL: 'caller-selected-expensive-model' })).toThrow();
 });
 it('bounds provider spending seams by owned session, socket address and global hourly caps', () => {
  let now = 0; const budget = createProviderBudget(() => now);
  for (let index = 0; index < 3; index++) expect(budget.reserve('generation', 'session-a', 'address-a')).toBe(true);
  expect(budget.reserve('generation', 'session-a', 'address-a')).toBe(false);
  for (let index = 0; index < 3; index++) expect(budget.reserve('generation', 'session-b', 'address-a')).toBe(true);
  expect(budget.reserve('generation', 'session-c', 'address-a')).toBe(false);
  expect(budget.reserve('speech', 'session-a', 'address-a', 7 * 1024 * 1024)).toBe(false);
  now = 3_600_001; expect(budget.reserve('generation', 'session-a', 'address-a')).toBe(true);
 });
});
