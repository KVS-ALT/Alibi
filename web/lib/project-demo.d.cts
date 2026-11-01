export function demoModel(project: { title: string; category?: string; summary?: string; tagline?: string }): { kind: string; heading: string; intro: string; noun: string; action: string; records: string[][] };
export function renderProjectDemo(project: { title: string; category?: string; summary?: string; tagline?: string }, storageKey?: string): string;
