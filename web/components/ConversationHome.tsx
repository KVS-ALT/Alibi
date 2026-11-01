"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Portfolio as PortfolioSchema, type Portfolio } from "@alibi/shared";
import { useCurrentSpeechCapture } from "@/lib/speech/client";
import { TEMPLATES } from "@/templates";
import { createReadyCue } from "./readyCue";

interface SessionInfo { id: string; slug: string; url: string }
type SessionStatus = "idle" | "listening" | "building" | "ready" | "error";
const STORAGE_KEY = "portfolio.capture.session";
const POLL_MS = 1500;
function sessionInfo(value: unknown): SessionInfo | null {
 if (!value || typeof value !== "object") return null;
 const data = value as Record<string, unknown>;
 return typeof data.id === "string" && typeof data.slug === "string" && data.id.length < 200 && /^[a-zA-Z0-9_-]+$/.test(data.slug)
  ? { id: data.id, slug: data.slug, url: `/p/${encodeURIComponent(data.slug)}` } : null;
}
function message(value: unknown, fallback: string) {
 if (!value || typeof value !== "object") return fallback;
 const error = (value as { error?: unknown }).error;
 if (typeof error === "string") return error.slice(0, 240);
 if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") return ((error as { message: string }).message).slice(0, 240);
 return fallback;
}

export default function ConversationHome() {
 const [session, setSession] = useState<SessionInfo | null>(null);
 const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
 const [status, setStatus] = useState<SessionStatus>("idle");
 const [creating, setCreating] = useState(false);
 const [pendingStart, setPendingStart] = useState<string | null>(null);
 const [error, setError] = useState<string | undefined>();
 const [ending, setEnding] = useState(false);
 const [availability, setAvailability] = useState<"loading" | "ready" | "unavailable">("loading");
 const version = useRef(-1), cueFloor = useRef(-1), userStarted = useRef(false);
 const createdHere = useRef(new Set<string>());
 const request = useRef<AbortController | null>(null);
 const cue = useRef<ReturnType<typeof createReadyCue> | null>(null);
 const capture = useCurrentSpeechCapture({ sessionId: session?.id ?? "", onSegment: () => {} });
 const captureRef = useRef(capture); captureRef.current = capture;

 useEffect(() => {
  const sound = createReadyCue(process.env.NEXT_PUBLIC_READY_CUE === "true"); cue.current = sound;
  try { const raw = sessionStorage.getItem(STORAGE_KEY); if (raw) setSession(sessionInfo(JSON.parse(raw))); } catch { /* In-memory operation remains available. */ }
  return () => { request.current?.abort(); sound.dispose(); if (cue.current === sound) cue.current = null; };
 }, []);

 useEffect(() => {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  async function check() {
   let ready = false;
   try {
    const response = await fetch("/api/live/config", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
    const data = response.ok ? await response.json() : null;
    ready = data?.providers?.generation?.configured === true && data?.providers?.generation?.enabled === true && data?.providers?.speech?.configured === true && data?.providers?.speech?.enabled === true;
   } catch { /* Keep capture disabled until readiness is confirmed. */ }
   if (!stopped) { setAvailability(ready ? "ready" : "unavailable"); timer = setTimeout(check, ready ? 30_000 : 5000); }
  }
  void check();
  return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
 }, []);

 useEffect(() => {
  if (!pendingStart || pendingStart !== session?.id) return;
  setPendingStart(null);
  void Promise.resolve(captureRef.current.start()).catch(() => setError("Microphone capture could not start. Try again."));
 }, [pendingStart, session?.id]);

 useEffect(() => {
  if (!session) return;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  version.current = -1; cueFloor.current = createdHere.current.has(session.id) ? 0 : -1;
  async function tick() {
   try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(session!.id)}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
    if (stopped) return;
    if (response.status === 404 || response.status === 403) {
     setError("This session is no longer available. Start again to continue."); setSession(null);
     try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
     return;
    }
    if (!response.ok) throw new Error("Unable to refresh the preview.");
    const data = await response.json();
    if (stopped || data.id !== session!.id) return;
    if (["idle", "listening", "building", "ready", "error"].includes(data.status)) setStatus(data.status);
    if (typeof data.error === "string") setError(data.error.slice(0, 240));
    else if (data.status !== "error") setError(undefined);
    if (Number.isSafeInteger(data.version) && data.version >= version.current && data.portfolio) {
     const parsed = PortfolioSchema.safeParse(data.portfolio);
     if (parsed.success) {
      if (cueFloor.current < 0) cueFloor.current = data.version;
      version.current = data.version; setPortfolio(parsed.data);
      if (data.status === "ready" && userStarted.current && data.version > cueFloor.current) {
       cue.current?.play(`${session!.id}:${data.version}`); cueFloor.current = data.version;
      }
     }
    }
   } catch {
    if (!stopped) setError("Connection interrupted. Your preview is kept while reconnecting.");
   } finally { if (!stopped) timer = setTimeout(tick, POLL_MS); }
  }
  void tick();
  return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
 }, [session]);

 const start = useCallback(async () => {
  if (creating || pendingStart || availability !== "ready") return;
  userStarted.current = true; void cue.current?.unlock(); setError(undefined);
  if (session) { setPendingStart(session.id); return; }
  setCreating(true); const controller = new AbortController(); request.current = controller;
  try {
   const response = await fetch("/api/sessions", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal });
   const data = await response.json();
   if (!response.ok) throw new Error(message(data, "Could not start a session. Try again."));
   const next = sessionInfo(data); if (!next) throw new Error("The server returned an invalid session.");
   createdHere.current.add(next.id); setSession(next);
   try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
   if (data.providers?.speech?.enabled === false) { setError("Speech capture is not enabled for this session."); return; }
   setPendingStart(next.id);
  } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not start a session."); }
  finally { if (!controller.signal.aborted) setCreating(false); }
 }, [creating, pendingStart, session, availability]);

 const end = useCallback(async () => {
  if (ending) return;
  setEnding(true);
  try { await captureRef.current.flush(); } catch { /* Capture exposes its safe error message. */ }
  finally { await captureRef.current.end(); setEnding(false); }
 }, [ending]);

 const listening = capture.status === "listening", muted = capture.status === "muted";
 const busy = creating || capture.starting || ending;
 const Template = portfolio ? TEMPLATES[portfolio.templateId] : null;
 const label = ending ? "Finishing capture" : busy ? "Connecting" : listening ? "Mute microphone" : muted ? "Resume microphone" : "Start microphone";
 const notice = capture.error || error || (availability === "unavailable" ? "Service not ready." : undefined);
 return (
  <div className="min-h-svh bg-[#fbfafc] text-[#3c3345]">
   {Template && portfolio ? <div className="pb-32"><Template portfolio={portfolio} /></div> : <main aria-label="Conversation preview" className="min-h-svh" />}
   <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
    <section aria-label="Microphone controls" className="max-w-full rounded-3xl border border-[#e5e1e8] bg-[#fbfafc] px-5 py-3 text-center">
     <div className="flex items-center justify-center gap-3">
      <button type="button" aria-label={label} disabled={busy || (!listening && availability !== "ready")} onClick={() => { if (listening) capture.mute(); else if (muted) void capture.resume(); else void start(); }} className="grid h-12 w-16 place-items-center rounded-full bg-[#63536f] text-white outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#78648a] disabled:opacity-60">
       <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8"/>{muted && <path d="M3 3l18 18"/>}</svg>
      </button>
      {(listening || muted) && <button type="button" aria-label="End listening" disabled={ending} onClick={() => void end()} className="grid h-11 w-11 place-items-center rounded-full border border-[#d5cddd] text-[#63536f] outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#78648a]"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-current"/></button>}
      {session && portfolio && version.current > 0 && <a href={session.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#d5cddd] px-4 py-3 text-xs text-[#63536f] outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#78648a]">Open portfolio</a>}
     </div>
     <p role="status" className="mt-2 min-h-4 text-xs text-[#74687f]">{ending ? "Finishing" : busy ? "Connecting" : status === "building" ? "Updating preview" : listening ? "Listening" : muted ? "Paused" : availability === "loading" ? "Getting ready" : ""}</p>
     {notice && <p role="alert" className="mt-2 max-w-sm text-xs leading-relaxed text-[#7e4253]">{notice}</p>}
    </section>
   </div>
  </div>
 );
}
