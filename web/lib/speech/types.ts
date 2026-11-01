/** Transport data stays separate from the shared Claims/Portfolio contract. */
export type SpeakerLabel = `S${number}` | 'UU';
export function isSpeakerLabel(value: unknown): value is SpeakerLabel {
  return typeof value === 'string' && (value === 'UU' || /^S[1-9]\d{0,3}$/.test(value));
}
export interface TranscriptSegment { sessionId: string; segmentId: string; text: string; isFinal: boolean; speaker?: SpeakerLabel }
export type CaptureStatus = 'idle' | 'listening' | 'muted' | 'ended';
export interface CaptureSnapshot { status: CaptureStatus; supported: boolean; starting: boolean; interimText: string; error?: string }
