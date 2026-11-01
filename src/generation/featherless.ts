/** Server-only Featherless chat adapter. Dedicated key; no OpenAI credential alias.
 * https://featherless.ai/docs/completions
 * https://featherless.ai/docs/tool-calling (JSON-object response mode)
 */
import { z } from 'zod';
import type { Brief, GenerationRequest, GenerationResult, UiSpec } from '../contracts';
import { generatePrototype } from './index';
import {
  prototypeDraftSchema, composePrototypeDraft, prototypeCatalogContext,
  providerRequestSchema, PROTOTYPE_INSTRUCTIONS, readProviderResponse, ProviderFailure,
} from './provider';

export const FEATHERLESS_ENDPOINT = 'https://api.featherless.ai/v1/chat/completions';
export const FEATHERLESS_MODELS = ['Qwen/Qwen2.5-7B-Instruct'] as const;
export interface FeatherlessProviderOptions {
  enabled?: boolean;
  apiKey?: string;
  model?: string;
  transport?: typeof fetch;
  timeoutMs?: number;
  maxOutputTokens?: number;
}
type Failure = Extract<GenerationResult, { errorCode: string }>;
export type FeatherlessProviderResult = Failure | (Extract<GenerationResult, { uiSpec: UiSpec }> & { brief: Brief; provider: 'featherless' });
const MAX_REQUEST_BYTES = 28000; // Hosted model is 32k: leave room for 3000 output tokens and framing.
function parseCompletion(body: string): unknown {
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new ProviderFailure('INVALID_PROVIDER_RESPONSE', 'Featherless returned invalid JSON.'); }
  const parsed = z.object({ choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({ role: z.literal('assistant'), content: z.string().nullable(), refusal: z.string().nullable().optional(), tool_calls: z.unknown().optional() }).passthrough(),
  }).passthrough()).length(1) }).passthrough().safeParse(value);
  if (!parsed.success) throw new ProviderFailure('INVALID_PROVIDER_RESPONSE', 'Featherless returned an unsupported response.');
  const choice = parsed.data.choices[0];
  if (choice.message.refusal) throw new ProviderFailure('PROVIDER_REFUSED', 'Featherless declined this request.');
  if (choice.finish_reason === 'length') throw new ProviderFailure('PROVIDER_INCOMPLETE', 'Featherless reached the output limit. No automatic retry was sent.', true);
  const tools = choice.message.tool_calls;
  const hasToolCalls = tools != null && (!Array.isArray(tools) || tools.length > 0);
  if (choice.finish_reason !== 'stop' || !choice.message.content || hasToolCalls) throw new ProviderFailure('INVALID_PROVIDER_RESPONSE', 'Featherless did not return a complete structured plan.');
  try { return JSON.parse(choice.message.content); } catch { throw new ProviderFailure('INVALID_PROVIDER_RESPONSE', 'Featherless did not return a valid JSON plan.'); }
}
function seedPlan(spec: UiSpec, brief: Brief) {
  const text = (id: string) => { const c = spec.screens[0].components.find(c => c.id === id); return c?.type === 'text' ? c.properties.text : ''; };
  const table = spec.screens[0].components.find(c => c.type === 'table');
  const form = spec.screens.flatMap(s => s.components).find(c => c.id === 'contact-form');
  if (table?.type !== 'table' || form?.type !== 'form') throw new ProviderFailure('INVALID_PROVIDER_REQUEST', 'The reviewed template is unavailable.');
  return {
    templateId: spec.templateId,
    brief: { purpose: brief.purpose, audience: brief.audience, requirements: brief.requirements, style: brief.style, unknowns: brief.unknowns },
    content: { brand: text('hero-brand'), headline: text('hero-title'), description: text('hero-description'), cards: spec.screens.flatMap(s => s.components).filter(c => c.type === 'card').map(c => ({ id: c.id, ...c.properties })), rows: spec.demoData[table.properties.dataKey].map(row => ({ cells: table.properties.columns.map(column => String(row[column])) })) },
    structure: { sections: ['overview', 'collection', 'filter', 'primary-action', 'form'], extraSections: [] },
    form: { fieldOverrides: [], extraFields: [], submitLabel: form.properties.submitLabel ?? 'Save demo request' },
    style: { palette: 'template', layout: 'template', typography: 'template', density: 'template' },
  };
}

export function createFeatherlessProvider(config: FeatherlessProviderOptions = {}) {
  const timeoutMs = config.timeoutMs ?? 20000, maxOutputTokens = config.maxOutputTokens ?? 3000;
  const validConfig = Boolean(config.apiKey && /^[^\s\u0000-\u001f]{8,512}$/.test(config.apiKey)) &&
    FEATHERLESS_MODELS.includes(config.model as typeof FEATHERLESS_MODELS[number]) &&
    Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 30000 &&
    Number.isInteger(maxOutputTokens) && maxOutputTokens >= 128 && maxOutputTokens <= 3000;
  return { async generate(request: GenerationRequest, options: { templateId?: string; signal?: AbortSignal } = {}): Promise<FeatherlessProviderResult> {
    const envelope = { sessionId: request.sessionId, requestId: request.requestId, briefVersion: request.briefVersion };
    const failure = (error: ProviderFailure): Failure => ({ ...envelope, errorCode: error.code, safeMessage: error.message, retryable: error.retryable });
    if (options.signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');
    if (config.enabled !== true) return failure(new ProviderFailure('PROVIDER_DISABLED', 'Featherless generation is disabled.'));
    if (typeof window !== 'undefined') return failure(new ProviderFailure('PROVIDER_SERVER_ONLY', 'Featherless generation is only available through the server.'));
    if (!validConfig) return failure(new ProviderFailure('PROVIDER_CONFIGURATION', 'Featherless needs its dedicated server key and an approved model.'));
    let baseline: UiSpec;
    try {
      const serialized = JSON.stringify(request);
      if (serialized.includes(config.apiKey!) || new TextEncoder().encode(serialized).byteLength > 64000 || !providerRequestSchema.safeParse(request).success) throw new Error();
      const initial = await generatePrototype(request, { templateId: options.templateId, signal: options.signal });
      if (options.signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');
      if (!('uiSpec' in initial)) throw new Error();
      baseline = initial.uiSpec;
    } catch {
      if (options.signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');
      return failure(new ProviderFailure('INVALID_PROVIDER_REQUEST', 'The Featherless brief or prototype history is invalid or too large.'));
    }
    const shape = prototypeDraftSchema(options.templateId), schema = z.toJSONSchema(shape);
    delete schema.$schema;
    const catalog = prototypeCatalogContext([request.brief.purpose, ...request.brief.requirements].join(' '), options.templateId).map(template => ({
      id: template.id, category: template.category, description: template.description, columns: template.columns,
      fields: template.fields.map(field => ({ id: field.id, label: field.label, type: field.type, required: field.required })),
    }));
    const payload = JSON.stringify({
      model: config.model, max_tokens: maxOutputTokens, temperature: 0.1, stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROTOTYPE_INSTRUCTIONS + ' Return one complete JSON object only, with no markdown, explanation or tool call. Every schema property is required. Adapt the valid example to the brief; the example does not lock the template choice. JSON schema: ' + JSON.stringify(schema) },
        { role: 'user', content: JSON.stringify({ brief: { purpose: request.brief.purpose, audience: request.brief.audience, requirements: request.brief.requirements, style: request.brief.style, unknowns: request.brief.unknowns }, catalog, validExample: seedPlan(baseline, request.brief) }) },
      ],
    });
    if (new TextEncoder().encode(payload).byteLength > MAX_REQUEST_BYTES) return failure(new ProviderFailure('INVALID_PROVIDER_REQUEST', 'The Featherless request exceeds the bounded model context allowance.'));
    const controller = new AbortController();
    let timedOut = false;
    const abortCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortCaller, { once: true });
    let rejectAbort: (reason: unknown) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(new DOMException('Generation aborted', 'AbortError'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const bounded = <T>(operation: Promise<T>) => Promise.race([operation, aborted]);
    try {
      const transport = config.transport ?? globalThis.fetch;
      const response = await bounded(transport(FEATHERLESS_ENDPOINT, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json', 'User-Agent': 'FormeBuilder/0.1', 'X-Title': 'Forme' },
        body: payload,
      }));
      const body = await bounded(readProviderResponse(response));
      if (response.status === 401 || response.status === 403) throw new ProviderFailure('PROVIDER_AUTHENTICATION', 'Featherless credentials or model access need attention.');
      if (response.status === 429) throw new ProviderFailure('PROVIDER_RATE_LIMIT', 'Featherless is rate limited or its allowance is exhausted. No automatic retry was sent.', true);
      if (!response.ok) throw new ProviderFailure('PROVIDER_UNAVAILABLE', 'Featherless rejected the bounded request or is unavailable. No automatic retry was sent.', response.status >= 500);
      const parsed = shape.safeParse(parseCompletion(body));
      if (!parsed.success || JSON.stringify(parsed.data).includes(config.apiKey!)) throw new ProviderFailure('INVALID_PROVIDER_RESPONSE', 'Featherless returned a plan outside the safe template schema.');
      const uiSpec = await bounded(composePrototypeDraft(request, parsed.data, controller.signal));
      uiSpec.demoDataLabel = 'Featherless-assisted concept - synthetic demo data - local interactions only';
      const safety = 'Synthetic demo data only; no backend or real submissions.';
      const brief: Brief = { ...parsed.data.brief, sessionId: request.sessionId, version: request.briefVersion, unknowns: [...parsed.data.brief.unknowns.filter(value => value !== safety).slice(0, 11), safety] };
      return { ...envelope, uiSpec, brief, provider: 'featherless' };
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');
      if (timedOut) return failure(new ProviderFailure('PROVIDER_TIMEOUT', 'Featherless timed out. Its outcome is uncertain; no automatic retry was sent.', true));
      return failure(error instanceof ProviderFailure ? error : new ProviderFailure('PROVIDER_UNAVAILABLE', 'Featherless request failed. Its outcome is uncertain; no automatic retry was sent.', true));
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      options.signal?.removeEventListener('abort', abortCaller);
    }
  } };
}
