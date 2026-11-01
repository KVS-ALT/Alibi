import 'server-only';
import { getLiveRuntime, ingestTranscript } from '@/lib/live-sessions';
import { createSpeechmaticsTokenProvider } from './token';
import { createSpeechmaticsProxy, type ProxySocket } from './proxy';

declare global { var __alibiOwnedSpeechProxy: ReturnType<typeof createSpeechmaticsProxy> | undefined; }

/** One process-owned budget and upstream connection, shared by all Next route handlers. */
export function getSpeechProxy() {
  if (!globalThis.__alibiOwnedSpeechProxy) {
    const runtime = getLiveRuntime();
    const tokenProvider = createSpeechmaticsTokenProvider({ enabled: runtime.liveEnabled, liveCallsAllowed: runtime.liveEnabled, apiKey: runtime.speechKey }, { fetcher: runtime.speechFetch });
    globalThis.__alibiOwnedSpeechProxy = createSpeechmaticsProxy({ enabled: runtime.liveEnabled, liveCallsAllowed: runtime.liveEnabled, ...runtime.limits, maxStartsPerSession: 1 }, {
      tokenProvider,
      createSocket: runtime.liveEnabled ? url => new WebSocket(url) as unknown as ProxySocket : undefined,
      onSegment: segment => ingestTranscript(segment.sessionId, { id: segment.segmentId, text: segment.text, isFinal: segment.isFinal, ...(segment.speaker ? { speaker: segment.speaker } : {}) }),
    });
  }
  return globalThis.__alibiOwnedSpeechProxy;
}
