// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { SpeechCaptureOptions } from '../../src/audio';
import App from '../../src/App';

vi.mock('../../src/integration/api', () => ({ detectExecutionMode: async () => 'browser-demo', endServerSession: vi.fn(), downloadServerExport: vi.fn(), generateOnServer: vi.fn() }));
vi.mock('../../src/audio/configured', () => ({
 useConfiguredSpeechCapture: (options: SpeechCaptureOptions) => ({ status: 'idle', supported: true, starting: false, interimText: '', error: null, flush: async () => {},
  start: () => {
   options.onSegment({ sessionId: options.sessionId, segmentId: 'final-command-segment', text: 'Build a studio booking app called Immediate Studio.', isFinal: true });
  }, mute: vi.fn(), resume: vi.fn(), end: vi.fn(),
 }),
}));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); });

it('automatically builds a final voice segment without a build command or manual controls', async () => {
 vi.useFakeTimers();
 render(<App />);
 fireEvent.click(screen.getByRole('button', { name: /^Start session$/ }));
 await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
 const preview = within(screen.getByRole('main'));
 expect(preview.getByRole('heading', { name: 'Immediate Studio', level: 1 })).toBeTruthy();
 expect(screen.queryByRole('navigation', { name: 'Choose template' })).toBeNull();
 expect(screen.queryByRole('alert')).toBeNull();
 expect(sessionStorage.getItem('forme.tab-session.v1')).toContain('Immediate Studio');
});
