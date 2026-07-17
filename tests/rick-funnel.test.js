const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRick, makeSession, SCRIPT } = require('./helpers/rick-dom');

/**
 * Behaviour checks for the funnel controls.
 *
 * The bug these exist for: a render that runs while rickState.busy is true
 * stamps disabled=true on the controls it draws, and reviving them used to
 * depend on a hand-maintained selector list in scrSetBusy. Anything missing
 * from that list stayed dead until a page refresh while still looking
 * clickable. See also tests/rick-critique-skip.test.js.
 */

test('funnel buttons are re-enabled after a turn that rendered while busy', () => {
  const rick = loadRick(makeSession());
  const { window } = rick;

  // Reproduces the real sequence: busy -> render (stamps disabled) -> not busy.
  window.scrSetBusy(true, 'working');
  window.scrRenderFunnel();
  assert.deepEqual(rick.funnelButtons().map((b) => b.disabled), [true, true, true, true],
    'funnel should be disabled while Rick is working');

  window.scrSetBusy(false);
  assert.deepEqual(rick.funnelButtons().map((b) => b.disabled), [false, false, false, false],
    'funnel must not stay disabled after the turn finishes');
});

test('every control a render disables while busy is re-enabled by scrSetBusy', () => {
  const rick = loadRick(makeSession({ stage: 'personalize', script: SCRIPT, selectedIdea: { index: 0, text: 'Idea' } }));
  const { window } = rick;

  window.scrSetBusy(true, 'working');
  window.scrRenderFunnel();
  window.scrRenderScript();
  window.eval('rickState').funnelRewrite = { sessionId: 'rick-1', funnel: 'bof' };
  window.scrRenderScript();

  const rendered = [...window.document.querySelectorAll('button')].filter((b) => b.disabled);
  assert.ok(rendered.length > 0, 'expected the busy render to disable something');

  window.scrSetBusy(false);
  const stuck = [...window.document.querySelectorAll('button')]
    .filter((b) => b.disabled)
    .map((b) => b.className || b.dataset.funnel || b.textContent);
  assert.deepEqual(stuck, [], `these controls stayed disabled after the turn: ${stuck.join(', ')}`);
});

test('the header cannot be used to skip the funnel question', () => {
  // Before the question is answered there is nothing to change, and a live Auto
  // button here would let someone bypass the choice without ever making it.
  const rick = loadRick(makeSession({ stage: 'brief', funnel: null }));
  rick.window.scrRenderFunnel();

  assert.deepEqual(rick.funnelButtons().map((b) => b.disabled), [true, true, true, true]);
  assert.equal(rick.window.document.getElementById('rickFunnel').classList.contains('unchosen'), true);
});

test('the header becomes live once a stage has been chosen', () => {
  const rick = loadRick(makeSession({ stage: 'ideas', funnel: 'tof' }));
  rick.window.scrRenderFunnel();

  assert.deepEqual(rick.funnelButtons().map((b) => b.disabled), [false, false, false, false]);
  assert.deepEqual(
    rick.funnelButtons().filter((b) => b.classList.contains('active')).map((b) => b.dataset.funnel),
    ['tof'],
  );
});

test('changing the stage from the header still works after the choice', async () => {
  const session = makeSession({ stage: 'ideas', funnel: 'tof' });
  const rick = loadRick(session);
  let patched = null;
  rick.setFetch(async (url, options) => {
    patched = { url: String(url), body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ session: { ...session, funnel: 'bof' } }) };
  });

  await rick.window.scrSetFunnel('bof');

  assert.match(patched.url, /\/funnel$/);
  assert.equal(patched.body.funnel, 'bof');
  assert.equal(rick.state().activeSession.funnel, 'bof');
});

test('changing the stage under a finished script offers a rewrite instead of acting alone', async () => {
  const session = makeSession({ stage: 'personalize', script: SCRIPT, selectedIdea: { index: 0, text: 'Idea' } });
  const rick = loadRick(session);
  const { window } = rick;
  const calls = [];

  rick.setFetch(async (url) => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ session: { ...session, funnel: 'bof' } }) };
  });

  await window.scrSetFunnel('bof');

  // The stage change alone must not spend a turn rewriting the user's draft.
  assert.equal(calls.length, 1, 'changing the stage should only PATCH the funnel');
  assert.match(calls[0], /\/funnel$/);
  // Compared field by field: rickState lives in the jsdom realm, so deepEqual
  // would fail the cross-realm prototype check.
  assert.equal(rick.state().funnelRewrite.sessionId, 'rick-1');
  assert.equal(rick.state().funnelRewrite.funnel, 'bof');

  const offer = window.document.querySelector('.rick-funnel-rewrite');
  assert.ok(offer, 'a rewrite action should be offered');
  assert.match(offer.textContent, /Rewrite for BOF/);
  assert.match(offer.textContent, /Keep as is/);
});

test('dismissing the rewrite offer leaves the script untouched', async () => {
  const session = makeSession({ stage: 'personalize', script: SCRIPT, selectedIdea: { index: 0, text: 'Idea' } });
  const rick = loadRick(session);
  const { window } = rick;
  rick.setFetch(rick.reply({ ...session, funnel: 'bof' }));

  await window.scrSetFunnel('bof');
  const keep = [...window.document.querySelectorAll('.rick-funnel-rewrite button')]
    .find((b) => b.textContent === 'Keep as is');
  keep.click();

  assert.equal(rick.state().funnelRewrite, null);
  assert.equal(window.document.querySelector('.rick-funnel-rewrite'), null);
  assert.deepEqual(rick.state().activeSession.script, SCRIPT);
});

test('switching sessions drops a pending rewrite offer', async () => {
  const session = makeSession({ stage: 'personalize', script: SCRIPT, selectedIdea: { index: 0, text: 'Idea' } });
  const rick = loadRick(session);
  const { window } = rick;
  rick.setFetch(rick.reply({ ...session, funnel: 'bof' }));

  await window.scrSetFunnel('bof');
  assert.ok(rick.state().funnelRewrite, 'precondition: an offer is pending');

  rick.setFetch(rick.reply(makeSession({ id: 'rick-2' })));
  await window.scrOpenSession('rick-2');

  assert.equal(rick.state().funnelRewrite, null, 'an offer must not leak across sessions');
});
