// Shared with the dependency-free standalone Node server, which loads CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { interactionScript } = require('./template-interactions.cjs');
// Serve the authored product template itself, never a portfolio/detail-page wrapper.
function renderProjectTemplate(project, css = '') {
  const title = String(project.title || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = value => String(value || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let html = project.mockHtml || '';
  // Also clean snapshots created before product-only template generation.
  for (const value of [project.summary, ...(project.highlights || []), ...(project.details || []).map(d => d.value)]) {
    for (const length of [48, 140, Infinity]) {
      const copy = text(String(value || '').slice(0, length));
      if (copy.length >= 12) html = html.split(copy).join('');
    }
  }
  const heading = text(String(project.tagline || '').slice(0, 60));
  if (heading.length >= 12) html = html.split(heading).join('Overview');
  const nonce = globalThis.crypto.randomUUID();
  const background = /bg-neutral-9(?:00|50)/.test(html) ? '#0a0a0a' : '#f7f6f3';
  const accent = html.match(/data-accent="([a-z]+)"/)?.[1] || 'indigo';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><title>${title}</title><style>${css}</style></head><body>${html}<style>
html{background:${background}}[data-kit].bg-neutral-950 .text-neutral-500{color:#a3a3a3}[data-kit] button.bg-${accent}-600{background:var(--color-${accent}-700)}[data-kit] aside>div:first-child>div:first-child{background-image:none;background-color:var(--color-${accent}-700)}[data-kit] nav{display:flex;flex-direction:column;gap:8px}[data-kit] nav>button{margin-top:0!important}[data-kit] .col-span-3 button{margin:0 8px;padding:0 8px}[hidden]{display:none!important}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:3px}
html,body{margin:0;width:100%;min-height:100%;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}body>[data-kit],body>.mock-root{width:100%!important;min-height:100dvh;height:auto!important;overflow:visible!important}body>[data-kit]>main{min-width:0}body>.mock-root>div{height:auto!important;min-height:100dvh;overflow:visible!important}
@media(max-width:700px){body>[data-kit="dashboard"]{display:block}body>[data-kit="dashboard"]>aside{width:100%;padding:16px;border-right:0}body>[data-kit="dashboard"]>aside>div:first-child{margin-bottom:16px}body>[data-kit="dashboard"]>aside>div:last-child{display:none}body>[data-kit="dashboard"] nav{display:flex;flex-direction:row;flex-wrap:wrap;gap:8px}body>[data-kit="dashboard"]>main{padding:20px 16px}body>[data-kit="dashboard"]>main>div:first-child{align-items:flex-start;gap:16px;flex-wrap:wrap}body>[data-kit="dashboard"] .grid-cols-5{grid-template-columns:minmax(0,1fr)}body>[data-kit="dashboard"] .col-span-3,body>[data-kit="dashboard"] .col-span-2{grid-column:span 1}body>[data-kit="cards"] .grid{grid-template-columns:minmax(0,1fr)}body>[data-kit="phone"]{padding:16px;flex-wrap:wrap}body>[data-kit="terminal"]{padding:16px}body>[data-kit="terminal"]>div{width:100%;height:auto;min-height:calc(100dvh - 32px)}}
</style><script nonce="${nonce}">${interactionScript}</script></body></html>`;
}
module.exports = { renderProjectTemplate };
