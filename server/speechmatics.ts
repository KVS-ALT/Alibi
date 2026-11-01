export interface SpeechmaticsConfig { enabled?: boolean; liveCallsAllowed?: boolean; apiKey?: string; timeoutMs?: number }
export type SpeechmaticsTokenResult = { ok: true; token: string; expiresIn: 60; url: 'wss://eu.rt.speechmatics.com/v2/' }
  | { ok: false; code: string; safeMessage: string };
const fail = (code: string): SpeechmaticsTokenResult => ({ ok: false, code, safeMessage: 'Speech recognition is unavailable. Try starting again.' });

/** No environment reads/default network. Route owner must verify cookie ownership and active consent. */
export function createSpeechmaticsTokenProvider(config: SpeechmaticsConfig = {}, dependencies: { fetcher?: typeof fetch; now?: () => number } = {}) {
  const now = dependencies.now ?? Date.now;
  const requests: { sessionId: string; at: number }[] = [];
  const pending = new Map<AbortController, string>();
  let disposed = false;
  const isConfigured = () => !disposed && config.enabled === true && config.liveCallsAllowed === true && !!config.apiKey && !!dependencies.fetcher;
  async function issueToken(input: { sessionId: string; consented: boolean; signal?: AbortSignal }): Promise<SpeechmaticsTokenResult> {
    if (!isConfigured()) return fail('provider_disabled');
    if (input.consented !== true || !/^[a-z0-9_-]{1,200}$/i.test(input.sessionId)) return fail('consent_required');
    if (input.signal?.aborted) return fail('cancelled');
    const at = now();
    while (requests.length && requests[0].at <= at - 60_000) requests.shift();
    if (requests.length >= 10 || requests.filter(request => request.sessionId === input.sessionId).length >= 2) return fail('rate_limited');
    requests.push({ sessionId: input.sessionId, at });
    const controller = new AbortController(); pending.set(controller, input.sessionId);
    const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
    let timeout = false;
    const timer = setTimeout(() => { timeout = true; controller.abort(); }, Math.max(1, Math.min(config.timeoutMs ?? 10_000, 10_000)));
    const guarded = <T>(operation: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('Cancelled')); };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      operation.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    });
    try {
      const response = await guarded(dependencies.fetcher!('https://mp.speechmatics.com/v1/api_keys?type=rt', {
        method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 60 }),
      }));
      if (!response.ok) return fail(response.status === 429 ? 'rate_limited' : 'provider_auth');
      const body = await guarded(response.text());
      if (body.length > 16_384 || signal.aborted || disposed) return fail(signal.aborted ? 'cancelled' : 'invalid_provider_response');
      const raw: unknown = JSON.parse(body);
      const token = raw && typeof raw === 'object' ? (raw as { key_value?: unknown }).key_value : undefined;
      if (typeof token !== 'string' || token.length > 4096 || !/^[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(token) || token.includes(config.apiKey!)) return fail('invalid_provider_response');
      const claims: unknown = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      const expires = claims && typeof claims === 'object' ? (claims as { exp?: unknown }).exp : undefined;
      if (typeof expires !== 'number' || !Number.isFinite(expires) || expires <= now() / 1000 || expires > now() / 1000 + 90) return fail('invalid_provider_response');
      // This temporary key can authorize multiple RT connections during its TTL. It is not single-use.
      return { ok: true, token, expiresIn: 60, url: 'wss://eu.rt.speechmatics.com/v2/' };
    } catch { return fail(timeout ? 'provider_timeout' : signal.aborted ? 'cancelled' : 'invalid_provider_response'); }
    finally { clearTimeout(timer); pending.delete(controller); }
  }
  function cancelSession(sessionId: string) { pending.forEach((id, controller) => { if (id === sessionId) controller.abort(); }); }
  function dispose() { disposed = true; pending.forEach((_id, controller) => controller.abort()); pending.clear(); requests.length = 0; }
  return { issueToken, cancelSession, dispose, isConfigured };
}
