// Each generated project runs this server in its own Render web service.
const http = require('node:http');
const { renderProjectDemo } = require('../web/lib/project-demo.cjs');
const { renderProjectTemplate } = require('../web/lib/project-template.cjs');
const fs = require('node:fs');
const path = require('node:path');
const cssSource = fs.readFileSync(path.join(__dirname, '../web/lib/mock-kit-styles.ts'), 'utf8');
const css = JSON.parse(cssSource.slice(cssSource.indexOf('=') + 1).trim().replace(/;$/, ''));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let project = JSON.parse(Buffer.from(process.env.PROJECT_SNAPSHOT || '', 'base64').toString());
async function refresh() {
  if (!process.env.PROJECT_SOURCE_URL) return;
  try { const response = await fetch(process.env.PROJECT_SOURCE_URL, { signal: AbortSignal.timeout(5000) }); if (response.ok) { const data = await response.json(); const next = data.portfolio?.projects?.[process.env.PROJECT_ID]; if (next?.status === 'ready') project = next; } } catch { /* The deployment snapshot survives parent restarts. */ }
}
setInterval(() => void refresh(), 15000).unref();
http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); return; }
  if (req.url === '/preview') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'" });
    res.end('<!doctype html><html><head><meta name="viewport" content="width=960"><style>' + css + 'html,body{margin:0;width:960px;height:600px;overflow:hidden}</style></head><body>' + (project.mockHtml || '') + '</body></html>'); return;
  }
  if (req.url !== '/') { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'" });
  res.end(project.mockHtml ? renderProjectTemplate(project, css) : renderProjectDemo(project, 'alibi-project:' + (process.env.PROJECT_ID || project.title)));
}).listen(Number(process.env.PORT || 3000), '0.0.0.0');
