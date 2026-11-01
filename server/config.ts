export interface RuntimeConfig {
 candidate: boolean;
 port: number;
 host: string;
 cookieName: string;
 secureCookies: boolean;
 liveCallsAllowed: boolean;
 interactiveTest?: {token:string;expiresAt:number};
 approvedRequests: { generation: number; speechTokens: number; audioSeconds: number; email: number; database: number };
 renderLocal: boolean;
 generation: { provider: 'demo' | 'openai' | 'featherless'; enabled: boolean; apiKey?: string; model: string };
 speech: { provider: 'browser' | 'elevenlabs' | 'speechmatics'; enabled: boolean; liveCallsAllowed: boolean; apiKey?: string; allowProviderLogging: boolean };
 email: { liveGate: boolean; enabled: boolean; apiKey?: string; inboxId?: string; allowedRecipients: string[]; outboxPath?: string };
}

/** Environment values never authorize network calls on their own. Candidate mode dominates every setting. */
export function readRuntimeConfig(env: Record<string, string | undefined>, args: readonly string[] = []): RuntimeConfig {
 const candidate = args.includes('--candidate');
 const interactiveRequested=!candidate&&args.includes('--interactive-test');
 const expiresAt=Date.parse(env.INTERACTIVE_TEST_EXPIRES_AT??'');
 const interactiveTest=interactiveRequested&&/^[a-f0-9]{64}$/.test(env.INTERACTIVE_TEST_TOKEN??'')&&Number.isFinite(expiresAt)?{token:env.INTERACTIVE_TEST_TOKEN!,expiresAt}:undefined;
 if(interactiveRequested&&(!interactiveTest||expiresAt<=Date.now()||expiresAt>Date.now()+15*60*1000))throw new Error('Provide a private interactive test token and fixed UTC expiry within fifteen minutes.');
 const liveCallsAllowed = !candidate && !args.includes('--no-live-providers') && args.includes('--allow-live-providers') && env.LIVE_PROVIDER_CALLS_ENABLED === 'true';
 if(liveCallsAllowed&&env.NODE_ENV==='production'&&!interactiveTest)throw new Error('Public live usage requires an explicitly bounded interactive test grant.');
 const limit=(name:string,maximum:number)=>{const raw=args.find(arg=>arg.startsWith(`--approved-${name}=`))?.split('=')[1]??'0';const value=Number(raw);if(!Number.isSafeInteger(value)||value<0||value>maximum)throw new Error('Invalid approved provider request limit.');return liveCallsAllowed?value:0;};
 const approvedRequests={generation:limit('generation-requests',100),speechTokens:limit('speech-tokens',20),audioSeconds:limit('audio-seconds',600),email:limit('email-sends',10),database:limit('database-requests',100)};
 if(interactiveTest&&(approvedRequests.generation>3||approvedRequests.speechTokens>1||approvedRequests.audioSeconds>60||approvedRequests.email>0||approvedRequests.database>0))throw new Error('Interactive test exceeds the approved one-session allowance.');
 const requestedPort = candidate ? args.find(arg => arg.startsWith('--candidate-port='))?.split('=')[1] ?? '3002' : env.PORT || '3001';
 const port = Number(requestedPort);
 if (!Number.isInteger(port) || port < 1 || port > 65535 || candidate && port === 3001) throw new Error('Invalid listen port. Candidate mode cannot use the live test port.');
 const generationProvider = env.GENERATION_PROVIDER || 'demo';
 const speechProvider = env.SPEECH_PROVIDER || 'browser';
 if(interactiveTest&&(generationProvider!=='featherless'||speechProvider!=='speechmatics'))throw new Error('The approved interactive test uses Featherless and Speechmatics only.');
 const model = generationProvider==='featherless' ? env.FEATHERLESS_MODEL || '' : env.OPENAI_MODEL || 'gpt-6-sol';
 if (!['demo', 'openai', 'featherless'].includes(generationProvider) || !['browser', 'elevenlabs', 'speechmatics'].includes(speechProvider) || generationProvider!=='featherless'&&model!=='gpt-6-sol' || generationProvider==='featherless'&&model!==''&&model!=='Qwen/Qwen2.5-7B-Instruct') throw new Error('Unsupported server provider or model configuration.');
 return {
  candidate, port,
  host: candidate ? '127.0.0.1' : env.HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  cookieName: candidate ? 'forme_candidate_owner' : 'larp_owner',
  secureCookies: !candidate && env.NODE_ENV === 'production',
  liveCallsAllowed,approvedRequests,interactiveTest,
  renderLocal: !candidate && generationProvider === 'demo' && env.RENDER_USE_LOCAL_DEV === 'true',
  generation: { provider: generationProvider as RuntimeConfig['generation']['provider'], enabled: liveCallsAllowed && approvedRequests.generation>0 && generationProvider !== 'demo', apiKey: (generationProvider==='featherless'?env.FEATHERLESS_API_KEY:env.OPENAI_API_KEY) || undefined, model },
  speech: { provider: speechProvider as RuntimeConfig['speech']['provider'], enabled: speechProvider === 'elevenlabs' && approvedRequests.audioSeconds>0 || speechProvider === 'speechmatics' && env.SPEECHMATICS_ENABLED === 'true' && approvedRequests.speechTokens>0 && approvedRequests.audioSeconds>0, liveCallsAllowed, apiKey: (speechProvider === 'speechmatics' ? env.SPEECHMATICS_API_KEY : env.ELEVENLABS_API_KEY) || undefined, allowProviderLogging: env.ELEVENLABS_ALLOW_LOGGING === 'true' },
  email: { liveGate: liveCallsAllowed && approvedRequests.email>0 && env.EMAIL_SEND_ENABLED === 'true', enabled: env.EMAIL_SEND_ENABLED === 'true', apiKey: env.AGENTBOXD_API_KEY || undefined, inboxId: env.AGENTBOXD_INBOX_ID || undefined, allowedRecipients: (env.EMAIL_ALLOWED_RECIPIENTS || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 10), outboxPath: liveCallsAllowed && approvedRequests.email>0 && env.EMAIL_SEND_ENABLED === 'true' ? env.EMAIL_OUTBOX_PATH || undefined : undefined },
 };
}

/** Public metadata deliberately excludes credentials, inbox IDs, recipient lists and private paths. */
export function publicProviderCapabilities(config: RuntimeConfig) {
 return {
  liveCallsEnabled: config.liveCallsAllowed,
  generation: { provider: config.generation.provider, configured: config.generation.provider === 'demo' || !!(config.generation.apiKey&&config.generation.model), enabled: config.generation.provider === 'demo' || config.generation.enabled },
  speech: { provider: config.speech.provider, transport:config.speech.provider==='speechmatics'?'proxy':config.speech.provider==='elevenlabs'?'bounded':'browser', configured: config.speech.provider === 'browser' || !!config.speech.apiKey, enabled: config.speech.provider === 'browser' || config.speech.enabled && config.speech.liveCallsAllowed },
  email: { provider: 'agentboxd', configured: !!(config.email.apiKey && config.email.inboxId && config.email.allowedRecipients.length && config.email.outboxPath), enabled: config.email.liveGate },
 };
}
