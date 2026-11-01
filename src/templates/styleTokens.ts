import type { UiSpec } from '../contracts';

/** Trusted generated-output tokens. These never affect the builder shell. */
export const STYLE_TOKEN_OPTIONS = {
  palette: ['template', 'warm', 'cool', 'forest', 'monochrome', 'dark'],
  layout: ['template', 'split', 'stacked', 'editorial'],
  typography: ['template', 'serif', 'sans'],
  density: ['template', 'compact', 'spacious'],
} as const;
export type PresentationTokens = { [K in keyof typeof STYLE_TOKEN_OPTIONS]: typeof STYLE_TOKEN_OPTIONS[K][number] };
export const STYLE_METADATA_IDS = new Set(Object.keys(STYLE_TOKEN_OPTIONS).map(key => 'presentation-' + key));
export function validStyleMetadata(id: string, value: string): boolean {
  const key = id.replace(/^presentation-/, '') as keyof typeof STYLE_TOKEN_OPTIONS;
  return Object.hasOwn(STYLE_TOKEN_OPTIONS, key) && (STYLE_TOKEN_OPTIONS[key] as readonly string[]).includes(value);
}
export function presentationClasses(spec: UiSpec): string {
  return (spec.screens[0]?.components ?? []).flatMap(component =>
    component.type === 'text' && STYLE_METADATA_IDS.has(component.id) && validStyleMetadata(component.id, component.properties.text) && component.properties.text !== 'template'
      ? [component.id + '-' + component.properties.text] : []).join(' ');
}
