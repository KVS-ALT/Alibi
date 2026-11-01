'use client';

import { useEffect, useState } from 'react';
import type { ProjectSection } from '@alibi/shared';
import { MockFrame } from '@/templates/parts';
import { MockSpec, renderMock } from '@/lib/mock-kits';

type Item = { id: string; title: string; done: boolean };

export default function ProjectApp({ project, theme, storageKey }: { project: ProjectSection; theme: string; storageKey: string; back: string }) {
  const [items, setItems] = useState<Item[]>(() => project.highlights.map((title, index) => ({ id: `seed-${index}`, title, done: false })));
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [tab, setTab] = useState('Workspace');
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved) && saved.length <= 100 && saved.every(item => item && typeof item.id === 'string' && typeof item.title === 'string' && item.title.length <= 200 && typeof item.done === 'boolean')) setItems(saved);
    } catch { /* Storage can be unavailable in private browsing. */ }
    setReady(true);
  }, [storageKey]);
  useEffect(() => { if (ready) { try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* Keep the current session usable. */ } } }, [items, ready, storageKey]);
  const dark = theme === 'geist';
  const text = `${project.category} ${project.title} ${project.summary}`;
  const kit = /chat|assistant|messag/i.test(text) ? 'chat' : /mobile|fitness|health/i.test(text) ? 'phone' : /cli|terminal/i.test(text) ? 'terminal' : /extension|browser|tabs/i.test(text) ? 'extension' : /market|shop|design|CAD/i.test(text) ? 'cards' : 'dashboard';
  const spec = MockSpec.parse({ kit, theme: dark ? 'dark' : 'light', accent: theme === 'lowercase' ? 'teal' : 'indigo', appName: project.title, context: project.category, heading: project.tagline, action: 'New item', nav: ['Overview', 'Workspace', 'Activity'], stats: project.metrics.map(metric => ({ ...metric, note: '' })), items: items.slice(0, 6).map(item => ({ title: item.title, subtitle: project.category, meta: '', tag: item.done ? 'Done' : 'Active', status: item.done ? 'good' : 'neutral' })), callout: project.summary, user: 'you' });
  const panel = dark ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white';
  const muted = dark ? 'text-neutral-300' : 'text-neutral-600';
  return <main className={`min-h-screen p-6 md:p-12 ${dark ? 'bg-neutral-950 text-white' : 'bg-[#f7f6f3] text-neutral-900'}`}>
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-4">

        <p className={`text-sm ${muted}`}>{project.category} / Interactive prototype</p>
        <h1 className="break-words text-[40px] font-semibold tracking-tight">{project.title}</h1>
        <p className={`max-w-3xl text-lg ${muted}`}>{project.tagline}</p>
      </header>
      <nav aria-label="Project views" data-ui-container className="flex flex-wrap gap-3 p-2">
        {['Workspace', 'Product preview', 'About'].map(label => <button key={label} onClick={() => setTab(label)} aria-pressed={tab === label} className={`min-h-11 rounded-lg border px-4 py-3 text-sm ${tab === label ? 'border-indigo-700 bg-indigo-700 text-white' : panel}`}>{label}</button>)}
      </nav>
      {tab === 'Workspace' && <section aria-label="Workspace" className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          {[['Items', items.length], ['Completed', items.filter(item => item.done).length], ['Remaining', items.filter(item => !item.done).length]].map(([label, value]) => <div className={`rounded-xl border p-6 ${panel}`} key={label}><dt className={`text-sm ${muted}`}>{label}</dt><dd className="mt-3 text-3xl font-semibold">{value}</dd></div>)}
        </dl>
        <div className={`space-y-6 rounded-xl border p-6 ${panel}`}>
          <div className="space-y-2"><label className="block text-sm font-medium" htmlFor="search">Search items</label><input id="search" value={query} onChange={event => setQuery(event.target.value)} className={`min-h-11 w-full rounded-lg border p-3 ${panel}`} /></div>
          <form className="flex flex-wrap items-end gap-3 p-2" data-ui-container onSubmit={event => { event.preventDefault(); if (!title.trim() || items.length >= 100) return; setItems(current => [...current, { id: crypto.randomUUID(), title: title.trim(), done: false }]); setTitle(''); }}>
            <div className="min-w-0 flex-1 space-y-2"><label className="block text-sm font-medium" htmlFor="item">New item</label><input id="item" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} className={`min-h-11 w-full rounded-lg border p-3 ${panel}`} /></div>
            <button disabled={!ready || items.length >= 100} className="min-h-11 rounded-lg bg-indigo-700 px-6 py-3 text-white disabled:opacity-50">Add item</button>
          </form>
          <ul className="space-y-3" aria-live="polite">{items.filter(item => item.title.toLowerCase().includes(query.toLowerCase())).map(item => <li key={item.id} className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 ${panel}`}><span className={`min-w-0 flex-1 break-words ${item.done ? 'line-through' : ''}`}>{item.title}</span><button aria-label={`${item.done ? 'Reopen' : 'Complete'} ${item.title}`} onClick={() => setItems(current => current.map(row => row.id === item.id ? { ...row, done: !row.done } : row))} className={`min-h-11 rounded-lg border px-4 py-3 text-sm ${panel}`}>{item.done ? 'Reopen' : 'Complete'}</button></li>)}</ul>
          {!items.some(item => item.title.toLowerCase().includes(query.toLowerCase())) && <p role="status">No matching items.</p>}
          <p className={`text-sm ${muted}`}>Changes are saved in this browser. This prototype uses sample data.</p>
        </div>
      </section>}
      {tab === 'Product preview' && <section aria-label="Product preview"><MockFrame html={renderMock(spec)} title={project.title} dark={dark} /></section>}
      {tab === 'About' && <section aria-label="About project" className={`space-y-6 rounded-xl border p-6 ${panel}`}><h2 className="text-2xl font-semibold">About {project.title}</h2><p>{project.summary}</p><dl className="space-y-4">{project.details?.map(detail => <div key={detail.label}><dt className="font-semibold">{detail.label}</dt><dd className={muted}>{detail.value}</dd></div>)}</dl><p className={muted}>{project.stack.join(' / ')}</p></section>}
    </div>
  </main>;
}
