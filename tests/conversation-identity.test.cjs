const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');
const api = () => harness().load('web/lib/conversation-identity.ts');

test('self introductions recognize common forms and full Unicode names', () => {
  const { extractSelfIntroduction } = api();
  for (const [text, expected] of [
    ["I'm Harsh Anand. I built a CAD tool.", 'Harsh Anand'],
    ['I am Priya Shah, and I work on this app.', 'Priya Shah'],
    ['My name is José María García.', 'José María García'],
    ['Call me 李明.', '李明'],
    ['Hi, I’m Anne-Marie O’Neill.', "Anne-Marie O'Neill"],
    ['My name is harsh anand and I built this.', 'harsh anand'],
  ]) assert.equal(extractSelfIntroduction(text), expected, text);
});

test('roles, feelings, locations and third-person names do not become personal identity', () => {
  const { extractSelfIntroduction } = api();
  for (const text of ["I'm building a car marketplace.", "I am a developer.", "I'm from Toronto.", "I'm excited about this project.", "I'm working at Apple.", 'My friend is called Harsh.', 'Are you Harsh?', "I'm not Harsh."])
    assert.equal(extractSelfIntroduction(text), undefined, text);
});

test('latest explicit self-introduction wins over an earlier own-name statement', () => {
  const { extractSelfIntroduction, updateConversationIdentity } = api();
  assert.equal(extractSelfIntroduction('My name is Harsh. Actually, my name is Harsha Anand.'), 'Harsha Anand');
  let state = updateConversationIdentity(undefined, { text: "I'm Harsh." });
  state = updateConversationIdentity(state, { text: 'Actually, call me Harsha Anand.' });
  assert.equal(state.name, 'Harsha Anand');
});

test('an introduction survives unrelated later speech and a later project claim', () => {
  const { updateConversationIdentity } = api();
  let state = updateConversationIdentity(undefined, { text: "I'm Harsh Anand." });
  assert.equal(state.name, 'Harsh Anand');
  for (let i = 0; i < 160; i++) state = updateConversationIdentity(state, { text: 'Here is another detail about the product.' });
  state = updateConversationIdentity(state, { text: 'I built a car marketplace.' });
  assert.equal(state.name, 'Harsh Anand');
});

test('speaker-linked introductions resolve the builder rather than the first interviewer', () => {
  const { updateConversationIdentity } = api();
  let state = updateConversationIdentity(undefined, { text: "I'm Alex. What are you building?", speaker: 'S1', scope: 'stream-one' });
  assert.equal(state.name, undefined, 'an interviewer introduction must not immediately claim the portfolio');
  state = updateConversationIdentity(state, { text: 'My name is Priya Shah.', speaker: 'S2', scope: 'stream-one' });
  state = updateConversationIdentity(state, { text: 'I am building a CAD review tool.', speaker: 'S2', scope: 'stream-one' });
  assert.equal(state.name, 'Priya Shah');
  assert.equal(state.builderSpeaker, 'S2');
  state = updateConversationIdentity(state, { text: 'Actually, my name is Alex Lee.', speaker: 'S1', scope: 'stream-one' });
  assert.equal(state.name, 'Priya Shah');
  state = updateConversationIdentity(state, { text: 'Actually, call me Priya Patel.', speaker: 'S2', scope: 'stream-one' });
  assert.equal(state.name, 'Priya Patel');
});

test('speaker labels from a new stream do not inherit the previous person', () => {
  const { updateConversationIdentity } = api();
  let state = updateConversationIdentity(undefined, { text: "I'm Harsh. I built a car marketplace.", speaker: 'S1', scope: 'first-stream' });
  assert.equal(state.name, 'Harsh');
  state = updateConversationIdentity(state, { text: "I'm Alex. How does the car app work?", speaker: 'S1', scope: 'second-stream' });
  assert.equal(state.name, 'Harsh');
  assert.equal(state.builderSpeaker, undefined, 'a recycled S1 label is not verified as the builder');
  state = updateConversationIdentity(state, { text: 'I built it to compare dealer pricing.', speaker: 'S3', scope: 'second-stream' });
  assert.equal(state.name, 'Harsh', 'reconnecting without repeating an introduction must preserve canonical identity');
  assert.equal(state.builderSpeaker, 'S3');
});

test('questions and hypothetical project claims do not designate the builder', () => {
  const { updateConversationIdentity } = api();
  let state = updateConversationIdentity(undefined, { text: "I'm Alex. If I built an app like this, would it work?", speaker: 'S1', scope: 'one' });
  assert.equal(state.builderSpeaker, undefined);
  assert.equal(state.name, undefined);
  state = updateConversationIdentity(state, { text: "I'm Priya. I'm basically designing new earbuds.", speaker: 'S2', scope: 'one' });
  assert.equal(state.builderSpeaker, 'S2');
  assert.equal(state.name, 'Priya');
});

test('tagged transcript helper uses the same speaker-aware identity rules', () => {
  const { deriveConversationIdentity } = api();
  const state = deriveConversationIdentity('[S1] My name is Alex. What are you working on? [S2] I’m Harsh Anand. I built a CAD tool.');
  assert.equal(state.name, 'Harsh Anand');
  assert.equal(state.builderSpeaker, 'S2');
  assert.equal(deriveConversationIdentity("I'm Harsh Anand. I built a car app.").name, 'Harsh Anand');
});

test('reported self-introduction and quoted project claims do not take over identity', () => {
  const { extractSelfIntroduction, updateConversationIdentity } = api();
  assert.equal(extractSelfIntroduction('He said "I\'m John."'), undefined);
  const state = updateConversationIdentity(undefined, { text: 'My name is Alex. He said "I built a CAD tool."', speaker: 'S1', scope: 'one' });
  assert.equal(state.builderSpeaker, undefined);
  assert.equal(state.name, undefined);
});
