import { randomUUID } from 'node:crypto';
import type { TranscriptSegment } from './types';
import type { SpeechmaticsTokenResult } from './token';

export interface ProxySocket {
  readyState: number; bufferedAmount: number;
  onopen: (() => void) | null; onclose: (() => void) | null; onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string | Uint8Array): void; close(): void;
}
export interface SpeechProxyConfig {
  enabled?: boolean; liveCallsAllowed?: boolean;
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
// Optional custom vocabulary for names you plan to say (SPEECHMATICS_VOCAB="LeaseLens,Standup").
const VOCAB = (process.env.SPEECHMATICS_VOCAB ?? '').split(',').map(v => v.trim()).filter(Boolean).slice(0, 100).map(content => ({ content }));

// Diarization labels each word (alternatives[0].speaker = "S1", "S2", or "UU" for unknown). Group consecutive words by
// speaker; punctuation joins the previous word without a space.
function speakerTurns(results: unknown, fallback: string): { text: string; speaker?: string }[] {
  const turns: { text: string; speaker?: string }[] = [];
  if (Array.isArray(results)) {
    for (const r of results as { type?: string; alternatives?: { content?: unknown; speaker?: unknown }[] }[]) {
      const alt = r?.alternatives?.[0];
      if (typeof alt?.content !== 'string' || !alt.content.trim()) continue;
      const last = turns[turns.length - 1];
      const speaker = typeof alt.speaker === 'string' && /^(S\d{1,3}|UU)$/.test(alt.speaker) ? alt.speaker : undefined;
      if (r.type === 'punctuation' && last) { last.text += alt.content; continue; }
      if (last && last.speaker === speaker) last.text += ' ' + alt.content;
      else turns.push({ text: alt.content, ...(speaker ? { speaker } : {}) });
    }
  }
  return turns.length ? turns : [{ text: fallback.trim() }];
}
const positive = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** No audio retention, provider credentials in responses, or automatic reconnect. Caps survive stream restarts. */
export function createSpeechmaticsProxy(config: SpeechProxyConfig = {}, dependencies?: SpeechProxyDependencies) {
  const sessions = new Map<string, Session>();
  const byteCap = (seconds: number | undefined) => { const bytes = Math.floor(positive(seconds) * 32000); return Number.isSafeInteger(bytes) ? bytes : 0; };
  const sessionCap = byteCap(config.maxSessionAudioSeconds);
  const globalCap = byteCap(config.maxGlobalAudioSeconds);
  const wallMs = Math.min(Math.floor(positive(config.maxWallMs)), 2_147_483_647);
  const maxStreams = Math.min(Math.floor(positive(config.maxStreams) || 1), 10);
  const maxStarts = Math.min(Math.floor(positive(config.maxStartsPerSession) || 2), 10);
  const globalStartsCap = config.maxStartsGlobal === undefined ? 1 : Math.min(Math.floor(positive(config.maxStartsGlobal)), 100);
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
    if (code !== 'ended') console.warn(`[speech] stream ${stream.id.slice(0, 8)} ended: ${code}`);
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
    const result = await startInner(input);
    if (!result.ok) console.warn(`[speech] start refused: ${result.code}`);
    return result;
  }
  async function startInner(input: { sessionId: string; consented: boolean; signal?: AbortSignal }): Promise<SpeechProxyResult> {
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
    stream.deadline = setTimeout(() => finish(stream, 'wall_limit'), wallMs);
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
          try { socket.send(JSON.stringify({ message: 'StartRecognition', audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16000 }, transcription_config: { language: 'en', enable_partials: true, operating_point: 'enhanced', max_delay: 0.7, diarization: 'speaker', speaker_diarization_config: { max_speakers: 4 }, ...(VOCAB.length ? { additional_vocab: VOCAB } : {}) } })); }
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
              const text = value.metadata?.transcript;
              if (typeof text !== 'string' || text.length > 50000 || text.includes('\0') || stream.token && text.includes(stream.token)) { finish(stream, 'invalid_provider_response'); return; }
              const isFinal = value.message === 'AddTranscript', key = JSON.stringify([value.metadata?.start_time, value.metadata?.end_time, text]);
              if (isFinal && stream.finals.has(key)) return;
              if (!stream.pendingSegment) stream.pendingSegment = `${stream.sessionId}:speechmatics:${stream.id}:${++stream.segmentIndex}`;
              const base = stream.pendingSegment;
              if (isFinal) { stream.finals.add(key); stream.pendingSegment = ''; if (stream.finals.size > 10000) { finish(stream, 'transcript_limit'); return; } }
              // Finals are split into speaker turns (S1, S2, ...) so the server knows who said what; partials stay whole.
              const turns = isFinal ? speakerTurns(value.results, text) : [{ text: text.trim() }];
              turns.forEach((turn, i) => {
                if (!turn.text) return;
                const segment: TranscriptSegment = { sessionId: stream.sessionId, segmentId: turns.length > 1 ? `${base}:${i}` : base, text: turn.text, isFinal, ...(turn.speaker ? { speaker: turn.speaker } : {}) };
                if (segment.isFinal) dependencies?.onSegment?.(segment);
                emit(stream, { type: 'segment', segment });
              });
            } else if (value.message === 'EndOfUtterance' && value.forced === true) stream.utteranceWait?.();
            else if (value.message === 'Error') { console.warn('[speech] provider error', event.data); finish(stream, 'provider_error'); }
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
    if (!(input.audio instanceof Uint8Array) || !bytes || bytes > 65536 || bytes % 2) { finish(stream, 'invalid_audio'); return fail('invalid_audio'); }
    if (session.bytes + bytes > sessionCap || globalBytes + bytes > globalCap) { finish(stream, 'audio_limit'); return fail('audio_limit'); }
    if (!stream.socket || stream.socket.readyState !== 1 || stream.socket.bufferedAmount > 262144 || stream.outstanding.reduce((sum, count) => sum + count, 0) + bytes > 320000 || stream.sent - stream.acknowledged >= 500) { finish(stream, 'audio_backpressure'); return fail('audio_backpressure'); }
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

