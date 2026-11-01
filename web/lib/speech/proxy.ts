import { randomUUID } from 'node:crypto';
import { isSpeakerLabel, type SpeakerLabel, type TranscriptSegment } from './types';
import type { SpeechmaticsTokenResult } from './token';

export interface ProxySocket {
  readyState: number; bufferedAmount: number;
  onopen: (() => void) | null; onclose: (() => void) | null; onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string | Uint8Array): void; close(): void;
}
export interface SpeechProxyConfig {
  enabled?: boolean; liveCallsAllowed?: boolean;
  /** Explicit server opt-in: capture ends on user End/disconnect, not a test allowance. */
  continuousCapture?: boolean;
  maxSessionAudioSeconds?: number; maxGlobalAudioSeconds?: number; maxWallMs?: number;
  maxStreams?: number; maxStartsPerSession?: number; maxStartsGlobal?: number;
}
export interface SpeechProxyIdentity { sessionId: string; streamId: string }
export type SpeechProxyResult = { ok: true; streamId: string } | { ok: false; code: string };
export type SpeechProxyEvent = { id: string; type: 'segment'; segment: TranscriptSegment }
  | { id: string; type: 'state'; state: 'active' | 'ended'; code?: string };
export interface SpeechProxyDependencies {
  tokenProvider: { issueToken(input: { sessionId: string; consented: boolean; signal?: AbortSignal }): Promise<SpeechmaticsTokenResult>; cancelSession(sessionId: string): void };
  /** Native Node WebSocket may be supplied only by the centrally gated server owner. */
  createSocket?: (url: string) => ProxySocket;
  now?: () => number;
  onSegment?: (segment: TranscriptSegment) => void;
}
interface Stream {
  id: string; sessionId: string; phase: 'starting' | 'active' | 'ended'; reason?: string;
  abort: AbortController; socket?: ProxySocket; deadline?: ReturnType<typeof setTimeout>; handshake?: ReturnType<typeof setTimeout>;
  ready: Promise<SpeechProxyResult>; resolveReady(result: SpeechProxyResult): void;
  listeners: Set<(event: SpeechProxyEvent) => boolean | void>; buffer: SpeechProxyEvent[]; eventIndex: number;
  segmentIndex: number; pendingSegment: string; finals: Set<string>; token?: string;
  sent: number; acknowledged: number; bytes: number; outstanding: number[];
  ackWait?: () => void; utteranceWait?: () => void; flushPromise?: Promise<SpeechProxyResult>;
}
interface Session { bytes: number; starts: number; stream?: Stream }
const fail = (code: string): SpeechProxyResult => ({ ok: false, code });
const positive = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
interface SpeakerTurn { text: string; speaker?: SpeakerLabel }
/** Diarization lives on each word, not on metadata.transcript. Preserve turn order. */
function transcriptTurns(results: unknown, fallback: unknown): SpeakerTurn[] {
  const turns: SpeakerTurn[] = [];
  if (Array.isArray(results)) {
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const alternative = Array.isArray(result.alternatives) ? result.alternatives[0] : undefined;
      if (!alternative || typeof alternative.content !== 'string' || !alternative.content.trim()) continue;
      const content = alternative.content.trim();
      const previous = turns[turns.length - 1];
      const punctuation = result.type === 'punctuation';
      const label = alternative.speaker;
      const speaker: SpeakerLabel | undefined = isSpeakerLabel(label) ? label : punctuation ? previous?.speaker : undefined;
      // Unlabelled punctuation belongs to the preceding word; it is not a third voice.
      if (previous && (punctuation || previous.speaker === speaker)) {
        const attaches = punctuation && !/^[([{]$/.test(content) || /^[.,!?;:%)\]}]/.test(content) || /^['’](?:s|t|re|ve|ll|d|m)$/.test(content) || /[([{]$/.test(previous.text);
        previous.text += (attaches ? '' : ' ') + content;
      } else turns.push({ text: content, ...(speaker ? { speaker } : {}) });
    }
  }
  if (!turns.length && typeof fallback === 'string') turns.push({ text: fallback.trim() });
  return turns;
}

/** No audio retention, provider credentials in responses, or automatic reconnect. Caps survive stream restarts. */
export function createSpeechmaticsProxy(config: SpeechProxyConfig = {}, dependencies?: SpeechProxyDependencies) {
  const sessions = new Map<string, Session>();
  const byteCap = (seconds: number | undefined) => { const bytes = Math.floor(positive(seconds) * 32000); return Number.isSafeInteger(bytes) ? bytes : 0; };
  const continuous = config.continuousCapture === true;
  const sessionCap = continuous ? Infinity : byteCap(config.maxSessionAudioSeconds);
  const globalCap = continuous ? Infinity : byteCap(config.maxGlobalAudioSeconds);
  const wallMs = continuous ? Infinity : Math.min(Math.floor(positive(config.maxWallMs)), 2_147_483_647);
  const maxStreams = Math.min(Math.floor(positive(config.maxStreams) || 1), 10);
  const maxStarts = continuous ? Infinity : Math.min(Math.floor(positive(config.maxStartsPerSession) || 2), 10);
  const globalStartsCap = continuous ? Infinity : config.maxStartsGlobal === undefined ? 1 : Math.min(Math.floor(positive(config.maxStartsGlobal)), 100);
  let globalBytes = 0, globalStarts = 0, disposed = false;
  const isConfigured = () => !disposed && config.enabled === true && config.liveCallsAllowed === true && sessionCap > 0 && globalCap > 0 && globalStartsCap > 0 && wallMs > 0 && !!dependencies?.tokenProvider && !!dependencies.createSocket;
  function emit(stream: Stream, event: Omit<Extract<SpeechProxyEvent, { type: 'segment' }>, 'id'> | Omit<Extract<SpeechProxyEvent, { type: 'state' }>, 'id'>) {
    const value = { ...event, id: `${stream.id}:${++stream.eventIndex}` } as SpeechProxyEvent;
    if (!stream.listeners.size) {
      if (stream.buffer.length >= 32) { finish(stream, 'event_backpressure'); return; }
      stream.buffer.push(value); return;
    }
    for (const listener of stream.listeners) {
      try { if (listener(value) === false && stream.phase !== 'ended') finish(stream, 'client_backpressure'); }
      catch { if (stream.phase !== 'ended') finish(stream, 'client_disconnected'); }
    }
  }
  function finish(stream: Stream, code: string) {
    if (stream.phase === 'ended') return;
    stream.phase = 'ended'; stream.reason = code; stream.abort.abort();
    if (stream.deadline) clearTimeout(stream.deadline); if (stream.handshake) clearTimeout(stream.handshake);
    dependencies?.tokenProvider.cancelSession(stream.sessionId);
    const socket = stream.socket; stream.socket = undefined; stream.token = undefined;
    if (socket) { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; try { socket.close(); } catch {} }
    stream.resolveReady(fail(code)); stream.ackWait?.(); stream.utteranceWait?.(); stream.ackWait = stream.utteranceWait = undefined;
    stream.outstanding.length = 0; stream.finals.clear(); stream.pendingSegment = '';
    emit(stream, { type: 'state', state: 'ended', code });
  }
  const current = (identity: SpeechProxyIdentity) => {
    const stream = sessions.get(identity.sessionId)?.stream;
    return stream?.id === identity.streamId ? stream : undefined;
  };
  async function start(input: { sessionId: string; consented: boolean; signal?: AbortSignal }): Promise<SpeechProxyResult> {
    if (!isConfigured()) return fail('provider_disabled');
    if (input.consented !== true || !/^[a-z0-9_-]{1,200}$/i.test(input.sessionId)) return fail('consent_required');
    if (input.signal?.aborted) return fail('cancelled');
    let session = sessions.get(input.sessionId);
    if (session?.stream && session.stream.phase !== 'ended') return session.stream.ready;
    if (globalStarts >= globalStartsCap) return fail('stream_start_limit');
    if (session && session.starts >= maxStarts) return fail('stream_start_limit');
    if (session && session.bytes >= sessionCap || globalBytes >= globalCap) return fail('audio_limit');
    if ([...sessions.values()].filter(value => value.stream && value.stream.phase !== 'ended').length >= maxStreams) return fail('stream_capacity');
    if (!session) { if (sessions.size >= 100) return fail('session_capacity'); session = { bytes: 0, starts: 0 }; sessions.set(input.sessionId, session); }
    session.starts++; globalStarts++;
    let resolveReady!: (value: SpeechProxyResult) => void;
    const ready = new Promise<SpeechProxyResult>(resolve => { resolveReady = resolve; });
    const stream: Stream = { id: randomUUID(), sessionId: input.sessionId, phase: 'starting', abort: new AbortController(), ready, resolveReady,
      listeners: new Set(), buffer: [], eventIndex: 0, segmentIndex: 0, pendingSegment: '', finals: new Set(), sent: 0, acknowledged: 0, bytes: 0, outstanding: [] };
    session.stream = stream;
    const cancel = () => finish(stream, 'cancelled'); input.signal?.addEventListener('abort', cancel, { once: true });
    if (!continuous) stream.deadline = setTimeout(() => finish(stream, 'wall_limit'), wallMs);
    stream.handshake = setTimeout(() => finish(stream, 'connection_timeout'), Math.min(15000, wallMs));
    void (async () => {
      try {
        const token = await dependencies!.tokenProvider.issueToken({ sessionId: input.sessionId, consented: true, signal: stream.abort.signal });
        if (stream.phase === 'ended') return;
        if (!token.ok || token.url !== 'wss://eu.rt.speechmatics.com/v2/' || !token.token || token.token.length > 4096) { finish(stream, 'authorization_failed'); return; }
        stream.token = token.token;
        const url = new URL(token.url); url.searchParams.set('jwt', token.token);
        const socket = dependencies!.createSocket!(url.toString()); stream.socket = socket;
        socket.onopen = () => {
          if (stream.phase !== 'starting') return;
          try { socket.send(JSON.stringify({ message: 'StartRecognition', audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16000 }, transcription_config: { language: 'en', enable_partials: true, model: 'enhanced', max_delay: 0.7, diarization: 'speaker' } })); }
          catch { finish(stream, 'connection_error'); }
        };
        socket.onmessage = event => {
          if (stream.phase === 'ended') return;
          try {
            if (typeof event.data !== 'string' || event.data.length > 65536) { finish(stream, 'invalid_provider_response'); return; }
            const value = JSON.parse(event.data) as { message?: string; seq_no?: number; forced?: boolean; metadata?: { transcript?: unknown; start_time?: number; end_time?: number }; results?: unknown };
            if (value.message === 'RecognitionStarted' && stream.phase === 'starting') {
              stream.phase = 'active'; if (stream.handshake) clearTimeout(stream.handshake);
              stream.resolveReady({ ok: true, streamId: stream.id }); emit(stream, { type: 'state', state: 'active' });
            } else if (value.message === 'AudioAdded' && Number.isSafeInteger(value.seq_no) && value.seq_no! > stream.acknowledged && value.seq_no! <= stream.sent) {
              stream.outstanding.splice(0, value.seq_no! - stream.acknowledged); stream.acknowledged = value.seq_no!; stream.ackWait?.();
            } else if ((value.message === 'AddPartialTranscript' || value.message === 'AddTranscript') && stream.phase === 'active') {
              const turns = transcriptTurns(value.results, value.metadata?.transcript);
              const text = turns.map(turn => turn.text).join(' ');
              if (!turns.length || text.length > 50000 || text.includes('\0') || stream.token && text.includes(stream.token)) { finish(stream, 'invalid_provider_response'); return; }
              const isFinal = value.message === 'AddTranscript', key = JSON.stringify([value.metadata?.start_time, value.metadata?.end_time, turns]);
              if (isFinal && stream.finals.has(key)) return;
              if (!stream.pendingSegment) stream.pendingSegment = `${stream.sessionId}:speechmatics:${stream.id}:${++stream.segmentIndex}`;
              const segmentBase = stream.pendingSegment;
              if (isFinal) { stream.finals.add(key); stream.pendingSegment = ''; if (stream.finals.size > 10000) { if (continuous) stream.finals.delete(stream.finals.values().next().value!); else { finish(stream, 'transcript_limit'); return; } } }
              for (let index = 0; index < turns.length; index++) {
                const turn = turns[index];
                const segment: TranscriptSegment = { sessionId: stream.sessionId, segmentId: `${segmentBase}:turn:${index}`, text: turn.text, isFinal, ...(turn.speaker ? { speaker: turn.speaker } : {}) };
                if (segment.text) {
                  if (segment.isFinal) dependencies?.onSegment?.(segment);
                  emit(stream, { type: 'segment', segment });
                }
              }
            } else if (value.message === 'EndOfUtterance' && value.forced === true) stream.utteranceWait?.();
            else if (value.message === 'Error') finish(stream, 'provider_error');
          } catch { finish(stream, 'invalid_provider_response'); }
        };
        socket.onerror = () => finish(stream, 'connection_error'); socket.onclose = () => finish(stream, 'connection_closed');
      } catch { finish(stream, 'authorization_failed'); }
    })();
    const result = await ready; input.signal?.removeEventListener('abort', cancel); return result;
  }
  function writePcm(input: SpeechProxyIdentity & { audio: Uint8Array }): SpeechProxyResult {
    const stream = current(input), session = sessions.get(input.sessionId);
    if (!stream || !session) return fail('stream_not_found');
    if (stream.phase !== 'active') return fail(stream.reason ?? 'stream_inactive');
    const bytes = input.audio?.byteLength;
    if (!(input.audio instanceof Uint8Array) || !bytes || bytes > 16384 || bytes % 2) { finish(stream, 'invalid_audio'); return fail('invalid_audio'); }
    if (session.bytes + bytes > sessionCap || globalBytes + bytes > globalCap) { finish(stream, 'audio_limit'); return fail('audio_limit'); }
    if (!stream.socket || stream.socket.readyState !== 1 || stream.socket.bufferedAmount > 65536 || stream.outstanding.reduce((sum, count) => sum + count, 0) + bytes > 320000 || stream.sent - stream.acknowledged >= 500) { finish(stream, 'audio_backpressure'); return fail('audio_backpressure'); }
    // Reserve before sending. Failed or uncertain sends still consume this process's approved allowance.
    session.bytes += bytes; globalBytes += bytes; stream.bytes += bytes; stream.sent++; stream.outstanding.push(bytes);
    try { stream.socket.send(input.audio); } catch { finish(stream, 'connection_error'); return fail('connection_error'); }
    if (globalBytes >= globalCap) sessions.forEach(value => { if (value.stream) finish(value.stream, 'audio_limit'); });
    else if (session.bytes >= sessionCap) finish(stream, 'audio_limit');
    return { ok: true, streamId: stream.id };
  }
  function subscribe(identity: SpeechProxyIdentity, listener: (event: SpeechProxyEvent) => boolean | void): (() => void) | null {
    const stream = current(identity);
    if (!stream || stream.listeners.size) return null;
    stream.listeners.add(listener); const buffered = stream.buffer.splice(0);
    for (const event of buffered) { try { if (listener(event) === false) { finish(stream, 'client_backpressure'); break; } } catch { finish(stream, 'client_disconnected'); break; } }
    return () => { stream.listeners.delete(listener); finish(stream, 'client_disconnected'); };
  }
  async function flush(identity: SpeechProxyIdentity): Promise<SpeechProxyResult> {
    const stream = current(identity); if (!stream || stream.phase !== 'active') return fail('stream_inactive');
    if (stream.flushPromise) return stream.flushPromise;
    const target = stream.sent, timestamp = stream.bytes / 32000;
    stream.flushPromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const wait = (register: (resolve: () => void) => void) => new Promise<void>((resolve, reject) => {
          timer = setTimeout(() => { timer = undefined; reject(new Error('Deadline')); }, 5000);
          register(() => { if (timer) clearTimeout(timer); timer = undefined; resolve(); });
        });
        if (stream.acknowledged < target) await wait(resolve => { stream.ackWait = () => { if (stream.acknowledged >= target || stream.phase === 'ended') resolve(); }; });
        if (stream.phase !== 'active') return fail(stream.reason ?? 'cancelled');
        const forced = wait(resolve => { stream.utteranceWait = resolve; });
        stream.socket!.send(JSON.stringify({ message: 'ForceEndOfUtterance', timestamp })); await forced;
        return stream.phase === 'active' ? { ok: true as const, streamId: stream.id } : fail(stream.reason ?? 'cancelled');
      } catch { finish(stream, 'flush_timeout'); return fail('flush_timeout'); }
      finally { if (timer) clearTimeout(timer); stream.ackWait = stream.utteranceWait = undefined; stream.flushPromise = undefined; }
    })();
    return stream.flushPromise;
  }
  function endSession(sessionId: string) { const stream = sessions.get(sessionId)?.stream; if (stream) finish(stream, 'ended'); }
  function endStream(identity: SpeechProxyIdentity): SpeechProxyResult {
    const stream = current(identity); if (!stream) return fail('stream_not_found');
    finish(stream, 'ended'); return { ok: true, streamId: stream.id };
  }
  function dispose() { disposed = true; sessions.forEach(session => { if (session.stream) finish(session.stream, 'disposed'); }); sessions.clear(); }
  return { start, writePcm, subscribe, flush, endStream, endSession, muteSession: endSession, dispose, isConfigured };
}

