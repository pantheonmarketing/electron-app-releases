const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadRick, makeSession, SCRIPT } = require('./helpers/rick-dom');

test('video length presets are available before recording and inside both teleprompter modes', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf-8');
  assert.match(html, /id="rickDurationStrip"/);
  assert.match(html, /class="rick-teleprompter-duration-controls"/);
  assert.equal((html.match(/data-rick-duration="short"/g) || []).length, 2);
  assert.equal((html.match(/data-rick-duration="standard"/g) || []).length, 2);
  assert.equal((html.match(/data-rick-duration="full"/g) || []).length, 2);
  assert.equal((html.match(/data-rick-duration="long"/g) || []).length, 2);
  assert.match(html, /scrFitScriptToDuration\(true\)/);
});

test('duration estimates count spoken words but never count the caption', () => {
  const rick = loadRick(makeSession({ script: SCRIPT, targetDuration: 'short' }));
  assert.equal(rick.window.scrScriptWordCount(SCRIPT), 9);
  assert.equal(rick.window.scrEstimatedScriptSeconds(SCRIPT, 135), 4);
  assert.equal(rick.window.scrScriptWordCount({ ...SCRIPT, caption: 'caption words '.repeat(100) }), 9);
});

test('the Fit action appears only when the current generated script misses its target', () => {
  const rick = loadRick(makeSession({ script: SCRIPT, targetDuration: 'short' }));
  const { document } = rick.window;
  const status = document.createElement('span');
  status.id = 'rickDurationStatus';
  const fit = document.createElement('button');
  fit.id = 'rickDurationFit';
  const short = document.createElement('button');
  short.dataset.rickDuration = 'short';
  const standard = document.createElement('button');
  standard.dataset.rickDuration = 'standard';
  document.body.append(status, fit, short, standard);

  rick.window.scrRenderDurationControls();
  assert.equal(short.classList.contains('active'), true);
  assert.equal(fit.hidden, false);
  assert.match(fit.textContent, /20s/);
  assert.match(status.textContent, /9 spoken words/);

  rick.state().activeSession.script = { hook: 'word '.repeat(45), body: '', conclusion: '', cta: '', caption: 'ignored' };
  rick.window.scrRenderDurationControls();
  assert.equal(fit.hidden, true);
  assert.match(status.textContent, /On target/);
});

test('choosing a preset saves it on the session without rewriting the script', async () => {
  const initial = makeSession({ script: SCRIPT, targetDuration: 'standard' });
  const next = { ...initial, targetDuration: 'full' };
  const rick = loadRick(initial);
  let request;
  rick.setFetch(async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ session: next }) };
  });

  await rick.window.scrChooseTargetDuration('full');
  assert.match(request.url, /\/duration$/);
  assert.equal(JSON.parse(request.options.body).targetDuration, 'full');
  assert.equal(rick.state().activeSession.targetDuration, 'full');
  assert.deepEqual(rick.state().activeSession.script, SCRIPT);
});
