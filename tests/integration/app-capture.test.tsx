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
afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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

it('plays an opted-in local cue only after a user-started accepted result, never on restoration', async () => {
 vi.useFakeTimers(); vi.stubEnv('VITE_READY_CUE', 'true');
 const tone = vi.fn(), opened = vi.fn();
 class LocalAudio {
  state = 'running'; currentTime = 0; destination = {};
  constructor() { opened(); }
  async close() {} async resume() {}
  createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start: tone, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
 }
 vi.stubGlobal('AudioContext', LocalAudio);
 const first = render(<App />); expect(opened).not.toHaveBeenCalled(); expect(tone).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: /^Start session$/ }));
 expect(opened).toHaveBeenCalledTimes(1); expect(tone).not.toHaveBeenCalled();
 await act(async () => { await vi.advanceTimersByTimeAsync(1600); }); expect(tone).toHaveBeenCalledTimes(1);
 first.unmount(); render(<App />);
 await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
 expect(opened).toHaveBeenCalledTimes(1); expect(tone).toHaveBeenCalledTimes(1);
});
