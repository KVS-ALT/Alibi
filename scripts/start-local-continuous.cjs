const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = process.argv[2] ? parseEnv(fs.readFileSync(path.resolve(process.argv[2]), 'utf8')) : process.env;
const keys = ['FEATHERLESS_API_KEY', 'SPEECHMATICS_API_KEY'];
const missing = keys.filter(name => !source[name]?.trim());
if (missing.length) throw new Error('Missing local provider configuration: ' + missing.join(', '));
const env = {};
for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'NUMBER_OF_PROCESSORS', 'OS', 'HOMEDRIVE', 'HOMEPATH']) {
  if (process.env[name]) env[name] = process.env[name];
}
for (const name of keys) env[name] = source[name];
Object.assign(env, { NODE_ENV: 'production', ALIBI_LOCAL_PROFILE: 'true', ALIBI_CONTINUOUS_CAPTURE: 'true',
  NEXT_TELEMETRY_DISABLED: '1', DATABASE_URL: '', LIVE_PROVIDER_CALLS_ENABLED: 'true', TEAM_LIVE_TEST_ENABLED: 'true',
  FEATHERLESS_MODEL: 'Qwen/Qwen2.5-7B-Instruct' });
const logs = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP, 'alibi-continuous-'));
const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3005'], {
  cwd: path.join(root, 'web'), env, windowsHide: true, detached: true,
  stdio: ['ignore', fs.openSync(path.join(logs, 'server.out.log'), 'a'), fs.openSync(path.join(logs, 'server.err.log'), 'a')],
});
child.unref();
console.log(JSON.stringify({ pid: child.pid, url: 'http://127.0.0.1:3005/', logs, continuousCapture: true }));
