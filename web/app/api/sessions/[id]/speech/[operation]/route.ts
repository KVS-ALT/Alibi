import { authorizeSpeechStart, LiveHttpError, requireOwnedSession, routeError, setSpeechState } from '@/lib/live-sessions';
import { getSpeechProxy } from '@/lib/speech/runtime';
import type { SpeechProxyEvent, SpeechProxyIdentity, SpeechProxyResult } from '@/lib/speech/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; operation: string }> };
const headers = { 'Cache-Control': 'no-store' };

async function readBytes(request: Request, maximum: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > maximum) throw new LiveHttpError(413, 'TOO_LARGE', 'Request exceeds the capture allowance.');
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new LiveHttpError(413, 'TOO_LARGE', 'Request exceeds the capture allowance.'); }
    parts.push(value);
  }
  const output = new Uint8Array(size); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}
async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new LiveHttpError(415, 'JSON_REQUIRED', 'Use a JSON capture control request.');
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(await readBytes(request, 2048)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch (error) { if (error instanceof LiveHttpError) throw error; throw new LiveHttpError(400, 'INVALID_REQUEST', 'Invalid capture control request.'); }
}
function identity(id: string, streamId: unknown): SpeechProxyIdentity {
  if (typeof streamId !== 'string' || !/^[a-z0-9_-]{1,160}$/i.test(streamId)) throw new LiveHttpError(400, 'INVALID_STREAM', 'Provide the current capture stream.');
  return { sessionId: id, streamId };
}
function result(value: SpeechProxyResult) {
  return Response.json(value, { status: value.ok ? 200 : value.code.includes('limit') || value.code.includes('capacity') ? 429 : 409, headers });
}

export async function POST(request: Request, context: Context) {
  try {
    const { id, operation } = await context.params;
    const session = await requireOwnedSession(request, id);
    if (!['start', 'pcm', 'flush', 'mute', 'end', 'resume'].includes(operation)) throw new LiveHttpError(404, 'NOT_FOUND', 'Capture operation not found.');
    const proxy = getSpeechProxy();
    if (!proxy.isConfigured()) throw new LiveHttpError(503, 'LIVE_DISABLED', 'This protected live capture session is not enabled.');
    if (operation === 'start') {
      const body = await readJson(request);
      if (body.consented !== true || Object.keys(body).some(key => key !== 'consented')) throw new LiveHttpError(400, 'CONSENT_REQUIRED', 'Start requires explicit microphone and transcription consent.');
      authorizeSpeechStart(request, session);
      const started = await proxy.start({ sessionId: id, consented: true, signal: request.signal });
      setSpeechState(id, started.ok ? 'listening' : 'idle'); return result(started);
    }
    if (operation === 'pcm') {
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/octet-stream') throw new LiveHttpError(415, 'PCM_REQUIRED', 'Send raw PCM16 mono audio at 16 kHz.');
      const stream = identity(id, request.headers.get('x-speech-stream-id'));
      const accepted = proxy.writePcm({ ...stream, audio: await readBytes(request, 65536) });
      if (!accepted.ok) setSpeechState(id, 'idle'); return result(accepted);
    }
    const body = await readJson(request);
    if (Object.keys(body).some(key => key !== 'streamId')) throw new LiveHttpError(400, 'INVALID_REQUEST', 'Invalid capture control request.');
    const stream = identity(id, body.streamId);
    if (operation === 'flush') return result(await proxy.flush(stream));
    if (operation === 'resume') throw new LiveHttpError(409, 'FRESH_START_REQUIRED', 'Use a new explicitly approved Start after capture has stopped.');
    const ended = proxy.endStream(stream); if (ended.ok) setSpeechState(id, 'idle'); return result(ended);
  } catch (error) { return routeError(error); }
}

export async function GET(request: Request, context: Context) {
  try {
    const { id, operation } = await context.params; await requireOwnedSession(request, id);
    if (operation !== 'events') throw new LiveHttpError(404, 'NOT_FOUND', 'Capture operation not found.');
    const proxy = getSpeechProxy(), stream = identity(id, new URL(request.url).searchParams.get('streamId'));
    let unsubscribe: (() => void) | null = null, closed = false, heartbeat: ReturnType<typeof setInterval> | undefined;
    const encoder = new TextEncoder(); let output: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stop = () => {
      if (closed) return; closed = true; if (heartbeat) clearInterval(heartbeat);
      request.signal.removeEventListener('abort', stop); unsubscribe?.(); setSpeechState(id, 'idle');
      try { output?.close(); } catch {}
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        output = controller;
        unsubscribe = proxy.subscribe(stream, (event: SpeechProxyEvent) => {
          if (closed) return false;
          try {
            controller.enqueue(encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`));
            if (event.type === 'state' && event.state === 'ended') { queueMicrotask(stop); return true; }
            return (controller.desiredSize ?? 0) >= 0;
          } catch { return false; }
        });
        if (!unsubscribe) { controller.close(); return; }
        request.signal.addEventListener('abort', stop, { once: true });
        heartbeat = setInterval(() => { if (!closed) { try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { stop(); } } }, 12000);
      }, cancel: stop,
    }, { highWaterMark: 65536, size: value => value.byteLength });
    if (!unsubscribe) throw new LiveHttpError(404, 'NOT_FOUND', 'Capture stream not found.');
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
  } catch (error) { return routeError(error); }
}
