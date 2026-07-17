const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('../lib/shared');
const TerminalManager = require('../lib/terminal-manager');

/**
 * Terminal chat history rests on three promises: starting a new chat never
 * overwrites an existing one, closing a pane keeps the chat, and resuming it
 * brings back both the transcript and Claude's session id. No claude process
 * is spawned here — these cover session bookkeeping only.
 */
function withManager(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-history-'));
  const previousBase = shared.BASE_DIR;
  shared.BASE_DIR = tempRoot;
  try {
    return run(new TerminalManager(), tempRoot);
  } finally {
    shared.BASE_DIR = previousBase;
    const resolvedTemp = path.resolve(tempRoot);
    assert.equal(resolvedTemp.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), true);
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
}

test('a new chat persists as a distinct session and never overwrites the previous one', () => {
  withManager((manager) => {
    const first = manager.createSession({ name: 'First chat', model: 'sonnet' });
    const second = manager.createSession({ name: 'Second chat', model: 'sonnet' });

    assert.notEqual(first.id, second.id);
    const recent = manager.listRecent();
    assert.equal(recent.length, 2);
    assert.deepEqual(
      recent.map((s) => s.name).sort(),
      ['First chat', 'Second chat'],
    );
  });
});

test('recent chats list newest first and report which are still live', () => {
  withManager((manager) => {
    const first = manager.createSession({ name: 'Older chat' });
    const second = manager.createSession({ name: 'Newer chat' });

    manager.removeSession(first.id); // pane closed, chat kept

    const recent = manager.listRecent();
    const byId = Object.fromEntries(recent.map((s) => [s.id, s]));
    assert.equal(byId[first.id].live, false);
    assert.equal(byId[second.id].live, true);
    // Sorted newest-updated first; closing `first` refreshed its updatedAt.
    assert.equal(recent[0].id, first.id);
  });
});

test('closing a chat keeps it resumable and restores its results', () => {
  withManager((manager) => {
    const created = manager.createSession({ name: 'Kept chat', model: 'sonnet' });
    const live = manager.sessions.get(created.id);
    live.claudeSessionId = 'claude-abc-123'; // captured from a result message in real use
    manager._appendOutput(live, 'THE PRIOR RESULT\n');
    manager._flush(live);

    manager.removeSession(created.id);
    assert.equal(manager.sessions.has(created.id), false);

    const resumed = manager.resumeSession(created.id);
    assert.equal(resumed.id, created.id);
    assert.equal(resumed.name, 'Kept chat');

    const restored = manager.getSession(created.id);
    assert.match(restored.buffer, /THE PRIOR RESULT/);
    // Claude's own memory is replayed via --resume, so this must survive.
    assert.equal(manager.sessions.get(created.id).claudeSessionId, 'claude-abc-123');
    assert.equal(restored.status, 'idle');
  });
});

test('switching between chats keeps each transcript separate', () => {
  withManager((manager) => {
    const a = manager.createSession({ name: 'Chat A' });
    const b = manager.createSession({ name: 'Chat B' });
    manager._appendOutput(manager.sessions.get(a.id), 'ONLY-IN-A\n');
    manager._appendOutput(manager.sessions.get(b.id), 'ONLY-IN-B\n');
    manager.removeSession(a.id);
    manager.removeSession(b.id);

    manager.resumeSession(a.id);
    manager.resumeSession(b.id);
    const restoredA = manager.getSession(a.id).buffer;
    const restoredB = manager.getSession(b.id).buffer;

    assert.match(restoredA, /ONLY-IN-A/);
    assert.equal(/ONLY-IN-B/.test(restoredA), false);
    assert.match(restoredB, /ONLY-IN-B/);
  });
});

test('resuming a live chat is a no-op that cannot wipe its buffer', () => {
  withManager((manager) => {
    const created = manager.createSession({ name: 'Live chat' });
    manager._appendOutput(manager.sessions.get(created.id), 'IN-FLIGHT WORK\n');

    manager.resumeSession(created.id);

    assert.match(manager.getSession(created.id).buffer, /IN-FLIGHT WORK/);
  });
});

test('a chat still thinking is never persisted in that state', () => {
  withManager((manager, tempRoot) => {
    const created = manager.createSession({ name: 'Busy chat' });
    const live = manager.sessions.get(created.id);
    live.status = 'thinking';
    manager._flush(live);

    const stored = JSON.parse(fs.readFileSync(path.join(tempRoot, 'terminal-sessions.json'), 'utf-8'));
    assert.equal(stored.find((s) => s.id === created.id).status, 'idle');
  });
});

test('purging erases a chat from history but resuming an unknown chat fails cleanly', () => {
  withManager((manager) => {
    const created = manager.createSession({ name: 'Doomed chat' });
    assert.equal(manager.purgeSession(created.id), true);
    assert.equal(manager.listRecent().length, 0);
    assert.throws(() => manager.resumeSession(created.id), /not found/i);
  });
});
