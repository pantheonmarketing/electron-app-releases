const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const shared = require('../lib/shared');
const RickStore = require('../lib/rick-store');
const { ensureScriptVersions } = require('../lib/rick-engine');

test('Easy-read creates extra natural scenes without changing the saved script', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-easy-scenes-'));
  const previousShared = {
    BASE_DIR: shared.BASE_DIR,
    APP_DIR: shared.APP_DIR,
    LOGS_DIR: shared.LOGS_DIR,
    WHISPER_CACHE_DIR: shared.WHISPER_CACHE_DIR,
  };
  const previousKey = process.env.OPENAI_API_KEY;
  const nativeFetch = global.fetch;
  let server;
  let providerRequest;
  try {
    process.env.OPENAI_API_KEY = 'test-key';
    shared.BASE_DIR = tempRoot;
    shared.APP_DIR = path.resolve(__dirname, '..');
    shared.LOGS_DIR = path.join(tempRoot, 'logs');
    shared.WHISPER_CACHE_DIR = path.join(tempRoot, 'whisper');
    delete require.cache[require.resolve('../routes/scripter')];

    const script = {
      hook: 'Stop scrolling, this takes ten seconds.',
      body: 'Lead with the useful result. Then explain why it works.',
      conclusion: 'Clear beats make recording easier.',
      cta: 'Try it on your next video.',
      caption: 'A simpler way to record.',
    };
    const splitResult = { scenes: [
      { label: 'Stop the scroll', text: 'Stop scrolling, this takes ten seconds.' },
      { label: 'Lead with value', text: 'Lead with the useful result.' },
      { label: 'Explain it', text: 'Then explain why it works.' },
      { label: 'Make it easy', text: 'Clear beats make recording easier.' },
      { label: 'Try it', text: 'Try it on your next video.' },
    ] };

    global.fetch = async (url, options) => {
      if (String(url) === 'https://api.openai.com/v1/responses') {
        providerRequest = JSON.parse(options.body);
        return new Response(JSON.stringify({ output_text: JSON.stringify(splitResult) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return nativeFetch(url, options);
    };

    const store = new RickStore(tempRoot);
    const session = store.create();
    session.model = 'openai';
    session.script = structuredClone(script);
    const version = ensureScriptVersions(session)[0];
    store.save(session);

    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/scripter'));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/scripter/sessions/${session.id}/teleprompter/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: version.id, layout: 'easy' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.layout, 'easy');
    assert.equal(payload.scenes.length, 5);
    assert.equal(payload.scenes[2].text, splitResult.scenes[2].text);
    assert.match(providerRequest.input[0].content[0].text, /Preserve every word and punctuation mark exactly/i);
    assert.deepEqual(store.get(session.id).script, script);
    assert.equal(store.get(session.id).scriptVersionId, version.id);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    global.fetch = nativeFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    Object.assign(shared, previousShared);
    delete require.cache[require.resolve('../routes/scripter')];
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
