"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptSegment } from './types';
import type { CaptureSnapshot } from './types';
import { openSpeechmaticsPcmSource, type PcmSource } from './pcm';

export interface ProxyIdentity { sessionId: string; streamId: string }
export type ProxyEvent = { id: string; type: 'segment'; segment: TranscriptSegment } | { id: string; type: 'state'; state: 'active' | 'ended'; code?: string };
export interface SpeechmaticsProxyTransport {
  start(sessionId: string, signal: AbortSignal): Promise<{ streamId: string }>;
  subscribe(identity: ProxyIdentity, onEvent: (event: ProxyEvent) => void, onError: () => void, signal: AbortSignal): Promise<{ close(): void }>;
  writePcm(identity: ProxyIdentity, bytes: Uint8Array, signal: AbortSignal): Promise<void>;
  flush(identity: ProxyIdentity, signal: AbortSignal): Promise<void>;
  end(identity: ProxyIdentity): Promise<void>;
}
export interface ProxyCaptureOptions { sessionId: string; lifecycleKey?: number; onSegment?(segment: TranscriptSegment): void; transport?: SpeechmaticsProxyTransport }
export interface ProxyCaptureDependencies { supported?: boolean; openAudio?: (send: (pcm: Uint8Array) => void, signal: AbortSignal) => Promise<PcmSource> }
const safeError = 'Speech recognition is unavailable. Try starting again.';
function bounded<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error(safeError)); };
    const timer = setTimeout(abort, timeoutMs);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    operation.then(value => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(value); }, error => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error); });
  });
}

/** Browser traffic stays on the product origin. Provider tokens and URLs are never returned here. */
export function createHttpSpeechmaticsProxyTransport(fetcher: typeof fetch = fetch, createEvents: (url: string) => EventSource = url => new EventSource(url, { withCredentials: true })): SpeechmaticsProxyTransport {
  const base = (id: string) => `/api/sessions/${encodeURIComponent(id)}/speech`;
  async function post(url: string, body: BodyInit, signal: AbortSignal, headers: HeadersInit = { 'Content-Type': 'application/json' }) {
    const response = await bounded(fetcher(url, { method: 'POST', credentials: 'same-origin', redirect: 'error', signal, headers, body }), signal, 20_000);
    if (!response.ok) throw new Error(safeError);
    return bounded(response.json(), signal, 20_000) as Promise<{ ok?: boolean; streamId?: unknown }>;
  }
  return {
    async start(sessionId, signal) {

      const result = await post(`${base(sessionId)}/start`, JSON.stringify({ consented: true }), signal);
      if (result.ok !== true || typeof result.streamId !== 'string' || !/^[a-z0-9_-]{1,160}$/i.test(result.streamId)) throw new Error(safeError);
      return { streamId: result.streamId };
    },
    subscribe(identity, onEvent, onError, signal) {
      return new Promise((resolve, reject) => {
        const events = createEvents(`${base(identity.sessionId)}/events?streamId=${encodeURIComponent(identity.streamId)}`);
        let opened = false, closed = false;
        const seen = new Set<string>();
        const close = () => { if (closed) return; closed = true; clearTimeout(timer); signal.removeEventListener('abort', abort); events.onopen = events.onmessage = events.onerror = null; events.close(); };
        const broken = () => { const wasOpen = opened; close(); if (wasOpen) onError(); else reject(new Error(safeError)); };
        const abort = () => { close(); if (!opened) reject(new Error(safeError)); };
        const timer = setTimeout(broken, 5000);
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true });
        events.onopen = () => { if (closed) return; opened = true; clearTimeout(timer); resolve({ close }); };
        events.onerror = broken; // Close immediately: EventSource must not reconnect a billable stream.
        events.onmessage = event => {
          if (closed) return;
          try {
            if (typeof event.data !== 'string' || event.data.length > 65536) throw new Error(safeError);
            const value = JSON.parse(event.data) as ProxyEvent;
            if (!value || typeof value.id !== 'string' || !value.id.startsWith(`${identity.streamId}:`) || value.id.length > 200) throw new Error(safeError);
            if (seen.has(value.id)) return;
            seen.add(value.id); if (seen.size > 256) seen.delete(seen.values().next().value!);
            if (value.type === 'segment') {
              const segment = value.segment;
              if (!segment || segment.sessionId !== identity.sessionId || typeof segment.segmentId !== 'string' || segment.segmentId.length > 300 || typeof segment.text !== 'string' || segment.text.length > 50000 || segment.text.includes('\0') || typeof segment.isFinal !== 'boolean') throw new Error(safeError);
              onEvent({ id: value.id, type: 'segment', segment: { sessionId: segment.sessionId, segmentId: segment.segmentId, text: segment.text, isFinal: segment.isFinal } });
            } else if (value.type === 'state' && ['active', 'ended'].includes(value.state)) onEvent({ id: value.id, type: 'state', state: value.state, code: typeof value.code === 'string' && /^[a-z_]{1,64}$/.test(value.code) ? value.code : undefined });
            else throw new Error(safeError);
          } catch { broken(); }
        };
      });
    },
    async writePcm(identity, bytes, signal) { const result = await post(`${base(identity.sessionId)}/pcm`, new Uint8Array(bytes), signal, { 'Content-Type': 'application/octet-stream', 'X-Speech-Stream-Id': identity.streamId }); if (result.ok !== true) throw new Error(safeError); },
    async flush(identity, signal) { const result = await post(`${base(identity.sessionId)}/flush`, JSON.stringify({ streamId: identity.streamId }), signal); if (result.ok !== true) throw new Error(safeError); },
    async end(identity) { await post(`${base(identity.sessionId)}/end`, JSON.stringify({ streamId: identity.streamId }), AbortSignal.timeout(3000)); },
  };
}

export function createSpeechmaticsProxyCapture(options: ProxyCaptureOptions, dependencies: ProxyCaptureDependencies = {}) {
  const supported = dependencies.supported ?? (typeof EventSource !== 'undefined' && typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined' && !!globalThis.navigator?.mediaDevices?.getUserMedia);
  const transport = options.transport ?? createHttpSpeechmaticsProxyTransport();
  const openAudio = dependencies.openAudio ?? openSpeechmaticsPcmSource;
  const listeners = new Set<() => void>();
  let snapshot: CaptureSnapshot & { errorCode?: string } = { status: 'idle', supported, starting: false, interimText: '' };
  let consented = false, live = false, disposed = false, version = 0;
  let abort = new AbortController(), identity: ProxyIdentity | undefined, source: PcmSource | undefined, events: { close(): void } | undefined;
  let queue = { bytes: 0, promise: Promise.resolve() };
  const update = (patch: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  const valid = (epoch: number) => live && !disposed && version === epoch;
  function stopLocal() {
    live = false; version++; abort.abort(); source?.stop(); source = undefined; events?.close(); events = undefined;
    const previous = identity; identity = undefined; queue = { bytes: 0, promise: Promise.resolve() };
    if (previous) void transport.end(previous).catch(() => {});
  }
  function mute() { if (!consented || snapshot.status === 'ended' || !live && !snapshot.starting) return; stopLocal(); update({ status: 'muted', starting: false, interimText: '' }); }
  function fail(code: string) { mute(); update({ status: 'muted', starting: false, interimText: '', error: safeError, errorCode: code }); }
  function enqueue(bytes: Uint8Array, epoch: number) {
    if (!valid(epoch) || !identity) return;
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length % 2 || bytes.length > 16384 || queue.bytes + bytes.length > 32000) { fail('audio_backpressure'); return; }
    const pending = queue, destination = identity, audio = new Uint8Array(bytes), signal = abort.signal;
    pending.bytes += audio.length;
    pending.promise = pending.promise.then(async () => {
      if (valid(epoch)) await bounded(transport.writePcm(destination, audio, signal), signal, 10_000);
    }).catch(() => { if (valid(epoch)) fail('upload_failed'); }).finally(() => { pending.bytes -= audio.length; });
  }
  async function activate(resuming: boolean) {
    if (disposed || snapshot.status === 'ended' || live || snapshot.starting || resuming && !consented || !resuming && consented) return;
    consented = true;
    if (!supported) { update({ status: 'muted', error: safeError, errorCode: 'unsupported' }); return; }
    live = true; const epoch = ++version; abort = new AbortController(); update({ starting: true, error: undefined, errorCode: undefined });
    try {
      const ready = await bounded(transport.start(options.sessionId, abort.signal), abort.signal, 20_000);
      if (!valid(epoch)) return;
      identity = { sessionId: options.sessionId, streamId: ready.streamId };
      const subscription = await bounded(transport.subscribe(identity, event => {
        if (!valid(epoch)) return;
        if (event.type === 'state') { if (event.state === 'ended') fail(event.code ?? 'stream_ended'); }
        else { options.onSegment?.(event.segment); if (valid(epoch)) update({ interimText: event.segment.isFinal ? '' : event.segment.text }); }
      }, () => { if (valid(epoch)) fail('connection_closed'); }, abort.signal), abort.signal, 5000);
      if (!valid(epoch)) { subscription.close(); return; } events = subscription;
      const acquired = await openAudio(bytes => enqueue(bytes, epoch), abort.signal);
      if (!valid(epoch)) { acquired.stop(); return; } source = acquired; update({ status: 'listening', starting: false });
    } catch { if (valid(epoch)) fail('capture_unavailable'); }
  }
  async function flush() {
    if (!live || !identity || !source) return;
    const epoch = version;
    try {
      await bounded(Promise.resolve(source.flush()), abort.signal, 1000);
      await bounded(queue.promise, abort.signal, 10_000);
      if (valid(epoch) && identity) await bounded(transport.flush(identity, abort.signal), abort.signal, 11_000);
    } catch { if (valid(epoch)) fail('flush_failed'); throw new Error(safeError); }
  }
  function end() { if (snapshot.status === 'ended') return; stopLocal(); update({ status: 'ended', starting: false, interimText: '' }); }
  function dispose() { if (disposed) return; end(); disposed = true; listeners.clear(); }
  return { start: () => activate(false), resume: () => activate(true), mute, end, dispose, flush, getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}

export function useSpeechmaticsProxyCapture(options: ProxyCaptureOptions) {
  const [restartVersion, setRestartVersion] = useState(0);
  const restarted = useRef<(() => void) | null>(null);
  const callbacks = useRef(options), controller = useRef<ReturnType<typeof createSpeechmaticsProxyCapture> | null>(null);
  const [snapshot, setSnapshot] = useState<CaptureSnapshot & { errorCode?: string }>({ status: 'idle', supported: true, starting: false, interimText: '' });
  useEffect(() => { callbacks.current = options; });
  useEffect(() => {
    const capture = createSpeechmaticsProxyCapture({ sessionId: options.sessionId, transport: options.transport, onSegment: segment => callbacks.current.onSegment?.(segment) });
    controller.current = capture; const unsubscribe = capture.subscribe(() => setSnapshot(capture.getSnapshot())); setSnapshot(capture.getSnapshot());
    restarted.current?.(); restarted.current = null;
    return () => { unsubscribe(); capture.dispose(); if (controller.current === capture) controller.current = null; restarted.current?.(); restarted.current = null; };
  }, [options.sessionId, options.lifecycleKey, options.transport, restartVersion]);
  const actions = useMemo(() => ({ start: async () => {
    if (controller.current?.getSnapshot().status === 'ended') await new Promise<void>(resolve => { restarted.current = resolve; setRestartVersion(value => value + 1); });
    if (controller.current?.getSnapshot().status === 'muted') await controller.current.resume(); else await controller.current?.start();
  }, resume: async () => { await controller.current?.resume(); }, mute: () => controller.current?.mute(), end: () => controller.current?.end(), flush: async () => { await controller.current?.flush(); } }), []);
  return { ...snapshot, ...actions };
}

/** Main capture UI entry point. Final transcripts are ingested by the owned server proxy. */
export function useCurrentSpeechCapture(options: ProxyCaptureOptions) {
  return useSpeechmaticsProxyCapture(options);
}

