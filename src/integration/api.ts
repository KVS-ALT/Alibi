import type { GenerationRequest, GenerationResult } from '../contracts';

export type ExecutionMode = 'browser-demo' | 'local-demo' | 'render-local';
export async function detectExecutionMode(): Promise<ExecutionMode> {
 try {
  const response = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
  const health = await response.json();
  return response.ok && health.status === 'ok' && (health.runner === 'local-demo' || health.runner === 'render-local') ? health.runner : 'browser-demo';
 } catch { return 'browser-demo'; }
}
async function post(path: string, body: unknown, signal?: AbortSignal) {
 const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
 const data = await response.json();
 if (!response.ok) throw new Error(data.error?.message ?? 'The server could not complete this request.');
 return data;
}
export async function generateOnServer(request: GenerationRequest, options: { templateId?: string; signal: AbortSignal; onProgress: (message: string) => void }): Promise<GenerationResult> {
 await post('/api/sessions', { id: request.sessionId }, options.signal);
 const { jobId } = await post(`/api/sessions/${request.sessionId}/jobs`, { ...request, templateId: options.templateId }, options.signal);
 if (typeof jobId !== 'string') throw new Error('The server did not return a build identifier.');
 return new Promise((resolve, reject) => {
  const stream = new EventSource(`/api/sessions/${request.sessionId}/jobs/${encodeURIComponent(jobId)}/events`);
  const cleanup = () => { stream.close(); options.signal.removeEventListener('abort', abort); };
  const fail = (error: Error) => { cleanup(); reject(error); };
  const abort = () => fail(new DOMException('Build canceled', 'AbortError'));
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) { abort(); return; }
  stream.onmessage = event => {
   try {
    const data = JSON.parse(event.data);
    if (data.type === 'stage' && typeof data.progress?.message === 'string') {
     options.onProgress(`${data.progress.status === 'completed' ? 'Completed' : 'Running'}: ${data.progress.message.slice(0, 500)}`);
    } else if (data.type === 'result') {
     const result = data.result;
     if (!result || result.sessionId !== request.sessionId || result.requestId !== request.requestId || result.briefVersion !== request.briefVersion || (!('uiSpec' in result) && !('errorCode' in result))) throw new Error('The server returned a result for another build.');
     cleanup(); resolve(result);
    } else if (data.type === 'error') fail(new Error(typeof data.message === 'string' ? data.message : 'Server build failed.'));
   } catch (error) { fail(error instanceof Error ? error : new Error('Invalid build event.')); }
  };
  stream.onerror = () => fail(new Error('The build connection was interrupted. Retry your brief.'));
 });
}
export async function downloadServerExport(sessionId: string, format: 'json' | 'source'): Promise<void> {
 const response = await fetch(`/api/sessions/${sessionId}/export?format=${format}`);
 if (!response.ok) throw new Error('This server session expired. Rebuild the prototype or download from the browser preview.');
 const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
 link.href = url; link.download = format === 'json' ? 'prototype-config.json' : 'prototype-source.zip';
 link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function endServerSession(sessionId: string): void {
 void fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});
}
