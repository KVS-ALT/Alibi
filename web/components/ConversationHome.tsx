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
interface Task { name: string; ms: number; ok: boolean }

// "[S1] hi there [S2] hello" -> [{ speaker: "S1", text: "hi there" }, ...]
function turns(transcript: string) {
 const out: { speaker?: string; text: string }[] = [];
 for (const part of transcript.split(/(?=\[(?:S\d{1,3}|UU)\])/)) {
  const m = part.match(/^\[(S\d{1,3}|UU)\]\s*/);
  const text = (m ? part.slice(m[0].length) : part).trim();
  if (text) out.push({ speaker: m?.[1], text });
 }
 return out;
}

function taskLabel(name: string, portfolio: Portfolio | null) {
 const [kind, id] = name.split(":");
 const title = (id && portfolio?.projects[id]?.title) || id;
 if (kind === "extract_claims") return "Understanding the conversation";
 if (kind === "write_project") return `Writing ${title}`;
 if (kind === "make_mock") return `Designing the ${title} screen`;
 return name;
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
 const [transcript, setTranscript] = useState("");
 const [builder, setBuilder] = useState<string | undefined>();
 const [tasks, setTasks] = useState<Task[]>([]);
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
    if (typeof data.transcript === "string") setTranscript(data.transcript);
    setBuilder(typeof data.builder === "string" ? data.builder : undefined);
    if (Array.isArray(data.metrics?.tasks)) setTasks(data.metrics.tasks.slice(-12));
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

 // New take: stop the mic, forget this tab's session and reload to an empty page (old /p links keep working).
 const restart = useCallback(() => {
  try { captureRef.current.end(); } catch {}
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  window.location.reload();
 }, []);

 const end = useCallback(async () => {
  if (ending) return;
  setEnding(true);
  try { await captureRef.current.flush(); } catch { /* Capture exposes its safe error message. */ }
  finally { await captureRef.current.end(); setEnding(false); }
 }, [ending]);

 const listening = capture.status === "listening", muted = capture.status === "muted";
 const busy = creating || capture.starting || ending;
 const Template = portfolio ? TEMPLATES[portfolio.templateId] : null;
 const label = ending ? "Finishing capture" : busy ? "Connecting" : listening ? "Pause microphone" : muted ? "Resume microphone" : "Start microphone";
 const notice = (capture.error ? `${capture.error}${capture.errorCode ? ` (${capture.errorCode})` : ""}` : undefined) || error || (availability === "unavailable" ? "Service not ready. Check the API keys in web/.env.local." : undefined);
 const state = ending ? "Finishing" : busy ? "Connecting" : listening ? "Listening" : muted ? "Paused" : status === "building" ? "Building" : portfolio && version.current > 0 ? "Ready" : availability === "loading" ? "Getting ready" : "Ready to listen";
 const lines = turns(transcript);
 const speakers = [...new Set(lines.map((l) => l.speaker).filter(Boolean))] as string[];
 const projectCount = portfolio ? Object.values(portfolio.projects).filter((p) => p.status === "ready").length : 0;
 const pageUrl = session && typeof window !== "undefined" ? `${window.location.host}${session.url}` : "";

 return (
  <div className="flex min-h-svh flex-col bg-[#f4f4f5] text-neutral-900 lg:h-svh lg:flex-row">
   {/* Control panel */}
   <aside aria-label="Conversation" className="flex shrink-0 flex-col bg-[#0c0c0e] text-neutral-300 lg:w-[400px]">
    <header className="flex items-center justify-between px-6 pb-4 pt-6">
     <div className="flex items-center gap-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-sm font-bold text-black">A</div>
      <div>
       <div className="text-[15px] font-semibold leading-none text-white">Alibi</div>
       <div className="mt-1 text-[11px] text-neutral-500">talk about it, it builds it</div>
      </div>
     </div>
     <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${listening ? "bg-red-500/15 text-red-300" : status === "building" ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-neutral-400"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${listening ? "animate-pulse bg-red-400" : status === "building" ? "animate-pulse bg-amber-300" : "bg-neutral-500"}`} />
      {state}
     </span>
    </header>

    <div className="flex items-center gap-3 px-6 pb-5">
     <button type="button" aria-label={label} disabled={busy || (!listening && availability !== "ready")} onClick={() => { if (listening) capture.mute(); else if (muted) void capture.resume(); else void start(); }} className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-white transition outline-offset-4 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40 ${listening ? "bg-red-500 shadow-[0_0_0_6px_rgba(239,68,68,0.18)]" : "bg-white text-black hover:bg-neutral-200"}`}>
      <svg viewBox="0 0 24 24" className={`h-6 w-6 ${listening ? "text-white" : "text-black"}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8"/>{muted && <path d="M3 3l18 18"/>}</svg>
     </button>
     <div className="min-w-0 flex-1 text-[13px] leading-snug text-neutral-400">
      {listening ? "Talk about what you've built. Finish your sentences; say each project's name clearly." : muted ? "Paused. Tap to keep talking." : portfolio ? "Tap the mic to keep adding to it." : "Tap the mic and start the conversation."}
     </div>
     {(listening || muted) && <button type="button" aria-label="End listening" disabled={ending} onClick={() => void end()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 text-neutral-300 hover:bg-white/5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-current"/></button>}
    </div>
    {notice && <p role="alert" className="mx-6 mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">{notice}</p>}

    <section aria-label="Transcript" className="flex min-h-[180px] flex-1 flex-col border-t border-white/[0.06] lg:min-h-0">
     <div className="flex items-center justify-between px-6 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
      <span>Transcript</span>
      {speakers.length > 1 && <span className="normal-case tracking-normal text-neutral-600">{speakers.length} voices</span>}
     </div>
     <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-4 text-[13.5px] leading-relaxed lg:max-h-none">
      {lines.length === 0 && !capture.interimText && <p className="text-neutral-600">Nothing yet. Everything said shows up here, labelled by speaker.</p>}
      {lines.map((l, i) => {
       const you = l.speaker && l.speaker === builder;
       return (
        <div key={i} className="flex gap-2.5">
         <span className={`mt-0.5 h-5 shrink-0 rounded px-1.5 text-[10px] font-semibold leading-5 ${you ? "bg-white text-black" : "bg-white/[0.07] text-neutral-400"}`}>{you ? "YOU" : l.speaker ?? "MIC"}</span>
         <p className={you || !l.speaker ? "text-neutral-200" : "text-neutral-500"}>{l.text}</p>
        </div>
       );
      })}
      {capture.interimText && <p className="pl-9 text-neutral-500 italic">{capture.interimText}…</p>}
     </div>
    </section>

    <section aria-label="Build log" className="border-t border-white/[0.06] px-6 py-4">
     <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-neutral-500">
      <span>Build log</span>
      {projectCount > 0 && <span className="normal-case tracking-normal text-neutral-600">{projectCount} project{projectCount === 1 ? "" : "s"} live</span>}
     </div>
     <ul className="space-y-1.5 font-mono text-[11.5px]">
      {tasks.length === 0 && <li className="text-neutral-600">waiting for the first sentence…</li>}
      {tasks.slice(-5).map((t, i) => (
       <li key={i} className="flex items-center gap-2">
        <span className={t.ok ? "text-emerald-400" : "text-amber-300"}>{t.ok ? "✓" : "~"}</span>
        <span className="min-w-0 flex-1 truncate text-neutral-300">{taskLabel(t.name, portfolio)}</span>
        <span className="text-neutral-600">{(t.ms / 1000).toFixed(1)}s</span>
       </li>
      ))}
      {status === "building" && <li className="flex items-center gap-2 text-neutral-500"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300" /> working…</li>}
     </ul>
    </section>

    {session && (
     <footer className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-6 py-4">
      {portfolio && version.current > 0 && <a href={session.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-3.5 py-2 text-xs font-medium text-black hover:bg-neutral-200">Open portfolio ↗</a>}
      <button type="button" aria-label="Start a new take" onClick={restart} className="rounded-lg border border-white/15 px-3.5 py-2 text-xs text-neutral-300 hover:bg-white/5">↻ New take</button>
     </footer>
    )}
   </aside>

   {/* Live portfolio */}
   <main aria-label="Portfolio preview" className="flex min-h-[70svh] flex-1 flex-col p-3 lg:min-h-0 lg:p-5">
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_40px_-12px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]">
     <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-2.5">
      <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-neutral-200" /><span className="h-2.5 w-2.5 rounded-full bg-neutral-200" /><span className="h-2.5 w-2.5 rounded-full bg-neutral-200" /></div>
      <div className="mx-auto max-w-sm flex-1 truncate rounded-md bg-neutral-100 px-3 py-1 text-center text-[11px] text-neutral-500">{pageUrl || "your-portfolio"}</div>
      <div className="w-12" />
     </div>
     <div className="relative min-h-0 flex-1 overflow-y-auto">
      {Template && portfolio ? <Template portfolio={portfolio} /> : (
       <div className="grid h-full min-h-[50svh] place-items-center p-8 text-center">
        <div className="max-w-sm">
         <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-500"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8"/></svg></div>
         <h1 className="text-lg font-semibold">Your portfolio builds here, live</h1>
         <p className="mt-2 text-sm leading-relaxed text-neutral-500">Start talking. Try: <span className="text-neutral-700">“I&apos;m John, I&apos;m a CS student. Last term I built a web app called LeaseLens…”</span></p>
        </div>
       </div>
      )}
     </div>
    </div>
   </main>
  </div>
 );
}
