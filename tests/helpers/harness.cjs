const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

// Execute production TypeScript with only external I/O replaced. No live providers.
function harness(overrides = {}, env = {}) {
  const cache = new Map(), timers = new Map(); let timerId = 0;
  const context = vm.createContext({ console, Buffer, URL, Request, Response, TextEncoder, TextDecoder,
    AbortController, AbortSignal, DOMException, Uint8Array, structuredClone,
    process: { env }, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); } });
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === 'server-only') return {};
      if (name === '@alibi/shared') return load('shared/schema.ts');
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
      return require(name);
    };
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.compileFunction(output, ['require', 'module', 'exports'], { parsingContext: context, filename })(localRequire, module, module.exports);
    return module.exports;
  }
  return { load, timers, async tick() { const jobs = [...timers.values()]; timers.clear(); for (const job of jobs) job.fn(); await new Promise(setImmediate); } };
}

module.exports = { harness };
