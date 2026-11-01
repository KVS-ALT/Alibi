import { createHash } from 'node:crypto';

export interface EmailHandoffInput {
  eventId: string;
  sessionId: string;
  projectId: string;
  projectVersion: number;
  ready: boolean;
  explicitRecipient: boolean;
  recipient: string;
  /** Backend constructs these from the successful artifact, never from transcript addresses. */
  projectUrl: string;
  summary: string;
}
export interface EmailHandoffResult {
  status: 'ready' | 'queued' | 'blocked' | 'unknown';
  notSent?: true;
  reason?: string;
  messageId?: string;
  retryAfterSeconds?: number;
}
export interface EmailLimits {
  perSessionPerMinute: number;
  perSessionPerDay: number;
  globalPerFiveMinutes: number;
  globalPerDay: number;
}
export interface EmailConfig {
  enabled?: boolean;
  apiKey?: string;
  inboxId?: string;
  allowedRecipients?: readonly string[];
  limits?: Partial<EmailLimits>;
}
export interface EmailTransportRequest {
  url: string;
  headers: Record<string, string>;
  body: { to: string; subject: string; text: string };
}
export type EmailTransport = (request: EmailTransportRequest) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;
export interface EmailOutboxEntry {
  key: string;
  scopeKey: string;
  payloadHash: string;
  eventId: string;
  sessionId: string;
  projectId: string;
  projectVersion: number;
  recipient: string;
  createdAt: number;
}
export type EmailReservation = { kind: 'reserved' } | { kind: 'existing'; result: EmailHandoffResult } | { kind: 'blocked'; reason: string; retryAfterSeconds?: number };
/** A live implementation must atomically persist reservation, recipient binding and caps. */
export interface EmailOutbox {
  readonly durable: boolean;
  reserve(entry: EmailOutboxEntry, limits: EmailLimits): Promise<EmailReservation>;
  complete(key: string, result: EmailHandoffResult): Promise<void>;
}
export interface EmailDependencies {
  outbox?: EmailOutbox;
  transport?: EmailTransport;
  now?: () => number;
}
const defaults: EmailLimits = { perSessionPerMinute: 1, perSessionPerDay: 5, globalPerFiveMinutes: 10, globalPerDay: 20 };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const blocked = (reason: string, retryAfterSeconds?: number): EmailHandoffResult => ({ status: 'blocked', notSent: true, reason, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });
const mailbox = (value: string) => value.trim().toLowerCase();
const validMailbox = (value: string) => value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Ephemeral simulation only. It cannot enable sending after a process restart. */
export function createMemoryEmailOutbox(): EmailOutbox {
  const entries = new Map<string, { entry: EmailOutboxEntry; result: EmailHandoffResult }>();
  const recipients = new Map<string, string>();
  return {
    durable: false,
    async reserve(entry, limits) {
      const bound = recipients.get(entry.scopeKey);
      if (bound && bound !== entry.recipient) return { kind: 'blocked', reason: 'recipient_locked' };
      const existing = entries.get(entry.key);
      if (existing) return existing.entry.payloadHash === entry.payloadHash
        ? { kind: 'existing', result: { ...existing.result } }
        : { kind: 'blocked', reason: 'idempotency_conflict' };
      const dayStart = Math.floor(entry.createdAt / 86_400_000) * 86_400_000;
      const rows = [...entries.values()].map(value => value.entry);
      const count = (since: number, sessionOnly: boolean) => rows.filter(row => row.createdAt >= since && (!sessionOnly || row.sessionId === entry.sessionId)).length;
      if (count(dayStart, true) >= limits.perSessionPerDay || count(dayStart, false) >= limits.globalPerDay) {
        return { kind: 'blocked', reason: 'rate_limited', retryAfterSeconds: Math.ceil((dayStart + 86_400_000 - entry.createdAt) / 1000) };
      }
      if (count(entry.createdAt - 60_000, true) >= limits.perSessionPerMinute || count(entry.createdAt - 300_000, false) >= limits.globalPerFiveMinutes) {
        return { kind: 'blocked', reason: 'rate_limited', retryAfterSeconds: 300 };
      }
      if (entries.size >= 1000) return { kind: 'blocked', reason: 'outbox_full' };
      recipients.set(entry.scopeKey, entry.recipient);
      entries.set(entry.key, { entry: { ...entry }, result: { status: 'unknown', reason: 'in_progress' } });
      return { kind: 'reserved' };
    },
    async complete(key, result) {
      const record = entries.get(key);
      if (!record) throw new Error('Missing outbox reservation');
      record.result = { ...result };
    },
  };
}

/** No global fetch fallback: callers must explicitly supply the server transport. */
export function createAgentboxdTransport(fetcher: typeof fetch): EmailTransport {
  return async request => {
    const response = await fetcher(request.url, {
      method: 'POST', redirect: 'error', headers: request.headers,
      body: JSON.stringify(request.body), signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, body: await response.json(), headers: { 'retry-after': response.headers.get('retry-after') ?? '' } };
  };
}

/** Optional backend capability. Default configuration performs no network request. */
export function createEmailHandoff(config: EmailConfig = {}, dependencies: EmailDependencies = {}) {
  const outbox = dependencies.outbox ?? createMemoryEmailOutbox();
  const now = dependencies.now ?? Date.now;
  const allowed = new Set((config.allowedRecipients ?? []).map(mailbox).filter(validMailbox));
  const limits = { ...defaults };
  for (const name of Object.keys(defaults) as (keyof EmailLimits)[]) {
    const value = config.limits?.[name];
    if (Number.isSafeInteger(value) && value! > 0) limits[name] = Math.min(value!, defaults[name]);
  }
  async function handoff(input: EmailHandoffInput): Promise<EmailHandoffResult> {
    if (!input.ready) return blocked('project_not_ready');
    if (!input.explicitRecipient) return blocked('recipient_consent_required');
    const recipient = mailbox(input.recipient);
    if (!validMailbox(recipient)) return blocked('invalid_recipient');
    if (![input.eventId, input.sessionId, input.projectId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 200)
      || !Number.isSafeInteger(input.projectVersion) || input.projectVersion < 1
      || typeof input.summary !== 'string' || input.summary.length > 2000 || input.summary.includes('\0')) return blocked('invalid_handoff');
    try {
      const url = new URL(input.projectUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return blocked('invalid_project_url');
    } catch { return blocked('invalid_project_url'); }
    if (config.enabled !== true) return { status: 'ready', notSent: true, reason: 'email_disabled' };
    if (!config.apiKey || !config.inboxId || !dependencies.transport) return blocked('email_unconfigured');
    if (!allowed.has(recipient)) return blocked('recipient_not_allowed');
    if (!outbox.durable) return blocked('durable_outbox_required');
    const body = { to: recipient, subject: 'Your prototype is ready', text: `${input.summary.trim()}\n\nOpen your prototype: ${input.projectUrl}` };
    const scopeKey = hash([input.sessionId, input.projectId]);
    const key = `larp-email-${hash([scopeKey, input.projectVersion])}`;
    let reservation: EmailReservation;
    try {
      reservation = await outbox.reserve({ key, scopeKey, payloadHash: hash(body), eventId: input.eventId, sessionId: input.sessionId, projectId: input.projectId, projectVersion: input.projectVersion, recipient, createdAt: now() }, limits);
    } catch { return blocked('outbox_unavailable'); }
    if (reservation.kind === 'existing') return { ...reservation.result };
    if (reservation.kind === 'blocked') return blocked(reservation.reason, reservation.retryAfterSeconds);
    let result: EmailHandoffResult;
    try {
      const response = await dependencies.transport({
        url: `https://api.agentboxd.com/v1/inboxes/${encodeURIComponent(config.inboxId)}/messages/send`,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body,
      });
      const payload = object(response.body);
      if (response.status === 202 && typeof payload.id === 'string' && /^[a-z0-9_-]{1,200}$/i.test(payload.id)) {
        result = { status: 'queued', messageId: payload.id };
      } else if (response.status >= 400 && response.status < 500) {
        const code = object(payload.error).code;
        const known = new Set(['rate_limited', 'org_daily_limit_exceeded', 'daily_send_limit_exceeded', 'plan_limit_emails', 'idempotency_in_progress', 'idempotency_key_reused', 'recipient_suppressed', 'recipient_blocked', 'insufficient_permissions', 'api_key_expired', 'inbox_paused', 'workspace_stopped']);
        const reason = typeof code === 'string' && known.has(code) ? code : 'provider_refused';
        const retry = Number(response.headers?.['retry-after']);
        result = response.status === 409 ? { status: 'unknown', reason } : blocked(reason, Number.isSafeInteger(retry) && retry > 0 ? Math.min(retry, 86400) : undefined);
      } else result = { status: 'unknown', reason: 'delivery_unknown' };
    } catch { result = { status: 'unknown', reason: 'delivery_unknown' }; }
    try { await outbox.complete(key, result); } catch { return { status: 'unknown', reason: 'outbox_unavailable' }; }
    return result;
  }
  return { handoff };
}
