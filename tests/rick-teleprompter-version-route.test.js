const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const shared = require('../lib/shared');
const RickStore = require('../lib/rick-store');
const { addScriptVersion, ensureScriptVersions } = require('../lib/rick-engine');

test('teleprompter can read any script version without switching the working draft', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-teleprompter-version-'));
  const previous = {
    BASE_DIR: shared.BASE_DIR,
    APP_DIR: shared.APP_DIR,
    LOGS_DIR: shared.LOGS_DIR,
    WHISPER_CACHE_DIR: shared.WHISPER_CACHE_DIR,
  };
  let server;
  try {
    shared.BASE_DIR = tempRoot;
    shared.APP_DIR = path.resolve(__dirname, '..');
    shared.LOGS_DIR = path.join(tempRoot, 'logs');
    shared.WHISPER_CACHE_DIR = path.join(tempRoot, 'whisper');
    delete require.cache[require.resolve('../routes/scripter')];

    const firstScript = {
      hook: 'First hook,\nwith a pause.',
      body: 'First body.',
      conclusion: 'First conclusion.',
      cta: 'Follow for the first version.',
      caption: 'First caption.',
    };
    const currentScript = {
      hook: 'Adjusted hook,\n\nwith a longer pause.',
      body: 'Adjusted body.',
      conclusion: 'Adjusted conclusion.',
      cta: 'Follow, for the adjusted version.',
      caption: 'Adjusted caption.',
    };
    const store = new RickStore(tempRoot);
    const session = store.create();
    session.script = structuredClone(firstScript);
    const firstVersion = ensureScriptVersions(session)[0];
    session.script = structuredClone(currentScript);
    const currentVersion = addScriptVersion(session, 'revision');
    store.save(session);

    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/scripter'));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const endpoint = `${origin}/api/scripter/sessions/${session.id}/teleprompter`;

    const currentResponse = await fetch(endpoint);
    assert.equal(currentResponse.status, 200);
    const currentPayload = await currentResponse.json();
    assert.equal(currentPayload.versionId, currentVersion.id);
    assert.equal(currentPayload.scenes[0].text, currentScript.hook);
    assert.deepEqual(currentPayload.versions.map((version) => version.number), [1, 2]);

    const firstResponse = await fetch(`${endpoint}?versionId=${encodeURIComponent(firstVersion.id)}`);
    assert.equal(firstResponse.status, 200);
    const firstPayload = await firstResponse.json();
    assert.equal(firstPayload.versionId, firstVersion.id);
    assert.equal(firstPayload.scenes[0].text, firstScript.hook);

    const missingResponse = await fetch(`${endpoint}?versionId=missing-version`);
    assert.equal(missingResponse.status, 400);
    assert.deepEqual(store.get(session.id).script, currentScript);
    assert.equal(store.get(session.id).scriptVersionId, currentVersion.id);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    Object.assign(shared, previous);
    delete require.cache[require.resolve('../routes/scripter')];
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.equal(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`), true);
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
});
