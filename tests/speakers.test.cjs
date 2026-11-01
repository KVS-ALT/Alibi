const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

async function capture() {
  const h = harness();
  const { createSpeechmaticsProxy } = h.load('web/lib/speech/proxy.ts');
  const segments = [], sent = [], events = [];
  let socket;
  const proxy = createSpeechmaticsProxy({ enabled: true, liveCallsAllowed: true, continuousCapture: true }, {
    tokenProvider: { async issueToken() { return { ok: true, token: 'test-token', url: 'wss://eu.rt.speechmatics.com/v2/' }; }, cancelSession() {} },
    createSocket() { return socket = { readyState: 1, bufferedAmount: 0, send(data) { sent.push(JSON.parse(data)); }, close() {} }; },
    onSegment(segment) { segments.push(segment); },
  });
  const pending = proxy.start({ sessionId: 'conversation', consented: true });
  await new Promise(setImmediate);
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ message: 'RecognitionStarted' }) });
  const ready = await pending;
  proxy.subscribe({ sessionId: 'conversation', streamId: ready.streamId }, event => events.push(event));
  return { proxy, segments, sent, events, receive(message) { socket.onmessage({ data: JSON.stringify(message) }); } };
}
const word = (content, speaker, type = 'word') => ({ type, alternatives: [{ content, ...(speaker ? { speaker } : {}) }] });

test('capture supports three or more speaker labels without a two-person cap or duplicate finals', async () => {
  const c = await capture();
  assert.equal(c.sent[0].transcription_config.diarization, 'speaker');
  assert.equal(c.sent[0].transcription_config.speaker_diarization_config?.max_speakers, undefined);
  const message = { message: 'AddTranscript', metadata: { start_time: 0, end_time: 4, transcript: 'What did you build? A car marketplace. That sounds useful.' }, results: [
    word('What', 'S3'), word('did', 'S3'), word('you', 'S3'), word('build', 'S3'), word('?', undefined, 'punctuation'),
    word('A', 'S2'), word('car', 'S2'), word('marketplace', 'S2'), word('.', undefined, 'punctuation'),
    word('That', 'S1'), word('sounds', 'S1'), word('useful', 'S1'), word('.', undefined, 'punctuation'),
  ] };
  c.receive(message); c.receive(message);
  assert.deepEqual(c.segments.map(segment => [segment.speaker, segment.text]), [['S3', 'What did you build?'], ['S2', 'A car marketplace.'], ['S1', 'That sounds useful.']]);
  assert.equal(new Set(c.segments.map(segment => segment.segmentId)).size, 3);
  assert.equal(c.events.filter(event => event.type === 'segment').length, 3);
  c.proxy.dispose();
});

test('unknown speakers stay unknown and older metadata-only transcript responses remain usable', async () => {
  const c = await capture();
  c.receive({ message: 'AddTranscript', metadata: { start_time: 0, end_time: 1, transcript: 'A prototype.' }, results: [word('A', 'UU'), word('prototype', 'UU'), word('.', 'UU', 'punctuation')] });
  c.receive({ message: 'AddTranscript', metadata: { start_time: 1, end_time: 2, transcript: 'It compares dealer stock.' } });
  assert.equal(c.segments[0].speaker, 'UU');
  assert.equal(c.segments[0].text, 'A prototype.');
  assert.equal(c.segments[1].speaker, undefined);
  assert.equal(c.segments[1].text, 'It compares dealer stock.');
  c.proxy.dispose();
});

test('speaker changes within a provider message do not overwrite earlier turn IDs', async () => {
  const c = await capture();
  const data = { metadata: { start_time: 0, end_time: 3, transcript: 'Cars? Yes. Discounts?' }, results: [word('Cars', 'S2'), word('?', 'S2', 'punctuation'), word('Yes', 'S1'), word('.', 'S1', 'punctuation'), word('Discounts', 'S2'), word('?', 'S2', 'punctuation')] };
  c.receive({ message: 'AddPartialTranscript', ...data });
  const partials = c.events.filter(event => event.type === 'segment').map(event => event.segment);
  assert.equal(c.segments.length, 0, 'partial speech must not be ingested into generation');
  c.receive({ message: 'AddTranscript', ...data });
  assert.equal(c.segments.length, 3);
  assert.equal(new Set(c.segments.map(segment => segment.segmentId)).size, 3);
  assert.deepEqual(c.segments.map(segment => segment.segmentId), partials.map(segment => segment.segmentId));
  c.proxy.dispose();
});

test('browser transport preserves additional speaker labels and rejects malformed labels', async () => {
  const h = harness();
  const { createHttpSpeechmaticsProxyTransport } = h.load('web/lib/speech/client.ts');
  const received = []; let errors = 0, closed = false;
  const events = { close() { closed = true; } };
  const transport = createHttpSpeechmaticsProxyTransport(async () => new Response('{}'), () => events);
  const pending = transport.subscribe({ sessionId: 'conversation', streamId: 'stream' }, event => received.push(event), () => errors++, new AbortController().signal);
  events.onopen(); await pending;
  const segment = { sessionId: 'conversation', segmentId: 'turn-1', text: 'I built a car marketplace.', isFinal: true, speaker: 'S2' };
  events.onmessage({ data: JSON.stringify({ id: 'stream:1', type: 'segment', segment }) });
  assert.equal(received[0].segment.speaker, 'S2');
  events.onmessage({ data: JSON.stringify({ id: 'stream:2', type: 'segment', segment: { ...segment, speaker: 'S9' } }) });
  assert.equal(received[1].segment.speaker, 'S9');
  events.onmessage({ data: JSON.stringify({ id: 'stream:3', type: 'segment', segment: { ...segment, speaker: '<script>speaker</script>' } }) });
  assert.equal(received.length, 2);
  assert.equal(errors, 1);
  assert.equal(closed, true);
});
