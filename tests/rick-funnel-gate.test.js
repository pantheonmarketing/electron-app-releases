const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const shared = require('../lib/shared');
const RickStore = require('../lib/rick-store');
const { funnelChoicesFor } = require('../lib/rick-engine');
const { loadRick, makeSession } = require('./helpers/rick-dom');

/**
 * The funnel question.
 *
 * The stage decides what the ideas are, so it is asked once the brief is
 * settled and before any ideas exist. It used to be a toggle in the header
 * that defaulted to 'auto', which meant the machine answered a question the
 * user is meant to think about. Auto is now earned: it only appears once a
 * real stage has been chosen at least once.
 */

const CHOICES = [
  { id: 'tof', label: 'TOF', title: 'Get discovered', blurb: 'Reach new people who do not know you yet', last: false },
  { id: 'mof', label: 'MOF', title: 'Build trust', blurb: 'Win over people who are already interested', last: true },
  { id: 'bof', label: 'BOF', title: 'Get action', blurb: 'Turn warm people into customers', last: false },
];

const cards = (window) => [...window.document.querySelectorAll('.rick-funnel-choice')];

function gateSession(choices = CHOICES, funnel = null) {
  return makeSession({
    stage: 'brief',
    funnel,
    messages: [{
      id: 'm1', role: 'assistant', type: 'funnel',
      text: 'Got it: meal prep for nurses', funnelChoices: choices, createdAt: '',
    }],
  });
}

test('the question shows each stage with its acronym and its meaning', () => {
  const rick = loadRick(gateSession());
  rick.window.scrRenderMessages();

  assert.deepEqual(cards(rick.window).map((c) => c.dataset.funnelChoice), ['tof', 'mof', 'bof']);
  const tof = cards(rick.window)[0];
  // Both halves together: the acronym alone teaches nothing, the meaning alone
  // never teaches the vocabulary.
  assert.match(tof.textContent, /TOF/);
  assert.match(tof.textContent, /Get discovered/);
  assert.match(tof.textContent, /Reach new people/);
});

test('the previous choice is marked so repeating it is one tap', () => {
  const rick = loadRick(gateSession());
  rick.window.scrRenderMessages();
  const marked = cards(rick.window).filter((c) => c.textContent.includes('Last time'));
  assert.deepEqual(marked.map((c) => c.dataset.funnelChoice), ['mof']);
});

test('choosing a stage asks the server for ideas aimed at it', async () => {
  const session = gateSession();
  const rick = loadRick(session);
  const calls = [];
  rick.setFetch(async (url, options) => {
    calls.push({ url: String(url), body: options?.body ? JSON.parse(options.body) : null });
    if (String(url).endsWith('/sessions')) return { ok: true, json: async () => ({ sessions: [] }) };
    return { ok: true, json: async () => ({ session: { ...session, funnel: 'bof', stage: 'ideas' } }) };
  });

  rick.window.scrRenderMessages();
  cards(rick.window).find((c) => c.dataset.funnelChoice === 'bof').click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls[0].url, '/api/scripter/sessions/rick-1/funnel/choose');
  assert.equal(calls[0].body.funnel, 'bof');
  assert.equal(rick.state().activeSession.funnel, 'bof');
});

test('the question cannot be answered twice', async () => {
  const rick = loadRick(gateSession(CHOICES, 'tof'));
  let called = false;
  rick.setFetch(async () => { called = true; return { ok: true, json: async () => ({ session: {} }) }; });

  rick.window.scrRenderMessages();
  cards(rick.window).find((c) => c.dataset.funnelChoice === 'bof').click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(called, false, 'an answered question is a record, not a live control');
  const chosen = cards(rick.window).filter((c) => c.classList.contains('chosen'));
  assert.deepEqual(chosen.map((c) => c.dataset.funnelChoice), ['tof'], 'the answer stays visible');
});

/** Auto is earned. The first run through must teach the real choice. */
test('Auto is withheld until a real stage has been chosen once', () => {
  const session = { id: 'rick-new' };

  const firstEver = funnelChoicesFor(session, []);
  assert.deepEqual(firstEver.map((c) => c.id), ['tof', 'mof', 'bof'],
    'a first-ever session must make a real choice, with no machine default to hide behind');

  // A past session where the user only ever let Rick decide is not a choice.
  const onlyAuto = funnelChoicesFor(session, [{ id: 'rick-old', funnel: 'auto' }]);
  assert.deepEqual(onlyAuto.map((c) => c.id), ['tof', 'mof', 'bof']);

  const afterPicking = funnelChoicesFor(session, [{ id: 'rick-old', funnel: 'mof' }]);
  assert.deepEqual(afterPicking.map((c) => c.id), ['tof', 'mof', 'bof', 'auto'],
    'once they have chosen for real, Auto is available');
});

test('the most recent real choice is the one marked Last time', () => {
  // The session list arrives newest first.
  const choices = funnelChoicesFor({ id: 'rick-new' }, [
    { id: 'rick-2', funnel: 'bof' },
    { id: 'rick-1', funnel: 'tof' },
  ]);
  assert.deepEqual(choices.filter((c) => c.last).map((c) => c.id), ['bof']);
});

test('a session never counts its own choice as prior experience', () => {
  const choices = funnelChoicesFor({ id: 'rick-1' }, [{ id: 'rick-1', funnel: 'tof' }]);
  assert.deepEqual(choices.map((c) => c.id), ['tof', 'mof', 'bof'], 'Auto stays locked');
});

test('the funnel question rejects an unknown stage and an unfinished brief', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-funnel-gate-'));
  const previous = { BASE_DIR: shared.BASE_DIR, APP_DIR: shared.APP_DIR, LOGS_DIR: shared.LOGS_DIR };
  let server;
  try {
    shared.BASE_DIR = tempRoot;
    shared.APP_DIR = path.resolve(__dirname, '..');
    shared.LOGS_DIR = path.join(tempRoot, 'logs');
    delete require.cache[require.resolve('../routes/scripter')];
    const store = new RickStore(tempRoot);

    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/scripter'));
    server = await new Promise((resolve) => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const choose = (id, funnel) => fetch(`${origin}/api/scripter/sessions/${id}/funnel/choose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ funnel }),
    });

    const ready = store.create();
    ready.brief = { niche: 'meal prep', audience: 'nurses', contentType: 'quick tips' };
    store.save(ready);
    const bad = await choose(ready.id, 'sideways');
    assert.equal(bad.status, 400, 'a stage that is not offered is not a stage');
    assert.equal(store.get(ready.id).funnel, null, 'and nothing is written');

    // The question is meaningless before Rick knows what the video is about.
    const early = store.create();
    const tooSoon = await choose(early.id, 'tof');
    assert.equal(tooSoon.status, 400);
    assert.match((await tooSoon.json()).error, /topic audience and content type/i);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    Object.assign(shared, previous);
    delete require.cache[require.resolve('../routes/scripter')];
    const resolved = path.resolve(tempRoot);
    assert.equal(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), true);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
