const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const shared = require('../lib/shared');
const RickStore = require('../lib/rick-store');
const {
  addScriptVersion,
  createRecordingScenes,
  createSession,
  ensureScriptVersions,
  selectScriptVersion,
  validateImportedScript,
} = require('../lib/rick-engine');

const GENERATED_SCRIPT = {
  hook: 'A generated hook',
  body: 'A generated body',
  conclusion: 'A generated conclusion',
  cta: 'Follow for more',
  caption: 'A generated caption.',
};

test('import UI supports files, drag and drop, paste, and clipboard', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf-8');
  assert.match(html, /class="rick-import-script-btn"/);
  assert.match(html, /accept="\.txt,\.md,text\/plain,text\/markdown"/);
  assert.match(html, /ondrop="scrHandleScriptImportDrop\(event\)"/);
  assert.match(html, /Paste from clipboard/);
  assert.match(html, /id="rickScriptImportText" maxlength="24000"/);
});

test('imported wording is preserved and can share version history with Rick scripts', () => {
  const importedText = 'My opening line.\n\nMy second paragraph, exactly as written.';
  const imported = validateImportedScript(importedText);
  const scenes = createRecordingScenes(imported, 20);
  assert.equal(scenes.map((scene) => scene.text).join(' '), importedText);

  const session = createSession();
  session.script = imported;
  const importedVersion = addScriptVersion(session, 'imported');
  assert.equal(importedVersion.source, 'imported');
  session.script = structuredClone(GENERATED_SCRIPT);
  const generatedVersion = addScriptVersion(session, 'revision');
  assert.equal(generatedVersion.number, 2);

  selectScriptVersion(session, importedVersion.id);
  assert.deepEqual(session.script, imported);
  selectScriptVersion(session, generatedVersion.id);
  assert.deepEqual(session.script, GENERATED_SCRIPT);
});

test('import route creates a recordable version without asking Rick to rewrite it', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-script-import-'));
  const previous = {
    BASE_DIR: shared.BASE_DIR,
    APP_DIR: shared.APP_DIR,
    LOGS_DIR: shared.LOGS_DIR,
    WHISPER_CACHE_DIR: shared.WHISPER_CACHE_DIR,
  };
  let server;
  try {
    shared.BASE_DIR = tempRoot;
    shared.APP_DIR = path.resolve(__dirname, '..');
    shared.LOGS_DIR = path.join(tempRoot, 'logs');
    shared.WHISPER_CACHE_DIR = path.join(tempRoot, 'whisper');
    delete require.cache[require.resolve('../routes/scripter')];

    const store = new RickStore(tempRoot);
    const session = store.create();
    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/scripter'));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const text = 'This is my script.\n\nThese words must stay unchanged.';
    const response = await fetch(`${origin}/api/scripter/sessions/${session.id}/import-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'My script', text }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.session.script.importedText, text);
    assert.equal(payload.session.title, 'My script');
    assert.equal(payload.session.scriptVersions[0].source, 'imported');

    const promptResponse = await fetch(`${origin}/api/scripter/sessions/${session.id}/teleprompter`);
    assert.equal(promptResponse.status, 200);
    const prompt = await promptResponse.json();
    assert.equal(prompt.fullText, text);
    assert.equal(prompt.scenes.map((scene) => scene.text).join(' '), text);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    Object.assign(shared, previous);
    delete require.cache[require.resolve('../routes/scripter')];
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.equal(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`), true);
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
});

test('blank and oversized imported scripts are rejected', () => {
  assert.throws(() => validateImportedScript('   '), /Paste a script/);
  assert.throws(() => validateImportedScript('word '.repeat(3201)), /3,200 words/);
  const session = createSession();
  assert.deepEqual(ensureScriptVersions(session), []);
});
