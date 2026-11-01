import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PreviewState, UiSpec } from '../contracts';
import { validateUiSpec } from '../generation';
import { Preview } from '../ui/Preview';
import { mountStandalone } from './standalone';
import previewCss from '../ui/preview.css?raw';
import license from '../../LICENSE?raw';

const safeJson = (value: unknown) => JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
function requireValid(spec: UiSpec): UiSpec {
  const result = validateUiSpec(spec);
  if (!result.success) throw new Error('Export blocked: ' + result.error);
  return result.data;
}

/** The outer builder uses React; exported files contain only plain markup and JS. */
function screenMarkup(spec: UiSpec, screenId: string): string {
  const state: PreviewState = { sessionId: spec.sessionId, activeScreenId: screenId, values: {}, forms: {}, filters: {}, submitted: {} };
  return renderToStaticMarkup(createElement(Preview, { spec, state, onAction: () => {}, onFieldChange: () => {} }));
}
const stylesheet = 'body{margin:0}#app{min-height:100vh}\n' + previewCss;
function projectScript(): string {
  return '// Local demo interactions. No form data is sent to a server or database.\n' +
    '(' + mountStandalone.toString() + ')(JSON.parse(document.querySelector(\'script#prototype-config[type="application/json"]\').textContent));\n';
}
function renderDocument(spec: UiSpec, selfContained: boolean): string {
  const markup = spec.screens.map(screen => ({ id: screen.id, html: screenMarkup(spec, screen.id) }));
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Exported demo prototype</title>',
    selfContained ? '<style>' + stylesheet + '</style>' : '<link rel="stylesheet" href="./styles.css">',
    '</head><body><main id="app">' + markup[0].html + '</main>',
    ...markup.map(screen => '<template id="screen-' + screen.id + '">' + screen.html + '</template>'),
    '<script id="prototype-config" type="application/json">' + safeJson(spec) + '</script>',
    selfContained ? '<script>\n' + projectScript() + '</script>' : '<script src="./app.js" defer></script>',
    '</body></html>',
  ].join('\n');
}

/** Single-file HTML: no linked script, stylesheet, module loader, or network access. */
export function renderStandaloneHtml(input: UiSpec): string { return renderDocument(requireValid(input), true); }
/** Primary editable source entry point. Classic local scripts work from file://. */
export function renderProjectHtml(input: UiSpec): string { return renderDocument(requireValid(input), false); }

const readme = [
  '# Your plain HTML, CSS and JavaScript prototype',
  '',
  'Extract the ZIP and open index.html directly in a modern browser. No installation, package manager, framework, account, API key, local server, or build step is required. Keep index.html, styles.css, and app.js together. standalone.html is the same experience in one self-contained file.',
  '',
  '## Files',
  '',
  '- index.html: actual template markup, screen templates, and embedded configuration.',
  '- styles.css: the exact reviewed template stylesheet used by the preview.',
  '- app.js: plain JavaScript for navigation, search, category filters, browser form validation, and local confirmation messages.',
  '- configuration.json: the exact configuration snapshot used to produce this project.',
  '- config.json: a compatibility copy of configuration.json.',
  '- standalone.html: the complete HTML/CSS/JavaScript experience in one file.',
  '- ROADMAP.md: remaining product and integration work.',
  '',
  'The page uses embedded JSON so direct-open file:// browsing does not need to fetch a JSON file or load JavaScript modules. The export starts a fresh interaction session: preview form entries, filters, and receipts are not copied. Form details stay in memory and disappear on reload. All listings are synthetic demo data.',
  '',
  '## Editing',
  '',
  'Edit index.html, styles.css and app.js directly in a text editor. Screen markup is stored in the HTML template elements. Keep the embedded prototype-config JSON and screen/component identifiers aligned with any interaction changes. The separate JSON files are handoff snapshots: editing configuration.json alone does not regenerate visible markup or rewrite index.html. Request a new export from the builder when you want a complete regenerated project.',
  '',
  '## Persistence and server integration',
  '',
  'This export is not connected to Supabase or any database. Forms do not send email, charge money, book appointments, authenticate users, or create server records. It contains no provider, database admin, or service-role credentials.',
  '',
  'To add persistence, host the project over HTTPS and connect app.js to your authorized product server. The server must own credentials, authentication, database policies and validation. Never paste a service-role key, database password, or provider secret into these files. Add a connected-service claim only after that integration has actually been configured and tested.',
  '',
  'Review all generated copy and replace synthetic data before using this source as a product. Deployment and backend integration are not included.',
  '',
].join('\n');

export function createProjectFiles(input: UiSpec): Record<string, string> {
  const spec = requireValid(input), config = JSON.stringify(spec, null, 2);
  return {
    'index.html': renderDocument(spec, false),
    'styles.css': stylesheet,
    'app.js': projectScript(),
    'configuration.json': config,
    'config.json': config,
    'standalone.html': renderDocument(spec, true),
    'README.md': readme + '\nReviewed template: ' + spec.templateId + ' (version ' + spec.templateVersion + ').\n',
    'ROADMAP.md': '# Remaining roadmap\n\n- Review generated copy and replace synthetic data.\n- Verify accessibility and responsive layouts on target devices.\n- Connect forms to your authorized product server if persistence is required.\n- Keep database credentials, service-role keys and provider secrets on the server.\n- Add authentication, database policies, persistence, email delivery or payments only when configured and tested.\n- Test and deploy with your hosting provider. Deployment and backend integration are not included.\n',
    'LICENSE': license,
  };
}


function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Standard deterministic UTF-8 ZIP with stored members, readable by local unzip tools. */
export function createProjectArchive(spec: UiSpec): Uint8Array {
  const encoder = new TextEncoder(), chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  function header(size: number) { const a = new Uint8Array(size); return { a, v: new DataView(a.buffer) }; }
  for (const [name, source] of Object.entries(createProjectFiles(spec))) {
    const filename = encoder.encode(name), data = encoder.encode(source), crc = crc32(data), local = header(30);
    local.v.setUint32(0, 0x04034b50, true); local.v.setUint16(4, 20, true); local.v.setUint16(6, 0x0800, true); local.v.setUint16(12, 0x21, true);
    local.v.setUint32(14, crc, true); local.v.setUint32(18, data.length, true); local.v.setUint32(22, data.length, true); local.v.setUint16(26, filename.length, true);
    chunks.push(local.a, filename, data);
    const c = header(46);
    c.v.setUint32(0, 0x02014b50, true); c.v.setUint16(4, 20, true); c.v.setUint16(6, 20, true); c.v.setUint16(8, 0x0800, true); c.v.setUint16(14, 0x21, true);
    c.v.setUint32(16, crc, true); c.v.setUint32(20, data.length, true); c.v.setUint32(24, data.length, true); c.v.setUint16(28, filename.length, true); c.v.setUint32(42, offset, true);
    central.push(c.a, filename); offset += 30 + filename.length + data.length;
  }
  const centralSize = central.reduce((sum, c) => sum + c.length, 0), end = header(22);
  end.v.setUint32(0, 0x06054b50, true); end.v.setUint16(8, central.length / 2, true); end.v.setUint16(10, central.length / 2, true); end.v.setUint32(12, centralSize, true); end.v.setUint32(16, offset, true);
  chunks.push(...central, end.a);
  const output = new Uint8Array(offset + centralSize + 22);
  let position = 0;
  for (const part of chunks) { output.set(part, position); position += part.length; }
  return output;
}

function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadConfig(spec: UiSpec): void { download(JSON.stringify(requireValid(spec), null, 2), 'prototype-config.json', 'application/json'); }
export function downloadProject(spec: UiSpec): void { download(createProjectArchive(spec).slice().buffer, 'prototype-source.zip', 'application/zip'); }
export function downloadStandaloneHtml(spec: UiSpec): void { download(renderStandaloneHtml(spec), 'prototype.html', 'text/html'); }

