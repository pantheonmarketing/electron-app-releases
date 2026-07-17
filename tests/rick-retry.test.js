const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const shared = require('../lib/shared');
const router = require('../routes/scripter');

/**
 * Rick's Retry button rests on two server promises:
 * a failed AI turn reports a friendly error flagged retryable, and it is never
 * saved. If the second one breaks, retrying starts duplicating conversation.
 */

const APP_ROOT = path.join(__dirname, '..');
const TECHNICAL = /exited with code|ENOENT|spawn|fetch failed|ECONN|stack|undefined/i;

/**
 * Boots the real scripter routes against a throwaway store with no AI provider
 * reachable, so every AI call fails the same way on any machine.
 */
async function startRick() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-retry-'));
  fs.mkdirSync(path.join(tempRoot, 'logs'), { recursive: true });

  const originalPath = process.env.PATH;
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.PATH = tempRoot; // no claude or codex binary is reachable here
  shared.BASE_DIR = tempRoot;
  shared.APP_DIR = APP_ROOT;
  shared.LOGS_DIR = path.join(tempRoot, 'logs');

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/scripter`;

  const read = async (response) => ({ status: response.status, body: await response.json() });

  return {
    get: (route) => fetch(base + route).then(read),
    post: (route, body) => fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(read),
    async stop() {
      server.close();
      await once(server, 'close');
      process.env.PATH = originalPath;
      if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      const resolvedTemp = path.resolve(tempRoot);
      assert.equal(resolvedTemp.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), true);
      fs.rmSync(resolvedTemp, { recursive: true, force: true });
    },
  };
}

test('a failed AI turn is reported in plain language and flagged retryable', async () => {
  const rick = await startRick();
  try {
    const { body: created } = await rick.post('/sessions');
    const failed = await rick.post(`/sessions/${created.session.id}/message`, {
      message: 'vegan meal prep for busy nurses',
    });

    assert.equal(failed.status, 500);
    assert.equal(failed.body.retryable, true);
    assert.equal(TECHNICAL.test(failed.body.error), false, `error leaked internals: ${failed.body.error}`);
    assert.ok(failed.body.error.length > 0);
  } finally {
    await rick.stop();
  }
});

test('a failed AI turn is never persisted so retrying cannot duplicate it', async () => {
  const rick = await startRick();
  try {
    const { body: created } = await rick.post('/sessions');
    const id = created.session.id;
    const opening = created.session.messages.length;

    // Three attempts stands in for a first failure plus two Retry clicks.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await rick.post(`/sessions/${id}/message`, { message: 'vegan meal prep for busy nurses' });
    }

    const { body: stored } = await rick.get(`/sessions/${id}`);
    assert.equal(stored.session.messages.length, opening);
    assert.equal(stored.session.stage, 'brief');
    assert.equal(stored.session.script, null);
  } finally {
    await rick.stop();
  }
});

test('rejected requests are not offered as retryable', async () => {
  const rick = await startRick();
  try {
    const { body: created } = await rick.post('/sessions');
    const id = created.session.id;

    // Bad input and wrong stage are the user's to fix, so Retry must stay hidden.
    const noIdea = await rick.post(`/sessions/${id}/build`, { ideaIndex: 0 });
    assert.equal(noIdea.status, 400);
    assert.equal(noIdea.body.retryable, undefined);

    const noScript = await rick.post(`/sessions/${id}/revise`, { section: 'hook' });
    assert.equal(noScript.status, 400);
    assert.equal(noScript.body.retryable, undefined);

    const empty = await rick.post(`/sessions/${id}/message`, { message: '   ' });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.retryable, undefined);
  } finally {
    await rick.stop();
  }
});
