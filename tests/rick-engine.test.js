const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCRIPT_HISTORY_LIMIT,
  createSession,
  createRecordingScenes,
  isBriefReady,
  sanitizeBrief,
  restoreLatestScriptVersion,
  setFunnel,
  storeScriptVersion,
  validateCriticFeedback,
  validateCritiqueSummary,
  validateIdeas,
  validateRecordingFramings,
  validateRecordingSelection,
  validateScript,
} = require('../lib/rick-engine');

test('new sessions start at the brief gate with Jonny-safe conversation state', () => {
  const session = createSession();
  assert.equal(session.stage, 'brief');
  assert.equal(session.funnel, 'auto');
  assert.equal(session.ideas.length, 0);
  assert.equal(session.script, null);
  assert.equal(session.critique, null);
  assert.match(session.messages[0].text, /what are we creating content about/i);
});

test('brief gate requires topic audience and content type', () => {
  assert.equal(isBriefReady({ niche: 'fitness', audience: 'new parents' }), false);
  assert.equal(isBriefReady({ niche: 'fitness', audience: 'new parents', contentType: 'educational reels' }), true);
  assert.deepEqual(sanitizeBrief({ niche: '  fitness ', audience: ' coaches ', content_type: ' myths ' }), {
    niche: 'fitness',
    audience: 'coaches',
    contentType: 'myths',
  });
});

test('idea validation enforces exactly ten unique one-line hooks', () => {
  const ideas = Array.from({ length: 10 }, (_, index) => `Hook idea ${index + 1}`);
  assert.deepEqual(validateIdeas(ideas), ideas);
  assert.throws(() => validateIdeas(ideas.slice(0, 9)), /exactly 10/i);
  assert.throws(() => validateIdeas([...ideas.slice(0, 9), ideas[0]]), /duplicate/i);
});

test('spoken script sections are cleaned and production directions are rejected', () => {
  const script = validateScript({
    hook: 'Most creators waste their best idea.',
    body: 'Use the proof first, then explain why it worked!',
    conclusion: 'Specific evidence makes the lesson believable.',
    cta: 'Comment FIRE and I will send the template.',
    caption: 'A stronger way to structure your next short-form script.',
  });
  assert.equal(script.hook, 'Most creators waste their best idea');
  assert.equal(script.cta, 'Comment FIRE and I will send the template');
  assert.throws(() => validateScript({
    hook: 'Try this', body: 'Camera pans to the result', conclusion: 'That is it', cta: 'Follow', caption: 'A tip.',
  }), /production directions/i);
});

test('teleprompter scenes are spoken-only deterministic chunks', () => {
  const body = Array.from({ length: 50 }, (_, index) => `word${index + 1}`).join(' ');
  const scenes = createRecordingScenes({
    hook: 'Start with this',
    body,
    conclusion: 'That is the lesson',
    cta: 'Follow for more',
    caption: 'This should not be recorded.',
  }, 30);
  assert.deepEqual(scenes.map((scene) => scene.label), [
    'Hook', 'Body 1', 'Body 2', 'Conclusion', 'Call to action',
  ]);
  assert.equal(scenes[1].wordCount, 30);
  assert.equal(scenes[2].wordCount, 20);
  assert.equal(scenes.some((scene) => scene.section === 'caption'), false);
});

test('recording selection allows skipped scenes while preserving script order', () => {
  assert.deepEqual(validateRecordingSelection([0, 2, 4], [1, 3], 5), {
    recordedIndexes: [0, 2, 4],
    skippedIndexes: [1, 3],
  });
  assert.throws(() => validateRecordingSelection([], [0, 1], 2), /at least one scene/i);
  assert.throws(() => validateRecordingSelection([0], [], 2), /record or skip every scene/i);
  assert.throws(() => validateRecordingSelection([0, 1], [1], 2), /both recorded and skipped/i);
  assert.throws(() => validateRecordingSelection([1, 0], [], 2), /script order/i);
});

test('camera framing is normalized for every recorded scene', () => {
  assert.deepEqual(validateRecordingFramings([
    { zoom: 1.5, x: -0.25, y: 0.4 },
    { zoom: 9, x: -3, y: 2 },
  ], 2), [
    { zoom: 1.5, x: -0.25, y: 0.4 },
    { zoom: 3, x: -1, y: 1 },
  ]);
  assert.throws(() => validateRecordingFramings([{ zoom: 1 }], 2), /does not match/i);
});

test('funnel stage only accepts the supported choices', () => {
  const session = createSession();
  setFunnel(session, 'mof');
  assert.equal(session.funnel, 'mof');
  assert.throws(() => setFunnel(session, 'viral'), /invalid funnel/i);
});

test('critique validation keeps concise feedback and allows no disagreements', () => {
  assert.deepEqual(validateCriticFeedback({
    verdict: 'The hook is clear but predictable',
    strengths: ['Natural delivery'],
    improvements: ['Open with the surprising proof'],
  }), {
    verdict: 'The hook is clear but predictable',
    strengths: ['Natural delivery'],
    improvements: ['Open with the surprising proof'],
  });

  assert.deepEqual(validateCritiqueSummary({
    summary: 'The script needs a sharper opening',
    improvements: ['Lead with proof', 'Tighten the CTA'],
    disagreements: [],
  }).disagreements, []);
  assert.throws(() => validateCriticFeedback({ verdict: 'Fine' }), /incomplete critic/i);
  assert.throws(() => validateCritiqueSummary({ summary: 'Fine' }), /incomplete critique/i);
});

test('script history keeps only the latest five restorable versions', () => {
  const session = createSession();
  for (let index = 0; index <= SCRIPT_HISTORY_LIMIT; index += 1) {
    session.script = {
      hook: `Hook version ${index}`,
      body: `Body version ${index}`,
      conclusion: `Conclusion version ${index}`,
      cta: `CTA version ${index}`,
      caption: `Caption version ${index}`,
    };
    storeScriptVersion(session, 'critique');
  }

  assert.equal(session.scriptHistory.length, SCRIPT_HISTORY_LIMIT);
  assert.equal(session.scriptHistory[0].script.hook, 'Hook version 1');
  const restored = restoreLatestScriptVersion(session);
  assert.equal(restored.source, 'critique');
  assert.equal(session.script.hook, `Hook version ${SCRIPT_HISTORY_LIMIT}`);
  assert.equal(session.scriptHistory.length, SCRIPT_HISTORY_LIMIT - 1);
});
