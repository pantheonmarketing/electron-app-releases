const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadRick, makeSession, SCRIPT } = require('./helpers/rick-dom');

test('record mode offers scene-by-scene and read-all-at-once choices', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf-8');
  assert.match(html, /data-recording-mode="scenes"/);
  assert.match(html, /data-recording-mode="continuous"/);
  assert.match(html, /Read all at once/);
  assert.match(html, /id="rickContinuousWpm"[^>]+min="60"[^>]+max="240"/);
  assert.match(html, /id="rickContinuousAutoStop"/);
  assert.match(html, /id="rickTeleprompterTextInput" maxlength="24000"/);
});

test('continuous mode joins every spoken scene into one full-script prompt', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const data = rick.window.scrContinuousTeleprompterData({
    versionId: 'v1',
    scenes: [
      { text: 'A hook' },
      { text: 'A body' },
      { text: 'A conclusion' },
      { text: 'Follow for more' },
    ],
  });

  assert.equal(data.layout, 'continuous');
  assert.equal(data.scenes.length, 1);
  assert.equal(data.scenes[0].text, 'A hook A body A conclusion Follow for more');
  assert.equal(data.scenes[0].wordCount, 9);
  assert.doesNotMatch(data.scenes[0].text, /caption/i);
});

test('continuous preferences are bounded and remembered locally', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const saved = rick.window.scrSaveTeleprompterPreferences({
    lastMode: 'continuous',
    continuous: { wpm: 999, fontSize: 5, opacity: 0, countdown: 8, autoStop: false, mirror: true },
  });

  assert.equal(saved.lastMode, 'continuous');
  assert.equal(saved.continuous.wpm, 240);
  assert.equal(saved.continuous.fontSize, 28);
  assert.equal(saved.continuous.opacity, 0.4);
  assert.equal(saved.continuous.countdown, 3);
  assert.equal(saved.continuous.autoStop, false);
  assert.equal(saved.continuous.mirror, true);
  assert.deepEqual(rick.window.scrLoadTeleprompterPreferences(), saved);
});

test('continuous recording uses the countdown path while scene mode starts immediately', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = rick.state().teleprompter;
  let countdownStarts = 0;
  let sceneStarts = 0;
  rick.window.scrStartContinuousCountdown = () => { countdownStarts += 1; };
  rick.window.scrStartSceneRecording = () => { sceneStarts += 1; };

  state.recordingMode = 'continuous';
  rick.window.scrToggleRecording();
  assert.equal(countdownStarts, 1);
  assert.equal(sceneStarts, 0);

  state.recordingMode = 'scenes';
  rick.window.scrToggleRecording();
  assert.equal(countdownStarts, 1);
  assert.equal(sceneStarts, 1);
});

test('recording route preserves continuous layout metadata', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'scripter.js'), 'utf-8');
  assert.match(route, /\['standard', 'easy', 'custom', 'continuous'\]/);
});
