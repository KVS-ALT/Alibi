"use client";

import { useEffect, useId, useRef, useState } from "react";
import QRCode from "qrcode";

export default function ProjectQR({ url, title }: { url?: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const heading = useId();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || !url) return;
    const modal = dialog.current;
    modal?.showModal();
    setFailed(false);
    if (canvas.current) void QRCode.toCanvas(canvas.current, url, { width: 256, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).catch(() => setFailed(true));
    return () => modal?.close();
  }, [open, url]);
  return <>
    <button type="button" disabled={!url} aria-label={`Show QR code for ${title}`} title={url ? `Share ${title}` : "Project is deploying"} aria-describedby={`${heading}-tooltip`} onClick={() => setOpen(true)} className="group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-current text-inherit outline-offset-4 focus-visible:outline-2 disabled:opacity-40">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h-3zM18 18h3v3h-3zM12 3v3M12 9v3H9M3 12h3M12 15v6M21 12h-6"/></svg>
      <span id={`${heading}-tooltip`} role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white group-hover:block group-focus-visible:block">Show QR code</span>
    </button>
    {open && <dialog ref={dialog} aria-labelledby={heading} onCancel={() => setOpen(false)} onClose={() => { if (!dialog.current?.open) setOpen(false); }} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-900 shadow-xl backdrop:bg-black/60">
      <div className="flex items-center justify-between gap-4"><h2 id={heading} className="min-w-0 break-words text-xl font-semibold">{title}</h2><button type="button" autoFocus aria-label="Close QR code" onClick={() => setOpen(false)} className="min-h-11 shrink-0 rounded-full border border-neutral-300 px-3 text-sm">Close</button></div>
      <p className="mt-4 text-sm text-neutral-600">Scan to open this project on your phone.</p>
      {failed ? <p role="alert" className="mt-4 text-sm">QR code unavailable. Use the project link below.</p> : <canvas ref={canvas} role="img" aria-label={`QR code linking to ${title}`} className="mx-auto mt-4 h-auto max-w-full" />}
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 block break-all rounded-lg border border-neutral-300 p-3 text-center text-sm underline">Open project</a>
    </dialog>}
  </>;
}
