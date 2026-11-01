import { describe, expect, it } from 'vitest';
import type { GenerationRequest, UiSpec } from '../../src/contracts';
import { createBrief, generatePrototype, validateUiSpec } from '../../src/generation';
import { TEMPLATE_CATALOG } from '../../src/templates';

const request = (input = 'Create a bakery called Sunday Bread. Let visitors browse fresh bread; also add a contact form.'): GenerationRequest => {
  const brief = createBrief('session-test', 1, input);
  return { sessionId: brief.sessionId, requestId: 'request-test', briefVersion: brief.version, brief };
};

async function generated(): Promise<UiSpec> {
  const result = await generatePrototype(request());
  if (!('uiSpec' in result)) throw new Error(result.safeMessage);
  return result.uiSpec;
}

describe('demo generation', () => {
  it('creates a usable, validated prototype for every reviewed template', async () => {
    for (const template of TEMPLATE_CATALOG) {
      const result = await generatePrototype(request(), { templateId: template.id });
      expect(result, template.id).toHaveProperty('uiSpec');
      if ('uiSpec' in result) {
        expect(validateUiSpec(result.uiSpec).success).toBe(true);
        expect(result.uiSpec.templateId).toBe(template.id);
        expect(result.uiSpec.demoDataLabel).toMatch(/synthetic demo data/i);
      }
    }
  });

  it('uses user-authored identity in the shared hero metadata', async () => {
    const spec = await generated();
    const metadata = Object.fromEntries(spec.screens[0].components.filter(c => c.type === 'text').map(c => [c.id, c.type === 'text' ? c.properties.text : '']));
    expect(metadata['hero-brand']).toBe('Sunday Bread');
    expect(metadata['hero-title']).toContain('Sunday Bread');
    expect(metadata['hero-description']).toContain('browse fresh bread');
  });

  it('preserves newlines as separate requirements and recognizes style', () => {
    const brief = createBrief('session-test', 3, 'Create a bakery\nSell fresh sourdough\nUse a warm minimal style');
    expect(brief.requirements).toHaveLength(3);
    expect(brief.style).toEqual(['minimal', 'warm']);
    expect(brief.purpose).toBe('Create a bakery');
  });

  it('rejects a mismatched session and an invalid template without a network call', async () => {
    const invalid = request();
    invalid.brief.sessionId = 'another-session';
    expect(await generatePrototype(invalid)).toMatchObject({ errorCode: 'INVALID_GENERATION' });
    expect(await generatePrototype(request(), { templateId: 'not-reviewed' })).toMatchObject({ errorCode: 'INVALID_GENERATION' });
  });

  it('does not advance prototype history from a different session', async () => {
    const previous = await generated();
    previous.sessionId = 'different-session';
    previous.version = 99;
    expect(await generatePrototype({ ...request(), previousUiSpec: previous })).toMatchObject({ errorCode: 'INVALID_GENERATION' });
  });

  it('honors cancellation before generating', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(generatePrototype(request(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('schema boundary', () => {
  it('treats hostile copy as text but rejects executable component properties', async () => {
    const spec = await generated();
    const c = spec.screens[0].components.find(c => c.type === 'text')!;
    if (c.type !== 'text') throw new Error('missing fixture text');
    c.properties.text = '</script><img src=x onerror="alert(1)">';
    expect(validateUiSpec(spec).success).toBe(true);
    Object.assign(c.properties, { html: '<script>alert(1)</script>' });
    expect(validateUiSpec(spec).success).toBe(false);
  });

  it('rejects duplicate IDs, missing navigation targets, missing data columns, and control characters', async () => {
    const spec = await generated();
    const duplicate = structuredClone(spec);
    duplicate.screens[1].id = duplicate.screens[0].id;
    expect(validateUiSpec(duplicate).success).toBe(false);
    const nav = structuredClone(spec);
    nav.screens[0].components.push({ id: 'bad-target', type: 'button', properties: { label: 'Go' }, actions: [{ type: 'navigate', screenId: 'missing' }] });
    expect(validateUiSpec(nav).success).toBe(false);
    const missingColumn = structuredClone(spec);
    const table = missingColumn.screens[0].components.find(c => c.type === 'table')!;
    if (table.type === 'table') table.properties.columns = ['missing'];
    expect(validateUiSpec(missingColumn).success).toBe(false);
    expect(validateUiSpec({ ...spec, demoDataLabel: 'Demo\u0007label' }).success).toBe(false);
  });

  it('rejects prototype-reserved identifiers and malformed reference keys', async () => {
    const spec = await generated();
    for (const key of ['constructor', 'prototype', '__proto__', 'bad key']) {
      const modified = structuredClone(spec);
      modified.screens[0].components[0].id = key;
      expect(validateUiSpec(modified).success, key).toBe(false);
    }
    const reservedData = JSON.parse(JSON.stringify(spec));
    reservedData.demoData = JSON.parse('{"constructor":[]}');
    expect(validateUiSpec(reservedData).success).toBe(false);
  });
});
