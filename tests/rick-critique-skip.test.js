const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRick, makeSession, makeCritique, SCRIPT } = require('./helpers/rick-dom');

/**
 * Regression cover for docs/rick-critique-skip-ui-mismatch.md.
 *
 * Root cause: a render that runs while rickState.busy is true stamps
 * disabled=true on the controls it draws. Reviving them was the job of a
 * hand-maintained selector list in scrSetBusy, so any control missing from that
 * list stayed dead while the app looked idle. Skip was the visible casualty:
 * clicking it did nothing, with no error.
 *
 * The fix clears busy before rendering, so a finished turn can never draw a
 * disabled control in the first place. These tests pin that invariant rather
 * than the selector list, because the list is the part people forget.
 */

function withCritique() {
  return makeSession({
    stage: 'personalize',
    script: SCRIPT,
    selectedIdea: { index: 0, text: 'Idea 1' },
    critique: makeCritique(),
  });
}

test('a finished turn never renders while still busy', async () => {
  const rick = loadRick(withCritique());
  const { window } = rick;

  // Capture rickState.busy at the moment each render happens.
  const busyAtRender = [];
  const originalRender = window.scrRenderScript;
  window.scrRenderScript = function (...args) {
    busyAtRender.push(window.eval('rickState').busy);
    return originalRender.apply(this, args);
  };

  rick.setFetch(rick.reply(makeSession({ stage: 'personalize', script: SCRIPT, critique: null })));
  await window.scrSkipCritique();

  assert.ok(busyAtRender.length > 0, 'precondition: the turn should have rendered');
  assert.deepEqual(busyAtRender, busyAtRender.map(() => false),
    'a render while busy stamps disabled onto every control it draws, which is what stranded Skip');
});

test('skipping a critique returns the panel to its normal state', async () => {
  const rick = loadRick(withCritique());
  const { window } = rick;

  window.scrRenderScript();
  assert.ok(window.document.querySelector('.rick-critique-panel'), 'precondition: results panel is open');
  assert.equal(rick.button('Critique again')?.textContent, 'Critique again', 'precondition: footer offers Critique again');

  rick.setFetch(rick.reply(makeSession({ stage: 'personalize', script: SCRIPT, critique: null })));
  await window.scrSkipCritique();

  assert.equal(rick.state().activeSession.critique, null, 'the critique should be cleared');
  assert.equal(window.document.querySelector('.rick-critique-panel'), null, 'the results panel should close');
  assert.equal(rick.button('Skip'), undefined, 'Skip should no longer be offered');
  assert.equal(window.document.querySelector('[data-rick-critique-trigger]').textContent, 'Ask for Critique',
    'the footer should return to Ask for Critique');
  assert.deepEqual(rick.state().activeSession.script, SCRIPT, 'skipping must not touch the script');
});

test('the skip button is live after a critique arrives', async () => {
  const session = makeSession({ stage: 'personalize', script: SCRIPT, selectedIdea: { index: 0, text: 'Idea 1' } });
  const rick = loadRick(session);
  const { window } = rick;

  // The critique lands via a real turn, which is the sequence that used to
  // leave the panel's own buttons disabled once the turn completed.
  rick.setFetch(rick.reply({ ...session, critique: makeCritique() }));
  await window.scrRequestCritique();

  assert.equal(rick.state().busy, false);
  const panelButtons = [...window.document.querySelectorAll('.rick-critique-panel button')];
  assert.ok(panelButtons.length > 0, 'precondition: the results panel rendered');
  const dead = panelButtons.filter((b) => b.disabled).map((b) => b.textContent);
  assert.deepEqual(dead, [], `these critique controls were left dead on an idle app: ${dead.join(', ')}`);
});

test('skipping is a no-op when there is no critique', async () => {
  const rick = loadRick(makeSession({ stage: 'personalize', script: SCRIPT }));
  const { window } = rick;
  let called = false;
  rick.setFetch(async () => { called = true; return { ok: true, json: async () => ({ session: {} }) }; });

  await window.scrSkipCritique();

  assert.equal(called, false, 'skip should not call the server when there is nothing to skip');
  assert.deepEqual(rick.state().activeSession.script, SCRIPT);
});
