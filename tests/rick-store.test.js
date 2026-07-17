const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const RickStore = require('../lib/rick-store');
const { storeScriptVersion } = require('../lib/rick-engine');

test('session store creates updates lists and deletes persistent sessions', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rick-store-'));
  try {
    const store = new RickStore(tempRoot);
    const session = store.create();
    assert.equal(store.list().length, 1);
    assert.equal(store.get(session.id).stage, 'brief');

    session.title = 'Updated session';
    session.stage = 'ideas';
    session.script = {
      hook: 'Original hook',
      body: 'Original body',
      conclusion: 'Original conclusion',
      cta: 'Original CTA',
      caption: 'Original caption',
    };
    storeScriptVersion(session, 'critique');
    store.save(session);
    assert.equal(store.get(session.id).title, 'Updated session');
    assert.equal(store.get(session.id).scriptHistory[0].script.hook, 'Original hook');
    assert.equal(store.list()[0].stage, 'ideas');

    assert.equal(store.delete(session.id), true);
    assert.equal(store.get(session.id), null);
    assert.equal(store.delete(session.id), false);
  } finally {
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.equal(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`), true);
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
});
