const fs = require('fs');
const path = require('path');
const { createSession, sessionSummary } = require('./rick-engine');

class RickStore {
  constructor(baseDir) {
    this.filePath = path.join(baseDir, 'rick-sessions.json');
  }

  readAll() {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const sessions = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      return Array.isArray(sessions) ? sessions : [];
    } catch (error) {
      console.error('[Rick] Could not read sessions:', error.message);
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

  list() {
    return this.readAll()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(sessionSummary);
  }

  get(id) {
    return this.readAll().find((session) => session.id === id) || null;
  }

  create() {
    const sessions = this.readAll();
    const session = createSession();
    sessions.push(session);
    this.writeAll(sessions);
    return session;
  }

  save(session) {
    const sessions = this.readAll();
    const index = sessions.findIndex((item) => item.id === session.id);
    if (index === -1) sessions.push(session);
    else sessions[index] = session;
    this.writeAll(sessions);
    return session;
  }

  delete(id) {
    const sessions = this.readAll();
    const next = sessions.filter((session) => session.id !== id);
    if (next.length === sessions.length) return false;
    this.writeAll(next);
    return true;
  }
}

module.exports = RickStore;
