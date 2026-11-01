// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { SpeechCaptureOptions } from '../../src/audio';
import App from '../../src/App';

vi.mock('../../src/integration/api', () => ({ detectExecutionMode: async () => 'browser-demo', endServerSession: vi.fn(), downloadServerExport: vi.fn(), generateOnServer: vi.fn() }));
vi.mock('../../src/audio', () => ({
 useSpeechCapture: (options: SpeechCaptureOptions) => ({ status: 'idle', supported: true, starting: false, interimText: '', error: null,
  start: () => {
   options.onSegment({ sessionId: options.sessionId, segmentId: 'final-command-segment', text: 'Build a studio booking app called Immediate Studio.', isFinal: true });
   options.onBuild();
  }, mute: vi.fn(), resume: vi.fn(), end: vi.fn(),
 }),
}));
afterEach(() => { cleanup(); sessionStorage.clear(); });

it('builds the latest final voice segment when the build command fires in the same callback turn', async () => {
 render(<App />);
 fireEvent.click(screen.getByRole('button', { name: /^Start session$/ }));
 const preview = within(screen.getByRole('main'));
 expect(await preview.findByRole('heading', { name: 'Immediate Studio', level: 1 })).toBeTruthy();
 expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.getByText('Captured brief')).toBeTruthy();
});
