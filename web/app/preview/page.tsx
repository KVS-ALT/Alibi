"use client";

import { useEffect, useState } from "react";
import { TemplateId } from "@alibi/shared";
import { STAGES, samplePortfolio, type Stage } from "@/lib/fixtures";
import { TEMPLATES } from "@/templates";

// Dev page: every template at every build stage, plus "play" to simulate a live build.
export default function Preview() {
  const [template, setTemplate] = useState<TemplateId>("showcase");
  const [stage, setStage] = useState<Stage>("full");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    setStage("empty");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setStage(STAGES[i]);
      if (i === STAGES.length - 1) {
        clearInterval(id);
        setPlaying(false);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [playing]);

  const Template = TEMPLATES[template];
  const btn = (active: boolean) =>
    `rounded-full px-3 py-1.5 transition-colors ${active ? "bg-white text-black" : "text-white/70 hover:text-white"}`;

  return (
    <>
      <Template portfolio={samplePortfolio(template, stage)} />
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-3xl bg-neutral-900/90 p-1.5 text-xs shadow-2xl ring-1 ring-white/10 backdrop-blur">
          {TemplateId.options.map((t) => (
            <button key={t} className={btn(t === template)} onClick={() => setTemplate(t)}>
              {t}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/20" />
          {STAGES.map((s) => (
            <button key={s} className={btn(s === stage)} onClick={() => setStage(s)}>
              {s}
            </button>
          ))}
          <button className={btn(playing)} onClick={() => setPlaying(true)}>
            ▶ play
          </button>
        </div>
      </div>
    </>
  );
}
