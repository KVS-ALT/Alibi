import type { Action, Brief, GenerationResult, PreviewState, TranscriptSegment, UiSpec } from '../contracts';
import { z } from 'zod';
import { validateUiSpec } from '../generation';
export interface BuilderSession { id: string; transcript: TranscriptSegment[]; briefVersion: number; pending: { requestId: string; briefVersion: number } | null; spec: UiSpec | null; preview: PreviewState | null; error: string | null; }
export function createSession(): BuilderSession { return { id: crypto.randomUUID(), transcript: [], briefVersion: 0, pending: null, spec: null, preview: null, error: null }; }
export function addSegment(session: BuilderSession, segment: TranscriptSegment): BuilderSession { if (segment.sessionId !== session.id) return session; const transcript = session.transcript.filter(item => item.segmentId !== segment.segmentId); return { ...session, transcript: [...transcript, segment] }; }
export function transcriptText(session: BuilderSession): string { return session.transcript.filter(item => item.isFinal).map(item => item.text).join('\n'); }
export function beginBuild(session: BuilderSession): BuilderSession { const briefVersion = session.briefVersion + 1; return { ...session, briefVersion, pending: { requestId: crypto.randomUUID(), briefVersion }, error: null }; }
const primitive = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const previewSchema = z.object({ sessionId: z.string(), activeScreenId: z.string(), values: z.record(z.string(), primitive), forms: z.record(z.string(), z.record(z.string(), z.string())), filters: z.record(z.string(), z.object({ field: z.string(), stateKey: z.string() })), submitted: z.record(z.string(), z.string()) });
export function restoreSavedSession(value: unknown): BuilderSession {
 const empty = createSession();
 if (!value || typeof value !== 'object') return empty;
 const saved = value as Record<string, unknown>;
 const checked = validateUiSpec(saved.spec);
 if (!checked.success || typeof saved.id !== 'string' || checked.data.sessionId !== saved.id || !Number.isSafeInteger(saved.briefVersion) || (saved.briefVersion as number) < checked.data.basedOnBriefVersion) return empty;
 const preview = previewSchema.safeParse(saved.preview);
 return { ...empty, id: saved.id, briefVersion: saved.briefVersion as number, spec: checked.data, preview: reconcilePreviewState(preview.success ? preview.data : null, checked.data, checked.data) };
}
export function reconcilePreviewState(previous: PreviewState | null, spec: UiSpec, previousSpec?: UiSpec | null): PreviewState {
 const sameSession = previous?.sessionId === spec.sessionId;
 const screens = new Set(spec.screens.map(screen => screen.id));
 const oldComponents = new Map(previousSpec?.screens.flatMap(screen => screen.components).map(component => [component.id, component]) ?? []);
 const forms: PreviewState['forms'] = {};
 const submitted: PreviewState['submitted'] = {};
 for (const component of spec.screens.flatMap(screen => screen.components)) if (component.type === 'form') {
  const old = oldComponents.get(component.id);
  forms[component.id] = Object.fromEntries(component.properties.fields.map(field => {
   const compatible = old?.type === 'form' && old.properties.fields.some(oldField => oldField.id === field.id && oldField.type === field.type);
   const value = sameSession && compatible ? previous!.forms[component.id]?.[field.id] ?? '' : '';
   return [field.id, field.type === 'select' && !field.options?.includes(value) ? '' : value];
  }));
  if (sameSession && old?.type === 'form' && JSON.stringify(old.properties.fields) === JSON.stringify(component.properties.fields) && previous!.submitted[component.id]) submitted[component.id] = previous!.submitted[component.id];
 }
 const actions = spec.screens.flatMap(screen => screen.components.flatMap(component => component.actions));
 const stateKeys = new Set(actions.flatMap(action => action.type === 'setState' ? [action.key] : action.type === 'filter' ? [action.stateKey] : action.type === 'submitDemoForm' ? [action.resultStateKey] : []));
 const invalidReceiptKeys = new Set(actions.flatMap(action => action.type === 'submitDemoForm' && !submitted[action.formId] ? [action.resultStateKey] : []));
 const selectOptions = new Map(spec.screens.flatMap(screen => screen.components.flatMap(component => component.type === 'form' ? component.properties.fields.filter(field => field.type === 'select').map(field => [field.id, field.options ?? []] as const) : [])));
 const values = sameSession ? Object.fromEntries(Object.entries(previous!.values).filter(([key, value]) => stateKeys.has(key) && !invalidReceiptKeys.has(key) && (!selectOptions.has(key) || typeof value === 'string' && selectOptions.get(key)!.includes(value)))) : {};
 const filters = sameSession ? Object.fromEntries(Object.entries(previous!.filters).filter(([key,value]) => Object.hasOwn(spec.demoData, key) && Object.hasOwn(values, value.stateKey) && actions.some(action => action.type === 'filter' && action.dataKey === key && action.field === value.field && action.stateKey === value.stateKey))) : {};
 return { sessionId: spec.sessionId, activeScreenId: sameSession && screens.has(previous!.activeScreenId) ? previous!.activeScreenId : spec.screens[0].id, values, forms, filters, submitted };
}
export function acceptGeneration(session: BuilderSession, result: GenerationResult): BuilderSession {
 if (result.sessionId !== session.id || result.requestId !== session.pending?.requestId || result.briefVersion !== session.pending.briefVersion) return session;
 if ('errorCode' in result) return { ...session, pending: null, error: result.safeMessage };
 const checked = validateUiSpec(result.uiSpec);
 if (!checked.success) return { ...session, pending: null, error: 'The generated configuration was invalid. Your previous preview is safe.' };
 if (checked.data.sessionId !== session.id || checked.data.basedOnBriefVersion !== session.briefVersion) return { ...session, pending: null, error: 'The generated prototype did not match this session. Your previous preview is safe.' };
 return { ...session, pending: null, spec: checked.data, preview: reconcilePreviewState(session.preview, checked.data, session.spec), error: null };
}
export function applyAction(state: PreviewState, action: Action, spec: UiSpec, componentId?: string): PreviewState {
 if (action.type === 'navigate') return spec.screens.some(screen => screen.id === action.screenId) ? { ...state, activeScreenId: action.screenId } : state;
 if (action.type === 'setState') return { ...state, values: { ...state.values, [action.key]: action.value } };
 if (action.type === 'filter') return { ...state, values: { ...state.values, ...(componentId && Object.hasOwn(state.forms[componentId] ?? {}, action.stateKey) ? { [action.stateKey]: state.forms[componentId][action.stateKey] } : {}) }, filters: { ...state.filters, [action.dataKey]: { field: action.field, stateKey: action.stateKey } } };
 const form = spec.screens.flatMap(screen => screen.components).find(component => component.id === action.formId && component.type === 'form');
 if (!form || form.type !== 'form' || form.properties.fields.some(field => {
  const value = state.forms[form.id]?.[field.id]?.trim() ?? '';
  if (!value) return field.required;
  if (field.type === 'email') return !/^[^\s@]+@[^\s@]+$/.test(value);
  if (field.type === 'number') return !Number.isInteger(Number(value)) || Number(value) < 1;
  if (field.type === 'select') return !field.options?.includes(value);
  if (field.type === 'date') { const date = new Date(value); return !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value; }
  return false;
 })) return state;
 return { ...state, submitted: { ...state.submitted, [action.formId]: 'Saved in this demo only. No real request was sent.' }, values: { ...state.values, [action.resultStateKey]: 'submitted' } };
}
export function briefSummary(brief: Brief): string { return brief.requirements.join(' · '); }
