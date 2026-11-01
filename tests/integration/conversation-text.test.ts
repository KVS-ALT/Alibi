import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addSegment, conversationText, createSession } from '../../src/integration/session';
import { createBrief, generatePrototype } from '../../src/generation';

it('replays real synthetic Speechmatics fragments as one complete request, without artificial feature cards', async () => {
 let session = createSession();
 const fragments = ['Create', 'Don', 'Bread', 'bakery with', 'sourdough', 'and a pick', 'form', '.'];
 for (const [index, text] of fragments.entries()) session = addSegment(session, { sessionId: session.id, segmentId: `fragment-${index}`, text, isFinal: true });
 const text = conversationText(session);
 expect(text).toBe('Create Don Bread bakery with sourdough and a pick form.');
 const brief = createBrief(session.id, 1, text);
 expect(brief.purpose).toBe(text); expect(brief.requirements).toEqual([text]);
 const result = await generatePrototype({ sessionId: session.id, requestId: 'fragment-replay', briefVersion: 1, brief });
 expect('uiSpec' in result).toBe(true);
 if ('uiSpec' in result) {
  expect(result.uiSpec.templateId).toBe('bakery');
  expect(result.uiSpec.screens.flatMap(screen => screen.components).some(component => component.type === 'card' && component.properties.title.startsWith('Your requirement'))).toBe(false);
 }
});
it('keeps original fragment order on final replacements, deduplicates IDs, and ignores interims and foreign sessions', () => {
 let session = createSession();
 const put = (id: string, text: string, isFinal = true) => { session = addSegment(session, { sessionId: session.id, segmentId: id, text, isFinal }); };
 put('a', 'Create', false); put('b', 'a bakery'); put('a', 'Create'); put('b', 'a bakery'); put('c', ','); put('d', 'with bread'); put('e', '.'); put('f', 'unfinished', false);
 session = addSegment(session, { sessionId: 'other-session', segmentId: 'g', text: 'foreign', isFinal: true });
 expect(conversationText(session)).toBe('Create a bakery, with bread.');
 expect(session.transcript).toHaveLength(6);
});
it('preserves actual punctuation boundaries instead of inventing a requirement for every fragment', () => {
 let session = createSession();
 ['Create a bakery', '.', 'Include', 'a pickup form', '.'].forEach((text, index) => { session = addSegment(session, { sessionId: session.id, segmentId: String(index), text, isFinal: true }); });
 expect(createBrief(session.id, 1, conversationText(session)).requirements).toEqual(['Create a bakery.', 'Include a pickup form.']);
});
it('loads the shell stylesheet without third-party font URLs', () => {
 const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
 expect(css).not.toMatch(/@import\s|https?:\/\/|fonts\.googleapis|fonts\.gstatic/i);
 expect(css).toContain("'DM Sans',Arial,sans-serif");
});
