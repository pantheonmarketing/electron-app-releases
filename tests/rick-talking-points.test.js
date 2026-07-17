const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadRick, makeSession, SCRIPT } = require('./helpers/rick-dom');

test('teleprompter offers full script and talking-point prompt styles', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const route = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'scripter.js'), 'utf-8');
  assert.match(html, /data-prompt-style="script"/);
  assert.match(html, /data-prompt-style="points"/);
  assert.match(html, /Short cues, speak naturally/);
  assert.match(route, /teleprompter\/talking-points/);
  assert.match(route, /Return exactly one result for every supplied scene/);
});

test('talking points are cached for the current teleprompter scene plan and never change the script text', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT, scriptVersionId: 'v1' }));
  const state = rick.state().teleprompter;
  state.open = true;
  state.sessionId = 'rick-1';
  state.scriptVersionId = 'v1';
  state.scenes = [
    { id: 'hook', label: 'Hook', text: 'Lead with the problem, then name the fix.' },
    { id: 'body', label: 'Body', text: 'Show one simple proof that makes the point believable.' },
  ];
  state.clips = [null, null];
  state.skipped = [false, false];
  const sourceText = state.scenes.map((scene) => scene.text);
  let request;
  rick.setFetch(async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        versionId: 'v1',
        scenes: [
          { bullets: ['Problem first', 'Name the fix'] },
          { bullets: ['One simple proof', 'Make it believable'] },
        ],
      }),
    };
  });

  await rick.window.scrSetPromptStyle('points');
  assert.match(request.url, /\/teleprompter\/talking-points$/);
  assert.equal(JSON.parse(request.options.body).scenes.length, 2);
  assert.equal(state.promptStyle, 'points');
  assert.deepEqual(state.scenes.map((scene) => scene.text), sourceText);
  assert.equal(rick.window.scrPromptTextForScene(0), '• Problem first\n\n• Name the fix');

  await rick.window.scrSetPromptStyle('script');
  assert.equal(state.promptStyle, 'script');
  assert.equal(rick.window.scrPromptTextForScene(0), sourceText[0]);
});

test('stale talking points cannot be shown after the source scene changes', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT, scriptVersionId: 'v1' }));
  const state = rick.state().teleprompter;
  state.scriptVersionId = 'v1';
  state.promptStyle = 'points';
  state.scenes = [{ id: 'hook', label: 'Hook', text: 'Original scene text.' }];
  state.talkingPoints = {
    key: rick.window.scrTalkingPointsKey(),
    scenes: [{ bullets: ['Original cue'] }],
  };
  state.scenes[0].text = 'Edited scene text.';
  assert.equal(rick.window.scrPromptTextForScene(0), 'Edited scene text.');
});
