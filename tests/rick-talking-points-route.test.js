const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const shared = require('../lib/shared');
const RickStore = require('../lib/rick-store');
const { ensureScriptVersions } = require('../lib/rick-engine');

test('talking points preserve the saved script and match the supplied scene plan', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-talking-points-'));
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
      hook: 'Stop losing viewers in the first three seconds.',
      body: 'Name their problem, then give one useful fix they can try today.',
      conclusion: 'That is how you make a short video worth watching.',
      cta: 'Follow for the next practical tip.',
      caption: 'Make every second count.',
    };
    const talkingPoints = {
      scenes: [
        { bullets: ['Stop losing viewers', 'First three seconds'] },
        { bullets: ['Name their problem', 'One useful fix today'] },
      ],
    };
    global.fetch = async (url, options) => {
      if (String(url) === 'https://api.openai.com/v1/responses') {
        providerRequest = JSON.parse(options.body);
        return new Response(JSON.stringify({ output_text: JSON.stringify(talkingPoints) }), {
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
    const sourceScenes = [
      { label: 'Hook', text: script.hook },
      { label: 'Body', text: script.body },
    ];
    const response = await fetch(`${origin}/api/scripter/sessions/${session.id}/teleprompter/talking-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: version.id, scenes: sourceScenes }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.versionId, version.id);
    assert.deepEqual(payload.scenes, talkingPoints.scenes);
    assert.match(providerRequest.input[0].content[0].text, /short talking-point cues/i);
    assert.deepEqual(store.get(session.id).script, script);
    assert.equal(store.get(session.id).scriptVersionId, version.id);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    global.fetch = nativeFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    Object.assign(shared, previousShared);
    delete require.cache[require.resolve('../routes/scripter')];
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.equal(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`), true);
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
});
