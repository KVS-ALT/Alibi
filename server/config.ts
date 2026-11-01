export interface RuntimeConfig {
 candidate: boolean;
 port: number;
 host: string;
 cookieName: string;
 secureCookies: boolean;
 liveCallsAllowed: boolean;
 renderLocal: boolean;
 generation: { provider: 'demo' | 'openai'; enabled: boolean; apiKey?: string; model: 'gpt-4.1-mini' | 'gpt-4.1' };
 speech: { provider: 'browser' | 'elevenlabs'; enabled: boolean; liveCallsAllowed: boolean; apiKey?: string; allowProviderLogging: boolean };
 email: { liveGate: boolean; enabled: boolean; apiKey?: string; inboxId?: string; allowedRecipients: string[]; outboxPath?: string };
}

/** Environment values never authorize network calls on their own. Candidate mode dominates every setting. */
export function readRuntimeConfig(env: Record<string, string | undefined>, args: readonly string[] = []): RuntimeConfig {
 const candidate = args.includes('--candidate');
 const liveCallsAllowed = !candidate && !args.includes('--no-live-providers') && args.includes('--allow-live-providers') && env.LIVE_PROVIDER_CALLS_ENABLED === 'true';
 const requestedPort = candidate ? args.find(arg => arg.startsWith('--candidate-port='))?.split('=')[1] ?? '3002' : env.PORT || '3001';
 const port = Number(requestedPort);
 if (!Number.isInteger(port) || port < 1 || port > 65535 || candidate && port === 3001) throw new Error('Invalid listen port. Candidate mode cannot use the live test port.');
 const generationProvider = env.GENERATION_PROVIDER || 'demo';
 const speechProvider = env.SPEECH_PROVIDER || 'browser';
 const model = env.OPENAI_MODEL || 'gpt-4.1-mini';
 if (!['demo', 'openai'].includes(generationProvider) || !['browser', 'elevenlabs'].includes(speechProvider) || !['gpt-4.1-mini', 'gpt-4.1'].includes(model)) throw new Error('Unsupported server provider or model configuration.');
 return {
  candidate, port,
  host: candidate ? '127.0.0.1' : env.HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  cookieName: candidate ? 'forme_candidate_owner' : 'larp_owner',
  secureCookies: !candidate && env.NODE_ENV === 'production',
  liveCallsAllowed,
  renderLocal: !candidate && env.RENDER_USE_LOCAL_DEV === 'true',
  generation: { provider: generationProvider as 'demo' | 'openai', enabled: liveCallsAllowed && generationProvider === 'openai', apiKey: env.OPENAI_API_KEY || undefined, model: model as RuntimeConfig['generation']['model'] },
  speech: { provider: speechProvider as 'browser' | 'elevenlabs', enabled: speechProvider === 'elevenlabs', liveCallsAllowed, apiKey: env.ELEVENLABS_API_KEY || undefined, allowProviderLogging: env.ELEVENLABS_ALLOW_LOGGING === 'true' },
  email: { liveGate: liveCallsAllowed && env.EMAIL_SEND_ENABLED === 'true', enabled: env.EMAIL_SEND_ENABLED === 'true', apiKey: env.AGENTBOXD_API_KEY || undefined, inboxId: env.AGENTBOXD_INBOX_ID || undefined, allowedRecipients: (env.EMAIL_ALLOWED_RECIPIENTS || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 10), outboxPath: liveCallsAllowed && env.EMAIL_SEND_ENABLED === 'true' ? env.EMAIL_OUTBOX_PATH || undefined : undefined },
 };
}

/** Public metadata deliberately excludes credentials, inbox IDs, recipient lists and private paths. */
export function publicProviderCapabilities(config: RuntimeConfig) {
 return {
  liveCallsEnabled: config.liveCallsAllowed,
  generation: { provider: config.generation.provider, configured: config.generation.provider === 'demo' || !!config.generation.apiKey, enabled: config.generation.provider === 'demo' || config.generation.enabled },
  speech: { provider: config.speech.provider, configured: config.speech.provider === 'browser' || !!config.speech.apiKey, enabled: config.speech.provider === 'browser' || config.speech.enabled && config.speech.liveCallsAllowed },
  email: { provider: 'agentboxd', configured: !!(config.email.apiKey && config.email.inboxId && config.email.allowedRecipients.length && config.email.outboxPath), enabled: config.email.liveGate },
 };
}
