import type { TranscriptSegment } from '../src/contracts';

export interface ElevenLabsConfig {
  enabled?: boolean;
  liveCallsAllowed?: boolean;
  apiKey?: string;
  /** Provider retention is separate from this app's in-memory-only audio handling. */
  allowProviderLogging?: boolean;
  maxAudioBytes?: number;
  /** Also enforced against the sample count in canonical mono PCM16/16kHz WAV. */
  maxDurationMs?: number;
  timeoutMs?: number;
}
export interface SpeechChunk {
  sessionId: string;
  chunkId: string;
  audio: Uint8Array;
  mimeType: string;
  durationMs: number;
  signal?: AbortSignal;
}
export type SpeechTranscriptionResult = {
  ok: true; provider: 'elevenlabs'; mode: 'bounded'; segment: TranscriptSegment;
} | { ok: false; code: string; safeMessage: string; retryable: boolean };
interface Session { state: 'active' | 'muted' | 'ended'; seen: Set<string>; pending: Set<AbortController> }
const fail = (code: string, retryable = false): SpeechTranscriptionResult => ({
  ok: false, code, retryable,
  safeMessage: code === 'provider_disabled'
    ? 'ElevenLabs transcription is disabled. Continue by typing.'
    : code === 'cancelled' ? 'Transcription cancelled. Continue by typing.'
      : 'Audio transcription is unavailable. Continue by typing or explicitly resume to try again.',
});
const cap = (value: number | undefined, fallback: number) => Number.isSafeInteger(value) && value! > 0 ? Math.min(value!, fallback) : fallback;
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => { signal.removeEventListener('abort', cancel); reject(new Error('Cancelled')); };
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    operation.then(value => { signal.removeEventListener('abort', cancel); resolve(value); }, error => { signal.removeEventListener('abort', cancel); reject(error); });
  });
}
function wavDuration(audio: Uint8Array): number | undefined {
  if (audio.byteLength < 44) return undefined;
  const ascii = (start: number, text: string) => [...text].every((char, index) => audio[start + index] === char.charCodeAt(0));
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const bytes = audio.byteLength - 44;
  if (!ascii(0, 'RIFF') || !ascii(8, 'WAVE') || !ascii(12, 'fmt ') || !ascii(36, 'data')
    || view.getUint32(4, true) !== audio.byteLength - 8 || view.getUint32(16, true) !== 16
    || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000
    || view.getUint32(28, true) !== 32000 || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16
    || view.getUint32(40, true) !== bytes || bytes % 2 !== 0) return undefined;
  return bytes / 32;
}

/** Bounded file transcription, not the realtime PCM/WebSocket protocol. No env reads or default fetch. */
export function createElevenLabsTranscriber(config: ElevenLabsConfig = {}, dependencies: { fetcher?: typeof fetch } = {}) {
  const sessions = new Map<string, Session>();
  const maxAudioBytes = cap(config.maxAudioBytes, 2 * 1024 * 1024);
  const maxDurationMs = cap(config.maxDurationMs, 30_000);
  const timeoutMs = cap(config.timeoutMs, 20_000);
  let disposed = false;
  const configured = () => config.enabled === true && config.liveCallsAllowed === true && !!config.apiKey && !!dependencies.fetcher;
  function startSession(input: { sessionId: string; consented: boolean; providerRetentionAccepted?: boolean }) {
    if (disposed || input.consented !== true || !/^[a-z0-9_-]{1,200}$/i.test(input.sessionId)) return false;
    if (config.allowProviderLogging === true && input.providerRetentionAccepted !== true) return false;
    if (sessions.has(input.sessionId)) return sessions.get(input.sessionId)!.state === 'active';
    if (sessions.size >= 200) return false;
    sessions.set(input.sessionId, { state: 'active', seen: new Set(), pending: new Set() });
    return true;
  }
  function muteSession(sessionId: string) {
    const session = sessions.get(sessionId);
    if (!session || session.state === 'ended') return;
    session.state = 'muted';
    session.pending.forEach(controller => controller.abort());
    session.pending.clear();
  }
  function resumeSession(sessionId: string) {
    const session = sessions.get(sessionId);
    if (!disposed && session?.state === 'muted') session.state = 'active';
  }
  function endSession(sessionId: string) {
    muteSession(sessionId);
    const session = sessions.get(sessionId);
    if (session) { session.state = 'ended'; session.seen.clear(); sessions.delete(sessionId); }
  }
  async function transcribe(input: SpeechChunk): Promise<SpeechTranscriptionResult> {
    if (disposed) return fail('session_not_active');
    if (!configured()) return fail('provider_disabled');
    const session = sessions.get(input.sessionId);
    if (session?.state !== 'active') return fail('session_not_active');
    if (input.signal?.aborted) return fail('cancelled');
    const mime = typeof input.mimeType === 'string' ? input.mimeType.split(';')[0].trim().toLowerCase() : '';
    if (!(input.audio instanceof Uint8Array) || input.audio.byteLength < 1 || input.audio.byteLength > maxAudioBytes
      || !Number.isFinite(input.durationMs) || input.durationMs < 100 || input.durationMs > maxDurationMs
      || mime !== 'audio/wav' || !/^[a-z0-9_-]{1,100}$/i.test(input.chunkId)) return fail('invalid_audio');
    const actualDuration = wavDuration(input.audio);
    if (actualDuration === undefined || actualDuration < 100 || actualDuration > maxDurationMs) return fail('invalid_audio');
    if (session.seen.has(input.chunkId)) return fail('duplicate_chunk');
    if (session.pending.size) return fail('provider_busy', true);
    if (session.seen.size >= 720) return fail('session_limit');
    session.seen.add(input.chunkId); // No automatic retry can spend credits twice for a chunk.
    const controller = new AbortController();
    session.pending.add(controller);
    const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const form = new FormData();
      form.set('model_id', 'scribe_v2');
      form.set('file', new Blob([new Uint8Array(input.audio)], { type: mime }), 'segment.wav');
      form.set('diarize', 'false');
      form.set('tag_audio_events', 'false');
      form.set('timestamps_granularity', 'none');
      const response = await abortable(dependencies.fetcher!(`https://api.elevenlabs.io/v1/speech-to-text?enable_logging=${config.allowProviderLogging === true ? 'true' : 'false'}`, {
        method: 'POST', headers: { 'xi-api-key': config.apiKey! }, body: form, signal, redirect: 'error',
      }), signal);
      if (signal.aborted || session.state !== 'active' || disposed) return fail(timedOut ? 'provider_timeout' : 'cancelled');
      if (response.status === 401 || response.status === 403) return fail('provider_auth');
      if (response.status === 429) return fail('provider_rate_limited', true);
      if (!response.ok) return fail('provider_error', response.status >= 500);
      const reader = response.body?.getReader();
      if (!reader) return fail('invalid_provider_response');
      const decoder = new TextDecoder();
      let body = '';
      let bytes = 0;
      while (true) {
        const { done, value } = await abortable(reader.read(), signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 128 * 1024 || signal.aborted) { await reader.cancel(); return fail(signal.aborted ? 'cancelled' : 'invalid_provider_response'); }
        body += decoder.decode(value, { stream: true });
      }
      const payload: unknown = JSON.parse(body + decoder.decode());
      if (signal.aborted || session.state !== 'active' || disposed) return fail('cancelled');
      const text = payload && typeof payload === 'object' ? (payload as { text?: unknown }).text : undefined;
      if (typeof text !== 'string' || text.length > 50_000 || text.includes('\0') || text.includes(config.apiKey!)) return fail('invalid_provider_response');
      return { ok: true, provider: 'elevenlabs', mode: 'bounded', segment: { sessionId: input.sessionId, segmentId: `${input.sessionId}:elevenlabs:${input.chunkId}`, text: text.trim(), isFinal: true } };
    } catch {
      return fail(signal.aborted ? (timedOut ? 'provider_timeout' : 'cancelled') : 'provider_error', !signal.aborted || timedOut);
    } finally {
      clearTimeout(timeout);
      session.pending.delete(controller);
    }
  }
  function dispose() { disposed = true; sessions.forEach((_value, key) => endSession(key)); sessions.clear(); }
  return { startSession, muteSession, resumeSession, endSession, transcribe, dispose, isConfigured: configured };
}
