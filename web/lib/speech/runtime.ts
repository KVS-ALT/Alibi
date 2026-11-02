import 'server-only';
import { getLiveRuntime, ingestTranscript } from '@/lib/live-sessions';
import { createSpeechmaticsTokenProvider } from './token';
import { createSpeechmaticsProxy, type ProxySocket } from './proxy';

declare global { var __alibiOwnedSpeechProxy: ReturnType<typeof createSpeechmaticsProxy> | undefined; }

/** One process-owned proxy shared by all Next route handlers. Limits come from getLiveRuntime(). */
export function getSpeechProxy() {
  if (!globalThis.__alibiOwnedSpeechProxy) {
    const runtime = getLiveRuntime();
    const tokenProvider = createSpeechmaticsTokenProvider({ enabled: runtime.speechEnabled, liveCallsAllowed: runtime.speechEnabled, apiKey: runtime.speechKey }, { fetcher: runtime.speechEnabled ? fetch : undefined });
    globalThis.__alibiOwnedSpeechProxy = createSpeechmaticsProxy({ enabled: runtime.speechEnabled, liveCallsAllowed: runtime.speechEnabled, ...runtime.limits, maxStartsPerSession: 20 }, {
      tokenProvider,
      createSocket: runtime.speechEnabled ? url => new WebSocket(url) as unknown as ProxySocket : undefined,
      onSegment: segment => ingestTranscript(segment.sessionId, { id: segment.segmentId, text: segment.text, isFinal: segment.isFinal, speaker: segment.speaker }),
    });
  }
  return globalThis.__alibiOwnedSpeechProxy;
}
