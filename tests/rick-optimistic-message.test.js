const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRick, makeSession } = require('./helpers/rick-dom');

function response(body, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body };
}

test('a typed message appears immediately while Rick is still answering', async () => {
  const initial = makeSession({ messages: [] });
  const finished = makeSession({
    messages: [
      { role: 'user', text: 'Make the hook more specific' },
      { role: 'assistant', text: 'I tightened the hook around one clear result.' },
    ],
  });
  const rick = loadRick(initial);
  const { window } = rick;
  let finishRequest;
  const waitingResponse = new Promise((resolve) => { finishRequest = resolve; });
  rick.setFetch(async (url) => {
    if (String(url).endsWith('/message')) return waitingResponse;
    if (String(url).endsWith('/sessions')) return response({ sessions: [] });
    throw new Error(`Unexpected request: ${url}`);
  });

  const composer = window.document.getElementById('rickComposer');
  composer.value = 'Make the hook more specific';
  const sending = window.scrSendMessage();

  const pending = window.document.querySelector('[data-rick-pending-message="true"]');
  assert.ok(pending, 'the user bubble should render before the request finishes');
  assert.equal(pending.textContent, 'Make the hook more specific');
  assert.equal(composer.value, '');
  assert.equal(window.document.getElementById('rickThinking').classList.contains('visible'), true);
  assert.equal(rick.state().activeSession.messages.length, 0, 'optimistic UI should not mutate saved session data');

  finishRequest(response({ session: finished }));
  await sending;

  assert.equal(window.document.querySelector('[data-rick-pending-message="true"]'), null);
  const userMessages = [...window.document.querySelectorAll('.rick-message.user .rick-message-text')];
  assert.equal(userMessages.length, 1, 'the server copy should replace, not duplicate, the optimistic bubble');
  assert.equal(userMessages[0].textContent, 'Make the hook more specific');
  assert.match(window.document.getElementById('rickMessages').textContent, /I tightened the hook/);
});

test('a failed message leaves no ghost bubble and returns the text to the composer', async () => {
  const initial = makeSession({ messages: [] });
  const rick = loadRick(initial);
  const { window } = rick;
  let failRequest;
  const waitingResponse = new Promise((resolve) => { failRequest = resolve; });
  rick.setFetch(async () => waitingResponse);

  const composer = window.document.getElementById('rickComposer');
  composer.value = 'Keep this message safe';
  const sending = window.scrSendMessage();
  assert.ok(window.document.querySelector('[data-rick-pending-message="true"]'));

  failRequest(response({ error: 'Temporary provider problem', retryable: true }, false, 500));
  await sending;

  assert.equal(window.document.querySelector('[data-rick-pending-message="true"]'), null);
  assert.equal(composer.value, 'Keep this message safe');
  assert.match(window.document.getElementById('rickError').textContent, /Temporary provider problem/);
});
