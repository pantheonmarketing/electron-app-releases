const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadRick, makeSession, SCRIPT } = require('./helpers/rick-dom');

const SCENES = [
  { id: 'hook-1', section: 'hook', label: 'Hook', text: 'Original hook text', wordCount: 3 },
  { id: 'body-1', section: 'body', label: 'Body', text: 'Original body text', wordCount: 3 },
];

function withEditor(rick) {
  const { document } = rick.window;
  const overlay = document.createElement('div');
  overlay.id = 'rickTeleprompter';
  overlay.innerHTML = `
    <div id="rickTeleprompterSceneList"></div>
    <div id="rickTeleprompterCopy">
      <button id="rickTeleprompterEditText"><span>Edit</span></button>
      <p id="rickTeleprompterPromptText"></p>
      <div id="rickTeleprompterTextEditor" hidden>
        <textarea id="rickTeleprompterTextInput"></textarea>
      </div>
    </div>
    <span id="rickTeleprompterSceneLabel"></span>
    <span id="rickTeleprompterStatus"></span>
    <span id="rickTeleprompterHeadStatus"></span>
    <button id="rickTeleprompterRecordBtn"><strong></strong></button>
    <button id="rickPreviousScene"></button>
    <button id="rickNextScene"></button>
  `;
  document.body.append(overlay);
  const state = rick.state().teleprompter;
  Object.assign(state, {
    open: true,
    sessionId: 'rick-1',
    scenes: structuredClone(SCENES),
    clips: [null, null],
    skipped: [false, false],
    activeIndex: 0,
    editingSceneIndex: null,
    scriptVersions: [],
    scriptVersionId: null,
    switchingVersion: false,
    outputReady: false,
    combining: false,
    stream: {},
  });
  return { state, overlay, input: document.getElementById('rickTeleprompterTextInput') };
}

test('the teleprompter ships an inline scene text editor', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf-8');
  assert.match(html, /id="rickTeleprompterEditText"/);
  assert.match(html, /id="rickTeleprompterTextInput"/);
  assert.match(html, /scrSaveTeleprompterTextEdit/);
  assert.match(html, /scrCancelTeleprompterTextEdit/);
});

test('editing a scene updates the prompt but not the main script', () => {
  const session = makeSession({ script: structuredClone(SCRIPT) });
  const rick = loadRick(session);
  const { state, overlay, input } = withEditor(rick);

  rick.window.scrBeginTeleprompterTextEdit();
  assert.equal(state.editingSceneIndex, 0);
  assert.equal(input.value, 'Original hook text');
  assert.equal(overlay.querySelector('#rickTeleprompterTextEditor').hidden, false);

  input.value = 'A clearer opening, with punctuation.\n\nAnd a second beat.';
  assert.equal(rick.window.scrSaveTeleprompterTextEdit(), true);

  assert.equal(state.scenes[0].text, 'A clearer opening, with punctuation.\n\nAnd a second beat.');
  assert.equal(state.scenes[0].wordCount, 9);
  assert.equal(state.editingSceneIndex, null);
  assert.deepEqual(rick.state().activeSession.script, SCRIPT, 'the saved script and its versions stay untouched');
  assert.equal(overlay.querySelector('#rickTeleprompterPromptText').textContent, state.scenes[0].text);
});

test('saving changed words removes only that scene take after confirmation', () => {
  const rick = loadRick(makeSession({ script: structuredClone(SCRIPT) }));
  const { state, input } = withEditor(rick);
  const clip = { blob: {}, url: 'blob:old-take', durationMs: 5000 };
  state.clips[0] = clip;
  state.clips[1] = { blob: {}, url: 'blob:other-take', durationMs: 7000 };
  const revoked = [];
  rick.window.URL.revokeObjectURL = (url) => revoked.push(url);

  rick.window.scrBeginTeleprompterTextEdit();
  input.value = 'Changed words for this take';
  rick.window.confirm = () => false;
  assert.equal(rick.window.scrSaveTeleprompterTextEdit(), false);
  assert.equal(state.clips[0], clip, 'declining keeps the recorded take');
  assert.equal(state.scenes[0].text, 'Original hook text');

  rick.window.confirm = () => true;
  assert.equal(rick.window.scrSaveTeleprompterTextEdit(), true);
  assert.equal(state.clips[0], null, 'the mismatched take is removed');
  assert.ok(state.clips[1], 'other scene takes are untouched');
  assert.deepEqual(revoked, ['blob:old-take']);
});

test('text editing cannot open during a recording', () => {
  const rick = loadRick(makeSession({ script: structuredClone(SCRIPT) }));
  const { state } = withEditor(rick);
  state.recorder = { state: 'recording' };

  rick.window.scrBeginTeleprompterTextEdit();

  assert.equal(state.editingSceneIndex, null);
});

test('deleting the selected scene removes its take and renumbers what remains', () => {
  const session = makeSession({ script: structuredClone(SCRIPT) });
  const rick = loadRick(session);
  const { state, overlay } = withEditor(rick);
  state.clips[0] = { blob: {}, url: 'blob:deleted-scene', durationMs: 4000 };
  state.clips[1] = { blob: {}, url: 'blob:kept-scene', durationMs: 5000 };
  const revoked = [];
  rick.window.URL.revokeObjectURL = (url) => revoked.push(url);
  rick.window.confirm = () => true;

  rick.window.scrRenderTeleprompter();
  assert.equal(overlay.querySelectorAll('.rick-scene-delete').length, 2);
  assert.equal(overlay.querySelector('.rick-scene-row.active .rick-scene-delete').getAttribute('aria-label'), 'Delete scene 1');
  assert.equal(rick.window.scrDeleteTeleprompterScene(0), true);

  assert.equal(state.scenes.length, 1);
  assert.equal(state.scenes[0].text, 'Original body text');
  assert.equal(state.clips.length, 1);
  assert.equal(state.clips[0].url, 'blob:kept-scene');
  assert.deepEqual(revoked, ['blob:deleted-scene']);
  assert.match(overlay.querySelector('#rickTeleprompterSceneList').textContent, /Scene 1/);
  assert.doesNotMatch(overlay.querySelector('#rickTeleprompterSceneList').textContent, /Scene 2/);
  assert.deepEqual(rick.state().activeSession.script, SCRIPT, 'deleting a recording scene does not rewrite the saved script');
});

test('the last recording scene cannot be deleted', () => {
  const rick = loadRick(makeSession({ script: structuredClone(SCRIPT) }));
  const { state } = withEditor(rick);
  state.scenes = [structuredClone(SCENES[0])];
  state.clips = [null];
  state.skipped = [false];
  rick.window.confirm = () => true;

  assert.equal(rick.window.scrDeleteTeleprompterScene(0), false);
  assert.equal(state.scenes.length, 1);
});

test('merging recorded scenes joins their text and clears only those takes', () => {
  const session = makeSession({ script: structuredClone(SCRIPT) });
  const rick = loadRick(session);
  const { state, overlay } = withEditor(rick);
  state.clips[0] = { blob: {}, url: 'blob:first-take', durationMs: 4000 };
  state.clips[1] = { blob: {}, url: 'blob:second-take', durationMs: 5000 };
  const revoked = [];
  rick.window.URL.revokeObjectURL = (url) => revoked.push(url);

  rick.window.scrRenderTeleprompter();
  assert.equal(overlay.querySelector('.rick-scene-row.active .rick-scene-merge').getAttribute('aria-label'), 'Merge scene 1 with scene 2');
  rick.window.confirm = () => false;
  assert.equal(rick.window.scrMergeTeleprompterScene(0, 'next'), false);
  assert.equal(state.scenes.length, 2, 'declining keeps both scenes and takes');

  rick.window.confirm = () => true;
  assert.equal(rick.window.scrMergeTeleprompterScene(0, 'next'), true);
  assert.equal(state.scenes.length, 1);
  assert.equal(state.scenes[0].text, 'Original hook text\n\nOriginal body text');
  assert.equal(state.clips.length, 1);
  assert.equal(state.clips[0], null);
  assert.deepEqual(revoked, ['blob:first-take', 'blob:second-take']);
  assert.match(overlay.querySelector('#rickTeleprompterSceneList').textContent, /Scene 1/);
  assert.doesNotMatch(overlay.querySelector('#rickTeleprompterSceneList').textContent, /Scene 2/);
  assert.deepEqual(rick.state().activeSession.script, SCRIPT, 'merging recording scenes does not rewrite the saved script');
});

test('selecting the last scene merges it with the previous scene and renumbers the list', () => {
  const rick = loadRick(makeSession({ script: structuredClone(SCRIPT) }));
  const { state, overlay } = withEditor(rick);
  state.scenes = Array.from({ length: 10 }, (_, index) => ({
    id: `easy-${index + 1}`,
    section: 'easy',
    label: `Beat ${index + 1}`,
    text: `Words for scene ${index + 1}.`,
    wordCount: 4,
  }));
  state.clips = new Array(10).fill(null);
  state.skipped = new Array(10).fill(false);
  state.activeIndex = 9;
  state.sceneLayout = 'easy';

  assert.equal(rick.window.scrMergeTeleprompterScene(9, 'previous'), true);
  assert.equal(state.scenes.length, 9);
  assert.equal(state.activeIndex, 8);
  assert.equal(state.scenes[8].text, 'Words for scene 9.\n\nWords for scene 10.');
  assert.match(overlay.querySelector('#rickTeleprompterSceneList').textContent, /Scene 9/);
  assert.doesNotMatch(overlay.querySelector('#rickTeleprompterSceneList').textContent, /Scene 10/);
});
