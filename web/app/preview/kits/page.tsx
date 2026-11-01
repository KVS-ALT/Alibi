"use client";

import { KIT_SAMPLES, KITS, renderMock } from "@/lib/mock-kits";
import { MockFrame } from "@/templates/parts";

// Dev page: every mock UI kit with its reference data, in both themes.
export default function KitPreview() {
  return (
    <main className="min-h-screen bg-neutral-100 px-5 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-2xl font-semibold">Mock UI kits</h1>
        <div className="grid gap-10 md:grid-cols-2">
          {KITS.flatMap((kit) =>
            (["dark", "light"] as const).map((theme) => (
              <section key={kit + theme}>
                <div className="mb-2 font-mono text-xs text-neutral-500">
                  {kit} · {theme}
                </div>
                <MockFrame html={renderMock({ ...KIT_SAMPLES[kit], theme })} url={`${KIT_SAMPLES[kit].appName.toLowerCase()}.app`} />
              </section>
            )),
          )}
        </div>
      </div>
    </main>
  );
}
