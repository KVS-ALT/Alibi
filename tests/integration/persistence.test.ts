import { describe, expect, it } from 'vitest';
import type { UiSpec } from '../../src/contracts';
import { acceptGeneration, applyAction, beginBuild, createSession, reconcilePreviewState, restoreSavedSession } from '../../src/integration/session';

function spec(sessionId = 'session-a'): UiSpec {
 return { sessionId, version: 1, basedOnBriefVersion: 1, templateId: 'studio-booking', templateVersion: 1, demoData: {}, demoDataLabel: 'Synthetic demo data', screens: [{ id: 'home', title: 'Home', components: [{ id: 'contact', type: 'form', properties: { fields: [{ id: 'email', label: 'Email', type: 'email', required: true }] }, actions: [{ type: 'submitDemoForm', formId: 'contact', resultStateKey: 'receipt' }] }] }] };
}
describe('persisted and regenerated preview boundaries', () => {
 it('reconstructs a usable preview when saved state is missing or malformed', () => {
  for (const preview of [null, { sessionId: 'session-a', forms: null }, { sessionId: 'other' }]) {
   const restored = restoreSavedSession({ id: 'session-a', briefVersion: 1, spec: spec(), preview });
   expect(restored.preview?.activeScreenId).toBe('home');
   expect(restored.preview?.forms.contact.email).toBe('');
  }
 });
 it('retains compatible values after reload and excludes foreign state', () => {
  const savedSpec = spec(), preview = reconcilePreviewState(null, savedSpec);
  preview.forms.contact.email = 'person@example.test';
  const saved = { id: 'session-a', briefVersion: 1, spec: savedSpec, preview };
  expect(restoreSavedSession(saved).preview?.forms.contact.email).toBe('person@example.test');
  expect(restoreSavedSession({ ...saved, preview: { ...preview, sessionId: 'other' } }).preview?.forms.contact.email).toBe('');
  expect(restoreSavedSession({ ...saved, briefVersion: 0 }).spec).toBeNull();
 });
 it('clears submission receipts and result values when the form changes', () => {
  const previous = spec(), preview = reconcilePreviewState(null, previous);
  preview.forms.contact.email = 'person@example.test';
  preview.submitted.contact = 'Saved locally'; preview.values.receipt = 'submitted';
  expect(reconcilePreviewState(preview, previous, previous).submitted.contact).toBe('Saved locally');
  const next = structuredClone(previous), form = next.screens[0].components[0];
  if (form.type === 'form') form.properties.fields.push({ id: 'name', label: 'Name', type: 'text', required: true });
  const reconciled = reconcilePreviewState(preview, next, previous);
  expect(reconciled.forms.contact.email).toBe('person@example.test');
  expect(reconciled.submitted.contact).toBeUndefined(); expect(reconciled.values.receipt).toBeUndefined();
 });
 it('rejects invalid generated structures at the session acceptance boundary', () => {
  const pending = beginBuild(createSession());
  const invalid = { ...spec(pending.id), screens: [] };
  const result = acceptGeneration(pending, { sessionId: pending.id, requestId: pending.pending!.requestId, briefVersion: 1, uiSpec: invalid });
  expect(result.pending).toBeNull(); expect(result.spec).toBeNull(); expect(result.error).toContain('invalid');
 });
 it('drops inherited or removed data filters during reconciliation', () => {
  const current = spec(), preview = reconcilePreviewState(null, current);
  preview.filters['constructor'] = { field: 'name', stateKey: 'receipt' };
  expect(reconcilePreviewState(preview, current, current).filters).toEqual({});
 });
 it('commits the submitted filter form value to the preview state', () => {
  const current = spec(), preview = reconcilePreviewState(null, current);
  preview.forms['category-filter'] = { category: 'Community' };
  const next = applyAction(preview, { type: 'filter', dataKey: 'listings', field: 'category', stateKey: 'category' }, current, 'category-filter');
  expect(next.values.category).toBe('Community');
  expect(next.filters.listings).toEqual({ field: 'category', stateKey: 'category' });
 });
});
