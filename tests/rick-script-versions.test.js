const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRick, makeSession, makeCritique, SCRIPT } = require('./helpers/rick-dom');

/**
 * The script version picker.
 *
 * Replaces the earlier "← Restore previous script" control, which popped the
 * newest entry off a history stack. That could only ever go back one step, and
 * going back destroyed the thing you came from. These tests pin the properties
 * that made it worth replacing: every version stays reachable, and moving
 * between them costs nothing and loses nothing.
 */

const IMPROVED = {
  hook: 'An improved hook', body: 'An improved body', conclusion: 'An improved conclusion',
  cta: 'An improved call to action', caption: 'An improved caption.',
};

const V1 = { id: 'script-version-1', number: 1, source: 'original', script: SCRIPT, createdAt: '2026-07-17T00:00:00.000Z' };
const V2 = { id: 'script-version-2', number: 2, source: 'critique', script: IMPROVED, createdAt: '2026-07-17T00:01:00.000Z' };

function versioned(overrides = {}) {
  return makeSession({
    stage: 'personalize',
    script: IMPROVED,
    scriptVersions: [V1, V2],
    scriptVersionId: V2.id,
    ...overrides,
  });
}

const chips = (window) => [...window.document.querySelectorAll('.rick-version-chip')];

test('every version gets a chip and the open one is marked', () => {
  const rick = loadRick(versioned());
  rick.window.scrRenderScript();

  assert.deepEqual(chips(rick.window).map((c) => c.textContent), ['v1', 'v2']);
  const active = chips(rick.window).filter((c) => c.classList.contains('active'));
  assert.deepEqual(active.map((c) => c.textContent), ['v2'], 'only the open version is marked');
  assert.equal(active[0].getAttribute('aria-pressed'), 'true');
});

test('the first draft is labelled v1 before any revision exists', () => {
  const rick = loadRick(versioned({ scriptVersions: [V1], scriptVersionId: V1.id, script: SCRIPT }));
  rick.window.scrRenderScript();
  assert.deepEqual(chips(rick.window).map((c) => c.textContent), ['v1']);
  assert.equal(chips(rick.window)[0].classList.contains('active'), true);
});

test('clicking an older chip opens that version without losing the newer one', async () => {
  const rick = loadRick(versioned());
  const { window } = rick;
  const calls = [];
  const switched = versioned({ script: SCRIPT, scriptVersionId: V1.id, critique: null });
  rick.setFetch(async (url, options) => {
    calls.push({ url: String(url), body: options?.body ? JSON.parse(options.body) : null });
    if (String(url).endsWith('/sessions')) return { ok: true, json: async () => ({ sessions: [] }) };
    return { ok: true, json: async () => ({ session: switched }) };
  });

  window.scrRenderScript();
  chips(window).find((c) => c.textContent === 'v1').click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls[0].url, '/api/scripter/sessions/rick-1/script/version');
  assert.equal(calls[0].body.versionId, V1.id);
  assert.deepEqual(rick.state().activeSession.script, SCRIPT, 'v1 is now the working draft');
  assert.equal(rick.state().activeSession.scriptVersions.length, 2, 'v2 must survive so the user can go forward again');
  assert.deepEqual(chips(window).map((c) => c.textContent), ['v1', 'v2']);
  assert.deepEqual(
    chips(window).filter((c) => c.classList.contains('active')).map((c) => c.textContent),
    ['v1'],
  );
});

test('clicking the version already open does not call the server', async () => {
  const rick = loadRick(versioned());
  const { window } = rick;
  let called = false;
  rick.setFetch(async () => { called = true; return { ok: true, json: async () => ({ session: {} }) }; });

  window.scrRenderScript();
  chips(window).find((c) => c.textContent === 'v2').click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(called, false, 'reopening the current version is a no-op');
  assert.deepEqual(rick.state().activeSession.script, IMPROVED);
});

test('an unknown version id never reaches the server', async () => {
  const rick = loadRick(versioned());
  let called = false;
  rick.setFetch(async () => { called = true; return { ok: true, json: async () => ({ session: {} }) }; });

  await rick.window.scrSelectScriptVersion('script-version-gone');

  assert.equal(called, false);
  assert.deepEqual(rick.state().activeSession.script, IMPROVED);
});

test('the applied critique no longer carries its own restore action', () => {
  const rick = loadRick(versioned({ critique: makeCritique({ applied: true }) }));
  rick.window.scrRenderScript();

  assert.equal(rick.button('← Restore previous script'), undefined,
    'going back is the version picker\'s job, so a second control would drift out of step');
  assert.ok(rick.window.document.querySelector('.rick-critique-panel.results'), 'the critique itself still renders');
});

test('version chips are live again after a turn', () => {
  const rick = loadRick(versioned());
  const { window } = rick;

  window.scrSetBusy(true, 'working');
  window.scrRenderScript();
  assert.deepEqual(chips(window).map((c) => c.disabled), [true, true], 'chips are inert mid turn');

  window.scrSetBusy(false);
  assert.deepEqual(chips(window).map((c) => c.disabled), [false, false], 'and must not stay dead afterwards');
});
