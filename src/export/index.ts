import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PreviewState, UiSpec } from '../contracts';
import { validateUiSpec } from '../generation';
import { Preview } from '../ui/Preview';
import { mountStandalone } from './standalone';
import previewCss from '../ui/preview.css?raw';
import previewSource from '../ui/Preview.tsx?raw';
import templatesSource from '../templates/index.ts?raw';
import presentationSource from '../templates/presentation.ts?raw';
import contractsSource from '../contracts/index.ts?raw';
import appSource from './SourceApp.tsx?raw';
import license from '../../LICENSE?raw';
import manifest from '../../package.json';

const safeJson = (value: unknown) => JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
function requireValid(spec: UiSpec): UiSpec {
  const result = validateUiSpec(spec);
  if (!result.success) throw new Error('Export blocked: ' + result.error);
  return result.data;
}

/** Render the same React component used by the live preview, with no event state. */
function screenMarkup(spec: UiSpec, screenId: string): string {
  const state: PreviewState = { sessionId: spec.sessionId, activeScreenId: screenId, values: {}, forms: {}, filters: {}, submitted: {} };
  return renderToStaticMarkup(createElement(Preview, { spec, state, onAction: () => {}, onFieldChange: () => {} }));
}

export function renderStandaloneHtml(input: UiSpec): string {
  const spec = requireValid(input);
  const markup = spec.screens.map(screen => ({ id: screen.id, html: screenMarkup(spec, screen.id) }));
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Exported demo prototype</title>',
    '<style>body{margin:0}#app{min-height:100vh}' + previewCss + '</style></head><body>',
    '<main id="app">' + markup[0].html + '</main>',
    ...markup.map(screen => '<template id="screen-' + screen.id + '">' + screen.html + '</template>'),
    '<script id="prototype-config" type="application/json">' + safeJson(spec) + '</script>',
    '<script>\n(' + mountStandalone.toString() + ')(JSON.parse(document.getElementById("prototype-config").textContent));\n</script>',
    '</body></html>',
  ].join('\n');
}

const readme = [
  '# Your exported prototype',
  '',
  'Open index.html directly in a modern browser. It works offline with no installation, account, API key, or server.',
  '',
  'The standalone page contains the exact reviewed template markup and stylesheet used by the project preview, plus readable local JavaScript for navigation, search, category filters, browser form validation, and confirmation messages. The export starts a fresh interaction session: preview form entries, filters, and receipts are not copied. Form details stay in memory and disappear on reload. Nothing is sent to a server. All listings are synthetic demo data.',
  '',
  '## Editable React source',
  '',
  'The source/ folder is a complete Vite + React project with the actual Preview.tsx component, template catalog, presentation helper, stylesheet, typed contracts, local action adapter, and exact configuration used for this export. The root config.json is the same configuration for inspection or handoff.',
  '',
  'To develop it, install Node.js 22.12 or newer, then run:',
  '',
  '    cd source',
  '    npm install',
  '    npm run dev',
  '',
  'Edit source/config.json to change the source project; run npm run build to create source/dist/. Changes to a config.json file do not automatically rewrite the already exported standalone index.html. Generate another export from the builder or build the editable source when the configuration changes. Dependency installation requires an internet connection; opening the standalone page does not.',
  '',
  '## Demo limits',
  '',
  'This export does not send email, take payments, book appointments, authenticate users, or connect to a production backend. Review all copy and replace demo data before using the source as a product. See ROADMAP.md for the remaining work.',
  '',
].join('\n');

export function createProjectFiles(input: UiSpec): Record<string, string> {
  const spec = requireValid(input), config = JSON.stringify(spec, null, 2);
  return {
    'index.html': renderStandaloneHtml(spec),
    'config.json': config,
    'README.md': readme + '\nReviewed template: ' + spec.templateId + ' (version ' + spec.templateVersion + '). Generated with the Demo generator.\n',
    'ROADMAP.md': '# Remaining roadmap\n\n- Review generated copy and replace synthetic data.\n- Verify accessibility and responsive layouts on target devices.\n- Connect forms and actions to an authorized backend with server validation.\n- Add persistence, email delivery, authentication, or payments only if your product needs them.\n- Test and deploy with your hosting provider. Deployment is not included.\n',
    'LICENSE': license,
    'source/config.json': config,
    'source/package.json': JSON.stringify({
      name: 'exported-demo-prototype', version: '1.0.0', private: true, type: 'module',
      scripts: { dev: 'vite --host 127.0.0.1', build: 'tsc --noEmit && vite build', preview: 'vite preview --host 127.0.0.1' },
      dependencies: { react: manifest.dependencies.react, 'react-dom': manifest.dependencies['react-dom'] },
      devDependencies: { '@types/react': manifest.devDependencies['@types/react'], '@types/react-dom': manifest.devDependencies['@types/react-dom'], '@vitejs/plugin-react': manifest.devDependencies['@vitejs/plugin-react'], typescript: manifest.devDependencies.typescript, vite: manifest.devDependencies.vite },
    }, null, 2),
    'source/index.html': '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your demo prototype</title><style>body{margin:0}</style></head><body><main id="root"></main><script type="module" src="/src/main.tsx"></script></body></html>\n',
    'source/tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true }, include: ['src', 'vite.config.ts'] }, null, 2),
    'source/vite.config.ts': "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()], base: './' });\n",
    'source/src/main.tsx': "import { createElement } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { SourceApp } from './export/SourceApp';\nimport type { UiSpec } from './contracts';\nimport config from '../config.json';\ncreateRoot(document.getElementById('root')!).render(createElement(SourceApp, { spec: config as UiSpec }));\n",
    'source/src/export/SourceApp.tsx': appSource,
    'source/src/ui/Preview.tsx': previewSource,
    'source/src/ui/preview.css': previewCss,
    'source/src/templates/index.ts': templatesSource,
    'source/src/templates/presentation.ts': presentationSource,
    'source/src/contracts/index.ts': contractsSource,
    'source/LICENSE': license,
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

