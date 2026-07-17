const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadRick, makeSession, SCRIPT } = require('./helpers/rick-dom');

/**
 * Re-record replaces the selected take, and the total duration is what a creator
 * checks against a platform limit before posting. Both read teleprompter clip
 * state, so they are pinned together. No MediaRecorder is involved — jsdom has
 * none — so the recording start is observed through a stub.
 */

const SCENES = [
  { id: 'hook-1', section: 'hook', label: 'Hook', text: 'a', wordCount: 1 },
  { id: 'body-1', section: 'body', label: 'Body', text: 'b', wordCount: 1 },
  { id: 'cta-1', section: 'cta', label: 'Call to action', text: 'c', wordCount: 1 },
];

/** A teleprompter mid-session: two takes recorded, one scene skipped. */
function withTakes(rick) {
  const state = rick.state().teleprompter;
  Object.assign(state, {
    open: true,
    sessionId: 'rick-1',
    scenes: SCENES,
    clips: [
      { blob: {}, url: 'blob:one', durationMs: 4000 },
      { blob: {}, url: 'blob:two', durationMs: 11000 },
      null,
    ],
    skipped: [false, false, true],
    activeIndex: 2,
    outputReady: false,
    stream: {}, // pretend the camera is live so no media rebuild is needed
  });
  rick.window.URL.revokeObjectURL = () => {};
  return state;
}

test('the Re-record control sits to the left of the Record button', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const bar = html.slice(html.indexOf('class="rick-camera-controls"'));
  const rerecord = bar.indexOf('id="rickRerecordBtn"');
  const record = bar.indexOf('id="rickTeleprompterRecordBtn"');

  assert.ok(rerecord > -1, 'a Re-record control should exist');
  assert.ok(rerecord < record, 'Re-record must come before the Record button');
  assert.match(bar.slice(rerecord - 90, record), /type="button"/, 'it must be an explicit button type');
  assert.match(bar.slice(rerecord, record), />Re-record</, 'it needs readable text, not an icon alone');
  assert.match(bar.slice(rerecord, record), /scrRerecordSelectedScene/, 'it must target the selected scene');
});

test('re-record restarts the selected scene and preserves every other take', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  state.activeIndex = 1;
  let startOptions = null;
  rick.window.scrStartSceneRecording = (options) => { startOptions = options; };
  rick.window.confirm = () => true;

  await rick.window.scrRerecordSelectedScene();

  assert.equal(state.clips.filter(Boolean).length, 2, 'other takes stay available while the replacement records');
  assert.deepEqual([...state.skipped], [false, false, true], 'other scene decisions are preserved');
  assert.equal(state.activeIndex, 1, 'recording restarts from the selected scene');
  assert.equal(state.outputReady, false);
  assert.equal(startOptions?.stayOnScene, true, 'the replacement must remain on its selected scene');
});

test('declining the re-record confirmation keeps every take', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  state.activeIndex = 1;
  let started = 0;
  rick.window.scrStartSceneRecording = () => { started += 1; };
  rick.window.confirm = () => false;

  await rick.window.scrRerecordSelectedScene();

  assert.equal(state.clips.filter(Boolean).length, 2, 'takes must survive a declined confirm');
  assert.equal(state.activeIndex, 1, 'the active scene must not move');
  assert.equal(started, 0, 'nothing should start recording');
});

/**
 * A MediaRecorder stand-in modelling the hazard a restart has to survive: the
 * real onstop writes the finished take into state.clips[activeIndex], and it
 * fires asynchronously — after a restart has already cleared the clips. Left
 * attached, the abandoned take could overwrite the replacement that starts next.
 *
 * Throwing from onstop would not work as a signal: scrDiscardActiveRecorder
 * wraps stop() in a try/catch, which would swallow it.
 */
function fakeRecorder(state) {
  return {
    state: 'recording',
    stopped: 0,
    onstopCalls: 0,
    ondataavailable: () => {},
    onerror: () => {},
    onstop() {
      this.onstopCalls += 1;
      state.clips[state.activeIndex] = { blob: {}, url: '', durationMs: 9999 };
    },
    stop() {
      this.stopped += 1;
      this.state = 'inactive';
      const handler = this.onstop;
      if (handler) setTimeout(() => handler.call(this), 0);
    },
  };
}

/** Lets any surviving onstop fire, the way a real MediaRecorder would. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('re-record stops an in-progress take and restarts the selected scene', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  const recorder = fakeRecorder(state);
  state.recorder = recorder;
  state.activeIndex = 1;
  state.chunks = [{}];
  // A stand-in id: clearInterval on it is harmless, and a real interval left
  // running would hold jsdom open and hang the run instead of failing.
  state.timerId = 999999;
  let started = 0;
  rick.window.scrStartSceneRecording = () => { started += 1; };
  rick.window.confirm = () => true;

  await rick.window.scrRerecordSelectedScene();
  await settle();

  assert.equal(recorder.stopped, 1, 'the in-flight take should be stopped');
  assert.equal(recorder.onstopCalls, 0, 'onstop must be detached before stop, or the take resurrects');
  assert.equal(state.recorder, null, 'the abandoned recorder is dropped');
  assert.equal(state.timerId, null, 'its timer must not keep ticking');
  assert.equal(state.clips.filter(Boolean).length, 2, 'existing takes remain intact until a replacement succeeds');
  assert.equal(state.activeIndex, 1, 'recording restarts at the selected scene');
  assert.equal(started, 1, 'a fresh take begins immediately');
});

test('re-record during recording still asks before discarding', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  const recorder = fakeRecorder(state);
  state.recorder = recorder;
  let started = 0;
  rick.window.scrStartSceneRecording = () => { started += 1; };
  rick.window.confirm = () => false;

  await rick.window.scrRerecordSelectedScene();

  assert.equal(recorder.stopped, 0, 'a declined confirm must not stop the take');
  assert.equal(state.clips.filter(Boolean).length, 2, 'takes must survive');
  assert.equal(started, 0);
});

test('delete all takes clears every scene and returns to the first', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  state.activeIndex = 1;
  let started = 0;
  rick.window.scrStartSceneRecording = () => { started += 1; };
  rick.window.confirm = () => true;

  await rick.window.scrDeleteAllTakes();

  assert.deepEqual([...state.clips], [null, null, null], 'every take is discarded');
  assert.deepEqual([...state.skipped], [false, false, false], 'skips reset too');
  assert.equal(state.activeIndex, 0, 'back to the first scene');
  assert.equal(state.outputReady, false);
  // Clearing the decks should not open the camera before the creator re-frames.
  assert.equal(started, 0, 'starting over must not begin recording on its own');
});

test('delete all takes stops a take in progress without letting it resurrect', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  const recorder = fakeRecorder(state);
  state.recorder = recorder;
  state.activeIndex = 1;
  state.timerId = 999999;
  rick.window.scrStartSceneRecording = () => {};
  rick.window.confirm = () => true;

  await rick.window.scrDeleteAllTakes();
  await settle();

  assert.equal(recorder.stopped, 1, 'the in-flight take is stopped');
  assert.equal(recorder.onstopCalls, 0, 'onstop must be detached, or the abandoned take returns');
  assert.equal(state.recorder, null);
  assert.equal(state.timerId, null, 'its timer must not keep ticking');
  assert.deepEqual([...state.clips], [null, null, null], 'nothing survives, including the abandoned take');
});

test('declining the delete all confirmation keeps every take', async () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  rick.window.confirm = () => false;

  await rick.window.scrDeleteAllTakes();

  assert.equal(state.clips.filter(Boolean).length, 2, 'takes must survive a declined confirm');
  assert.deepEqual([...state.skipped], [false, false, true], 'skips must survive too');
  assert.equal(state.activeIndex, 2, 'the active scene must not move');
});

/** Builds the control DOM scrRenderTeleprompter reads, and returns it by id. */
function withControls(rick) {
  const { document } = rick.window;
  const overlay = document.createElement('div');
  overlay.id = 'rickTeleprompter';
  const ids = ['rickRerecordBtn', 'rickRetakeScene', 'rickPreviousScene', 'rickNextScene', 'rickSkipScene', 'rickCombineVideo', 'rickDeleteAllTakes'];
  const controls = {};
  for (const id of ids) {
    const button = document.createElement('button');
    button.id = id;
    overlay.append(button);
    controls[id] = button;
  }
  document.body.append(overlay);
  return controls;
}

test('delete all takes is offered whenever there is anything to clear, and not before', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  const controls = withControls(rick);

  rick.window.scrRenderTeleprompter();
  assert.equal(controls.rickDeleteAllTakes.disabled, false, 'takes exist, so starting over is offered');

  // Mid-take with nothing saved: it stops the take, so it stays live.
  Object.assign(state, { clips: [null, null, null], skipped: [false, false, false], recorder: { state: 'recording' } });
  rick.window.scrRenderTeleprompter();
  assert.equal(controls.rickDeleteAllTakes.disabled, false, 'a take in progress is still something to clear');

  // A fresh session with nothing running: it would be a no-op.
  state.recorder = null;
  rick.window.scrRenderTeleprompter();
  assert.equal(controls.rickDeleteAllTakes.disabled, true, 'nothing to clear means nothing to offer');

  state.combining = true;
  state.clips = [{ blob: {}, url: '', durationMs: 1000 }, null, null];
  rick.window.scrRenderTeleprompter();
  assert.equal(controls.rickDeleteAllTakes.disabled, true, 'never mid-combine');
});

test('re-record stays live during a take while the other controls lock', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  const controls = withControls(rick);
  state.recorder = { state: 'recording' };

  rick.window.scrRenderTeleprompter();

  assert.equal(controls.rickRerecordBtn.disabled, false, 'Re-record must stay clickable mid-take');
  // Everything else must still lock, or a take can be corrupted underneath it.
  assert.equal(controls.rickRetakeScene.disabled, true);
  assert.equal(controls.rickPreviousScene.disabled, true);
  assert.equal(controls.rickNextScene.disabled, true);
  assert.equal(controls.rickSkipScene.disabled, true);
  assert.equal(controls.rickCombineVideo.disabled, true);
});

test('re-record is offered for the selected take, not another scene', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  const controls = withControls(rick);

  state.activeIndex = 1;
  state.outputReady = false;
  rick.window.scrRenderTeleprompter();
  assert.equal(controls.rickRerecordBtn.disabled, false, 'the selected scene has a take');

  state.activeIndex = 2;
  rick.window.scrRenderTeleprompter();
  assert.equal(controls.rickRerecordBtn.disabled, true, 'a take on another scene must not activate this button');

  state.combining = true;
  state.activeIndex = 1;
  rick.window.scrRenderTeleprompter();
  assert.equal(controls.rickRerecordBtn.disabled, true, 'never mid-combine');
});

test('recording again stays on the selected scene after the replacement finishes', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);
  state.activeIndex = 1;
  state.outputReady = false;
  rick.window.URL.createObjectURL = () => 'blob:replacement';

  class FakeMediaRecorder {
    constructor() {
      this.state = 'inactive';
      this.mimeType = 'video/webm';
      FakeMediaRecorder.instance = this;
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new rick.window.Blob(['replacement'], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  FakeMediaRecorder.isTypeSupported = () => true;
  rick.window.MediaRecorder = FakeMediaRecorder;

  rick.window.scrStartSceneRecording();
  FakeMediaRecorder.instance.stop();

  assert.equal(state.activeIndex, 1, 'a replacement must not wrap back to scene one');
  assert.equal(state.clips[0].durationMs, 4000, 'the earlier scene remains untouched');
  assert.equal(state.clips[1].url, 'blob:replacement');
});

test('total recorded duration sums the clips and ignores skipped scenes', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const state = withTakes(rick);

  assert.equal(rick.window.scrTotalRecordedMs(state), 15000, '4s + 11s, with the skipped scene adding nothing');

  state.clips[0] = null; // removing a take lowers the total
  assert.equal(rick.window.scrTotalRecordedMs(state), 11000);

  state.clips = [null, null, null];
  assert.equal(rick.window.scrTotalRecordedMs(state), 0, 'a restarted session is back to zero');
});

test('the total duration label renders next to the recording controls', () => {
  const rick = loadRick(makeSession({ script: SCRIPT }));
  const { document } = rick.window;
  const state = withTakes(rick);
  // scrRenderTeleprompter bails without the overlay, and reads the label by id.
  const overlay = document.createElement('div');
  overlay.id = 'rickTeleprompter';
  const label = document.createElement('span');
  label.id = 'rickTotalDuration';
  overlay.append(label);
  document.body.append(overlay);

  rick.window.scrRenderTeleprompter();
  assert.equal(label.textContent, '00:15 recorded', '4s + 11s shown as minutes and seconds');

  state.clips[1] = null;
  rick.window.scrRenderTeleprompter();
  assert.equal(label.textContent, '00:04 recorded', 'the label follows clips being removed');
});
