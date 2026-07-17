const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const shared = require('../lib/shared');
const RickStore = require('../lib/rick-store');

test('critique routes validate critic count and skip without changing the script', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-critique-route-'));
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

    const store = new RickStore(tempRoot);
    const session = store.create();
    session.stage = 'personalize';
    session.script = {
      hook: 'A useful hook',
      body: 'A clear body',
      conclusion: 'A focused conclusion',
      cta: 'Follow for the next lesson',
      caption: 'A useful caption.',
    };
    session.critique = {
      criticCount: 1,
      critics: [],
      summary: 'Tighten the opening',
      improvements: ['Lead with proof'],
      disagreements: [],
      applied: false,
    };
    store.save(session);
    const originalScript = structuredClone(session.script);

    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/scripter'));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;

    const invalid = await fetch(`${origin}/api/scripter/sessions/${session.id}/critique`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criticCount: 4 }),
    });
    assert.equal(invalid.status, 400);

    const skipped = await fetch(`${origin}/api/scripter/sessions/${session.id}/critique/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(skipped.status, 200);
    const payload = await skipped.json();
    assert.equal(payload.session.critique, null);
    assert.deepEqual(payload.session.script, originalScript);
    assert.deepEqual(store.get(session.id).script, originalScript);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    Object.assign(shared, previous);
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.equal(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`), true);
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
});

test('applying critique improvements stores the prior script and restore brings it back', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-critique-restore-'));
  const previous = {
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
      hook: 'The original hook',
      body: 'The original body',
      conclusion: 'The original conclusion',
      cta: 'The original call to action',
      caption: 'The original caption.',
    };
    const improvedScript = {
      reply: 'Applied the strongest improvements',
      hook: 'The improved hook',
      body: 'The improved body',
      conclusion: 'The improved conclusion',
      cta: 'The improved call to action',
      caption: 'The improved caption.',
    };
    global.fetch = async (url, options) => {
      if (String(url) === 'https://api.openai.com/v1/responses') {
        return new Response(JSON.stringify({ output_text: JSON.stringify(improvedScript) }), {
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
    session.critique = {
      criticCount: 1,
      critics: [],
      summary: 'Tighten the opening',
      improvements: ['Lead with proof'],
      disagreements: [],
      applied: false,
    };
    store.save(session);

    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/scripter'));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;

    const applied = await fetch(`${origin}/api/scripter/sessions/${session.id}/critique/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(applied.status, 200);
    const appliedPayload = await applied.json();
    assert.equal(appliedPayload.session.script.hook, 'The improved hook');
    assert.equal(appliedPayload.session.scriptHistory.length, 1);
    assert.deepEqual(appliedPayload.session.scriptHistory[0].script, originalScript);
    assert.equal(appliedPayload.session.scriptHistory[0].source, 'critique');

    const restored = await fetch(`${origin}/api/scripter/sessions/${session.id}/critique/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(restored.status, 200);
    const restoredPayload = await restored.json();
    assert.deepEqual(restoredPayload.session.script, originalScript);
    assert.deepEqual(restoredPayload.session.scriptHistory, []);
    assert.equal(restoredPayload.session.critique, null);
    assert.deepEqual(store.get(session.id).script, originalScript);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    global.fetch = nativeFetch;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    Object.assign(shared, previous);
    delete require.cache[require.resolve('../routes/scripter')];
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.equal(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`), true);
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
});

test('restore rejects sessions without script history and leaves the script unchanged', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-critique-no-history-'));
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

    const store = new RickStore(tempRoot);
    const session = store.create();
    session.script = {
      hook: 'Current hook',
      body: 'Current body',
      conclusion: 'Current conclusion',
      cta: 'Current CTA',
      caption: 'Current caption',
    };
    delete session.scriptHistory;
    store.save(session);
    const originalScript = structuredClone(session.script);

    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/scripter'));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;

    const response = await fetch(`${origin}/api/scripter/sessions/${session.id}/critique/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /no previous script version/i);
    assert.deepEqual(store.get(session.id).script, originalScript);
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
