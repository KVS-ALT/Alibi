/** Transport data stays separate from the shared Claims/Portfolio contract. */
export interface TranscriptSegment { sessionId: string; segmentId: string; text: string; isFinal: boolean; speaker?: string }
export type CaptureStatus = 'idle' | 'listening' | 'muted' | 'ended';
export interface CaptureSnapshot { status: CaptureStatus; supported: boolean; starting: boolean; interimText: string; error?: string }
