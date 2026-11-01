export type CaptureStatus = 'idle' | 'listening' | 'muted' | 'ended';
export type BuildStatus = 'idle' | 'building' | 'ready' | 'error';
export interface TranscriptSegment { sessionId: string; segmentId: string; text: string; isFinal: boolean }
export interface Brief { sessionId: string; version: number; purpose: string; audience: string; requirements: string[]; style: string[]; unknowns: string[] }
export type Primitive = string | number | boolean | null;
export type Action = { type: 'setState'; key: string; value: Primitive } | { type: 'navigate'; screenId: string } | { type: 'submitDemoForm'; formId: string; resultStateKey: string } | { type: 'filter'; dataKey: string; field: string; stateKey: string };
export interface FormField { id: string; label: string; type: 'text' | 'email' | 'number' | 'date' | 'select'; required: boolean; options?: string[] }
interface Base { id: string; actions: Action[] }
export type UiComponent = Base & ({ type: 'text'; properties: { text: string } } | { type: 'card'; properties: { title: string; body: string } } | { type: 'form'; properties: { fields: FormField[]; submitLabel?: string } } | { type: 'table'; properties: { columns: string[]; dataKey: string } } | { type: 'navigation'; properties: { items: { label: string; screenId: string }[] } } | { type: 'button'; properties: { label: string } });
export interface UiScreen { id: string; title: string; components: UiComponent[] }
export interface UiSpec { sessionId: string; version: number; basedOnBriefVersion: number; templateId: string; templateVersion: number; screens: UiScreen[]; demoData: Record<string, Record<string, Primitive>[]>; demoDataLabel: string }
export interface GenerationRequest { sessionId: string; requestId: string; briefVersion: number; brief: Brief; previousUiSpec?: UiSpec }
export type GenerationResult = { sessionId: string; requestId: string; briefVersion: number; uiSpec: UiSpec } | { sessionId: string; requestId: string; briefVersion: number; errorCode: string; safeMessage: string; retryable: boolean };
export interface TemplateDefinition { id: string; name: string; category: string; description: string; accent: string; icon?: string; }
export interface PreviewState { sessionId: string; activeScreenId: string; values: Record<string, Primitive>; forms: Record<string, Record<string, string>>; filters: Record<string, { field: string; stateKey: string }>; submitted: Record<string, string> }
