const fs = require('fs');
const path = require('path');

/**
 * Persists terminal chat sessions so a chat survives closing its pane and
 * restarting the server. Mirrors RickStore: one JSON file, whole-file
 * read-modify-write, atomic temp+rename.
 *
 * A record holds only what is needed to resume a chat:
 *   - claudeSessionId: Claude's own memory, replayed via `claude --resume`
 *   - transcript: the visible scrollback, so prior results are still readable
 * Live objects (the child process, SSE clients) are never persisted.
 */
class TerminalStore {
  constructor(baseDir) {
    this.filePath = path.join(baseDir, 'terminal-sessions.json');
  }

  readAll() {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const sessions = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      return Array.isArray(sessions) ? sessions : [];
    } catch (error) {
      console.error('[Terminal] Could not read chat history:', error.message);
      return [];
    }
  }

  writeAll(sessions) {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(sessions, null, 2));
    fs.renameSync(tempPath, this.filePath);
  }

  /** Recent chats, newest first. Transcript is omitted so the list stays small. */
  list(limit = 30) {
    return this.readAll()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit)
      .map(({ transcript, ...summary }) => summary);
  }

  get(id) {
    return this.readAll().find((session) => session.id === id) || null;
  }

  /** Upsert by id, so saving one chat never clobbers the others. */
  save(record) {
    const sessions = this.readAll();
    const index = sessions.findIndex((item) => item.id === record.id);
    if (index === -1) sessions.push(record);
    else sessions[index] = { ...sessions[index], ...record };
    this.writeAll(sessions);
    return record;
  }

  delete(id) {
    const sessions = this.readAll();
    const next = sessions.filter((session) => session.id !== id);
    if (next.length === sessions.length) return false;
    this.writeAll(next);
    return true;
  }
}

module.exports = TerminalStore;
