const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const shared = require('../lib/shared');
const RickStore = require('../lib/rick-store');

test('a chat revision updates the script verbatim and creates the next version', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-revision-route-'));
  const previousShared = {
    BASE_DIR: shared.BASE_DIR,
    APP_DIR: shared.APP_DIR,
    LOGS_DIR: shared.LOGS_DIR,
    WHISPER_CACHE_DIR: shared.WHISPER_CACHE_DIR,
  };
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const nativeFetch = global.fetch;
  let server;
  try {
    process.env.OPENAI_API_KEY = 'test-key';
    shared.BASE_DIR = tempRoot;
    shared.APP_DIR = path.resolve(__dirname, '..');
    shared.LOGS_DIR = path.join(tempRoot, 'logs');
    shared.WHISPER_CACHE_DIR = path.join(tempRoot, 'whisper');
    delete require.cache[require.resolve('../routes/scripter')];

    const originalScript = {
      hook: 'You do not need another productivity system',
      body: 'You need one place to decide what matters today',
      conclusion: 'Clarity makes the work lighter',
      cta: 'Try it for one week',
      caption: 'A calmer way to plan your work.',
    };
    const revisedResult = {
      reply: 'Added light commas and line breaks so it is easier to scan.',
      hook: 'You do not need another productivity system, you need clarity.',
      body: 'Pick the one thing that matters today.\n\nThen, make the next step obvious.',
      conclusion: 'Less noise, more progress.',
      cta: 'Try it for one week, and see what changes.',
      caption: 'A calmer way to plan your work.',
    };

    global.fetch = async (url, options) => {
      if (String(url) === 'https://api.openai.com/v1/responses') {
        return new Response(JSON.stringify({ output_text: JSON.stringify(revisedResult) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return nativeFetch(url, options);
    };

    const store = new RickStore(tempRoot);
    const session = store.create();
    session.model = 'openai';
    session.stage = 'personalize';
    session.script = structuredClone(originalScript);
    // Simulate a session saved before script versioning shipped.
    delete session.scriptVersions;
    delete session.scriptVersionId;
    store.save(session);

    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/scripter'));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;

    const response = await fetch(`${origin}/api/scripter/sessions/${session.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Add light commas and line breaks' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.deepEqual(payload.session.script, {
      hook: revisedResult.hook,
      body: revisedResult.body,
      conclusion: revisedResult.conclusion,
      cta: revisedResult.cta,
      caption: revisedResult.caption,
    });
    assert.deepEqual(payload.session.scriptVersions.map((version) => version.number), [1, 2]);
    assert.deepEqual(payload.session.scriptVersions[0].script, originalScript);
    assert.deepEqual(payload.session.scriptVersions[1].script, payload.session.script);
    assert.equal(payload.session.scriptVersionId, payload.session.scriptVersions[1].id);
    assert.deepEqual(store.get(session.id).script, payload.session.script);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    global.fetch = nativeFetch;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    Object.assign(shared, previousShared);
    delete require.cache[require.resolve('../routes/scripter')];
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.equal(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`), true);
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
});
