const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadRick, makeSession, SCRIPT } = require('./helpers/rick-dom');

test('record mode offers Standard, Easy-read, and Custom layouts', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf-8');
  assert.match(html, /data-scene-layout="standard"/);
  assert.match(html, /data-scene-layout="easy"/);
  assert.match(html, /data-scene-layout="custom"/);
  assert.match(html, /Put a blank line wherever you want a new recording scene/i);
});

test('custom layout turns blank-line blocks into scenes and preserves the words', () => {
  const rick = loadRick(makeSession({ script: structuredClone(SCRIPT) }));
  const { document } = rick.window;
  const overlay = document.createElement('div');
  overlay.id = 'rickTeleprompter';
  overlay.innerHTML = `
    <div id="rickSceneBuilder"><textarea id="rickSceneBuilderText"></textarea><span id="rickSceneBuilderCount"></span><button id="rickUseCustomScenes"></button></div>
    <div id="rickTeleprompterSceneList"></div>
    <p id="rickTeleprompterPromptText"></p>
    <span id="rickTeleprompterSceneLabel"></span>
  `;
  document.body.append(overlay);
  const state = rick.state().teleprompter;
  Object.assign(state, {
    open: true,
    sceneLayout: 'standard',
    switchingLayout: false,
    scenes: [{ id: 'body-1', section: 'body', label: 'Body', text: 'First thought. Second thought. Final thought.', wordCount: 6 }],
    clips: [null],
    skipped: [false],
    activeIndex: 0,
    scriptVersions: [],
  });
  document.getElementById('rickSceneBuilderText').value = 'First thought.\n\nSecond thought.\n\nFinal thought.';

  assert.equal(rick.window.scrApplyCustomSceneLayout(), true);
  assert.equal(state.sceneLayout, 'custom');
  assert.deepEqual(Array.from(state.scenes, (scene) => scene.text), ['First thought.', 'Second thought.', 'Final thought.']);
  assert.equal(state.scenes.map((scene) => scene.text).join(' '), 'First thought. Second thought. Final thought.');
});
