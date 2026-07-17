/**
 * Terminal Manager — Interactive Claude CLI chat sessions
 *
 * Architecture: Each user message spawns a new `claude -p` process.
 * Multi-turn memory is maintained via `--resume <sessionId>`.
 * Output is streamed via SSE to connected browser clients.
 *
 * Flow per message:
 *   1. spawn `claude -p --output-format stream-json --verbose --resume <sid>`
 *   2. Write user text to stdin, then close stdin
 *   3. Parse stream-json stdout lines → broadcast to SSE clients
 *   4. On exit, extract session_id from result message for next --resume
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const TerminalStore = require('./terminal-store');

const MAX_BUFFER_LINES = 500;
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB max per terminal log file
const MAX_TRANSCRIPT_CHARS = 100 * 1024; // per-chat scrollback kept in the history file
const PERSIST_INTERVAL_MS = 1000; // output arrives token by token, so writes are coalesced
const LOGS_DIR = path.join(__dirname, '..', 'logs');

class TerminalManager {
  constructor() {
    this.sessions = new Map();
    this.nextId = 1;
  }

  /**
   * Resolved per call because server.js constructs this manager before it
   * computes BASE_DIR, so the path is not known at construction time.
   */
  _store() {
    const shared = require('./shared');
    return new TerminalStore(shared.BASE_DIR || path.join(__dirname, '..'));
  }

  _isKnownId(id) {
    try { return Boolean(this._store().get(id)); }
    catch (_) { return false; }
  }

  /**
   * Chat history was built without a finalized design, so the choices made in
   * its absence are stated once per process rather than left implicit.
   */
  _announceAssumptions() {
    if (TerminalManager._announced) return;
    TerminalManager._announced = true;
    console.log([
      '[Terminal] Chat history is running on ASSUMPTIONS — no finalized design was found in the workspace:',
      '  1. A "chat" is an existing term-* session; history lives in terminal-sessions.json beside the other stores.',
      '  2. Closing a pane (✕) now KEEPS the chat so it can be resumed. Only DELETE /terminal/history/:id erases it.',
      '  3. Resume restores the transcript + Claude session id; the next message replays memory via --resume.',
      `  4. Only the last ${Math.round(MAX_TRANSCRIPT_CHARS / 1024)}KB of a chat is kept; older scrollback is trimmed.`,
      '  5. A resumed chat starts idle — the previous process is not revived and queued messages are dropped.',
      '  Limitation: single-process store, last write wins. Not safe for concurrent servers on one data dir.',
    ].join('\n'));
  }

  /** The serializable shape of a session. Process and SSE clients are dropped. */
  _record(session) {
    return {
      id: session.id,
      name: session.name,
      claudeSessionId: session.claudeSessionId || null,
      createdAt: session.createdAt,
      updatedAt: new Date().toISOString(),
      workingDir: session.workingDir,
      skill: session.skill || null,
      model: session.model || 'sonnet',
      linkedTaskId: session.linkedTaskId || null,
      // 'thinking' belongs to a process that will not exist after a restart,
      // so it is never persisted or a resumed chat would hang on a dead state.
      status: session.status === 'thinking' ? 'idle' : session.status,
      transcript: session.buffer.join('').slice(-MAX_TRANSCRIPT_CHARS),
    };
  }

  _persist(session, immediate = false) {
    session._dirty = true;
    if (immediate) return this._flush(session);
    if (session._flushTimer) return;
    session._flushTimer = setTimeout(() => {
      session._flushTimer = null;
      this._flush(session);
    }, PERSIST_INTERVAL_MS);
    session._flushTimer.unref?.();
  }

  _flush(session) {
    if (!session._dirty) return;
    session._dirty = false;
    try {
      this._store().save(this._record(session));
    } catch (error) {
      console.error(`[Terminal] Could not persist ${session.id}:`, error.message);
    }
  }

  /**
   * Create a new interactive Claude session (no process yet — just metadata)
   */
  createSession({ name, workingDir, skill, model, claudeSessionId, linkedTaskId }) {
    // nextId restarts at 1 with the process, so a same-millisecond id could
    // collide with a chat from a previous run and overwrite its history.
    let id = `term-${Date.now()}-${this.nextId++}`;
    while (this.sessions.has(id) || this._isKnownId(id)) {
      id = `term-${Date.now()}-${this.nextId++}`;
    }
    const logFile = path.join(LOGS_DIR, `terminal-${id}.log`);

    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

    const session = {
      id,
      name: name || `Terminal ${this.sessions.size + 1}`,
      currentProcess: null,       // active claude -p process (null when idle)
      claudeSessionId: claudeSessionId || null,  // pre-seed for --resume from worker
      buffer: [],
      sseClients: new Set(),
      status: 'idle',             // idle | thinking | dead
      createdAt: new Date().toISOString(),
      workingDir: workingDir || process.cwd(),
      skill: skill || null,
      model: model || 'sonnet',
      logFile,
      linkedTaskId: linkedTaskId || null,  // linked kanban task ID
      messageQueue: [],           // queued messages while thinking
    };

    this.sessions.set(id, session);
    this._appendOutput(session, `🤖 Claude session started (${model || 'sonnet'})\n`);
    if (skill) this._appendOutput(session, `📎 Skill: ${skill}\n`);
    this._appendOutput(session, `📁 ${workingDir || process.cwd()}\n`);
    this._appendOutput(session, `💬 Type a message to start chatting\n\n`);

    this._persist(session, true);
    console.log(`[Terminal] Created session "${session.name}" (${id})`);
    return this._summarize(session);
  }

  /**
   * Recent chats from disk, with any still-live in-memory session overlaid so
   * its current status wins. Newest first.
   */
  listRecent(limit = 30) {
    this._announceAssumptions();
    let stored = [];
    try { stored = this._store().list(limit); }
    catch (error) { console.error('[Terminal] Could not list chat history:', error.message); }
    return stored.map((record) => {
      const live = this.sessions.get(record.id);
      return {
        ...record,
        status: live ? live.status : record.status,
        live: Boolean(live),
      };
    });
  }

  /**
   * Reopen a persisted chat. Already-live sessions are returned untouched so
   * resuming twice cannot wipe a running chat's buffer.
   *
   * Restores the transcript and Claude's session id; the next message resumes
   * Claude's own memory via --resume. The previous process is not revived.
   */
  resumeSession(sessionId) {
    const live = this.sessions.get(sessionId);
    if (live) return this._summarize(live);

    const record = this._store().get(sessionId);
    if (!record) throw new Error('Session not found');

    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
    const session = {
      id: record.id,
      name: record.name,
      currentProcess: null,
      claudeSessionId: record.claudeSessionId || null,
      buffer: record.transcript ? [record.transcript] : [],
      sseClients: new Set(),
      status: 'idle',
      createdAt: record.createdAt,
      workingDir: record.workingDir || process.cwd(),
      skill: record.skill || null,
      model: record.model || 'sonnet',
      logFile: path.join(LOGS_DIR, `terminal-${record.id}.log`),
      linkedTaskId: record.linkedTaskId || null,
      messageQueue: [],
    };
    this.sessions.set(session.id, session);
    this._appendOutput(session, `\n💬 Resumed this chat${session.claudeSessionId ? '' : ' (Claude has no prior memory of it)'}\n\n`);
    console.log(`[Terminal] Resumed session "${session.name}" (${session.id})`);
    return this._summarize(session);
  }

  /**
   * Send text input to a session — spawns a claude -p process
   */
  sendInput(sessionId, text) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status === 'dead') throw new Error('Session is dead');

    // If currently thinking, queue the message
    if (session.status === 'thinking') {
      session.messageQueue.push(text);
      this._appendOutput(session, `\n⏳ Queued (Claude is still thinking...)\n`);
      return;
    }

    this._executeMessage(session, text);
  }

  /**
   * Execute a single message by spawning a claude -p process
   */
  _executeMessage(session, text) {
    // Echo user input (truncate long messages like skill-injected live tasks)
    if (text.length > 500) {
      // Extract the <task> content for display, or show first 200 chars
      const taskMatch = text.match(/<task>\n?([\s\S]*?)\n?<\/task>/);
      const displayText = taskMatch ? taskMatch[1].trim() : text.substring(0, 200) + '...';
      const hasSkill = text.includes('<skill-instructions>');
      const hasCtx = text.includes('<project-context>');
      const badges = [hasSkill ? 'skill loaded' : '', hasCtx ? 'context loaded' : ''].filter(Boolean).join(' + ');
      this._appendOutput(session, `\n❯ ${displayText}${badges ? `\n  [${badges}]` : ''}\n\n`);
    } else {
      this._appendOutput(session, `\n❯ ${text}\n\n`);
    }

    session.status = 'thinking';
    this._broadcast(session, { type: 'status', data: 'thinking' });

    // Build command args
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions'
    ];
    if (session.model) args.push('--model', session.model);
    if (session.workingDir) args.push('--add-dir', session.workingDir);
    if (session.claudeSessionId) args.push('--resume', session.claudeSessionId);

    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    // Validate cwd is a real directory (avoids ENOTDIR)
    let cwd = session.workingDir || process.cwd();
    try { if (!fs.statSync(cwd).isDirectory()) cwd = process.cwd(); }
    catch (_) { cwd = process.cwd(); }

    // Build command string for Windows shell
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'claude ' + args.join(' ') : 'claude';
    const spawnArgs = isWin ? [] : args;

    const proc = spawn(cmd, spawnArgs, {
      cwd,
      env: cleanEnv,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    session.currentProcess = proc;
    let lineBuffer = '';
    let gotResult = false;

    console.log(`[Terminal ${session.id}] Spawned claude (pid ${proc.pid}) — resume: ${session.claudeSessionId || 'new'}`);

    // Parse stdout as JSON lines
    proc.stdout.on('data', (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this._handleStreamMessage(session, msg);
          // Capture session_id from result or system init
          if (msg.type === 'result' && msg.session_id) {
            session.claudeSessionId = msg.session_id;
            gotResult = true;
          } else if (msg.type === 'system' && msg.session_id) {
            session.claudeSessionId = msg.session_id;
          }
        } catch (e) {
          // Not JSON — show raw
          if (line.trim()) this._appendOutput(session, line + '\n');
        }
      }
    });

    // stderr — log for debugging
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      console.log(`[Terminal ${session.id}] stderr:`, text.trim().substring(0, 200));
      if (text.includes('Error') || text.includes('error')) {
        this._appendOutput(session, `⚠ ${text}`);
      }
    });

    proc.on('exit', (code) => {
      // Process remaining buffer
      if (lineBuffer.trim()) {
        try {
          const msg = JSON.parse(lineBuffer);
          this._handleStreamMessage(session, msg);
          if (msg.type === 'result' && msg.session_id) {
            session.claudeSessionId = msg.session_id;
          }
        } catch (e) {
          if (lineBuffer.trim()) this._appendOutput(session, lineBuffer);
        }
      }

      session.currentProcess = null;

      if (code !== 0 && !gotResult) {
        this._appendOutput(session, `\n⚠ Process exited with code ${code}\n`);
      }

      // Check for queued messages
      if (session.messageQueue.length > 0) {
        const nextMsg = session.messageQueue.shift();
        // Small delay before processing next message
        setTimeout(() => this._executeMessage(session, nextMsg), 200);
      } else {
        session.status = 'idle';
        this._broadcast(session, { type: 'status', data: 'idle' });
      }

      // The claudeSessionId captured above is what makes this chat resumable.
      this._persist(session, true);
      console.log(`[Terminal ${session.id}] Process exited (code ${code}) — claudeSession: ${session.claudeSessionId || 'none'}`);
    });

    proc.on('error', (err) => {
      session.currentProcess = null;
      session.status = 'idle';
      this._appendOutput(session, `\n⚠ Error: ${err.message}\n`);
      this._broadcast(session, { type: 'status', data: 'idle' });
    });

    // Write user prompt to stdin, then close it
    proc.stdin.write(text);
    proc.stdin.end();
  }

  /**
   * Handle a stream-json message from Claude
   */
  _handleStreamMessage(session, msg) {
    if (msg.type === 'assistant' && msg.message) {
      // Complete assistant message — extract text from content blocks
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            this._appendOutput(session, block.text);
          }
          // Skip thinking blocks
        }
      }
    } else if (msg.type === 'result') {
      // Final result — add newline after response
      this._appendOutput(session, '\n');
    } else if (msg.type === 'error') {
      this._appendOutput(session, `\n⚠ Error: ${msg.error || JSON.stringify(msg)}\n`);
    }
    // Ignore system, rate_limit_event, and other metadata types
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return { ...this._summarize(session), buffer: session.buffer.join('') };
  }

  killSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // Kill current process if running
    if (session.currentProcess) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(session.currentProcess.pid), '/f', '/t'], { shell: true, windowsHide: true });
        } else {
          session.currentProcess.kill('SIGTERM');
        }
      } catch (e) {
        console.error(`[Terminal] Error killing process for ${sessionId}:`, e.message);
      }
    }

    session.status = 'dead';
    session.messageQueue = [];
    for (const client of session.sseClients) {
      try { client.end(); } catch (e) {}
    }
    session.sseClients.clear();
    this._appendOutput(session, `\n[Session ended]\n`);
    this._broadcast(session, { type: 'status', data: 'dead' });
    this._persist(session, true);
    console.log(`[Terminal] Killed session "${session.name}" (${sessionId})`);
  }

  /**
   * Closes the pane and drops the session from memory. The chat stays in the
   * history file so it can be resumed; use purgeSession to erase it for good.
   */
  removeSession(sessionId) {
    this.killSession(sessionId);
    const session = this.sessions.get(sessionId);
    if (session?._flushTimer) clearTimeout(session._flushTimer);
    this.sessions.delete(sessionId);
  }

  /** Permanently erases a chat from history. */
  purgeSession(sessionId) {
    try { this.killSession(sessionId); } catch (_) {}
    this.sessions.delete(sessionId);
    return this._store().delete(sessionId);
  }

  listSessions() {
    return Array.from(this.sessions.values()).map(s => this._summarize(s));
  }

  addSSEClient(sessionId, res) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send full buffer as catch-up
    const catchUp = session.buffer.join('');
    if (catchUp) {
      res.write(`data: ${JSON.stringify({ type: 'catchup', data: catchUp })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'status', data: session.status })}\n\n`);

    session.sseClients.add(res);
    res.on('close', () => { session.sseClients.delete(res); });
  }

  cleanup() {
    for (const [id] of this.sessions) {
      try { this.killSession(id); } catch (e) {}
    }
    this.sessions.clear();
    console.log('[Terminal] All sessions cleaned up');
  }

  // ── Internal helpers ──

  _appendOutput(session, text) {
    session.buffer.push(text);
    if (session.buffer.length > MAX_BUFFER_LINES) {
      session.buffer = session.buffer.slice(-MAX_BUFFER_LINES);
    }
    // Cap log file size to prevent unbounded disk usage
    try {
      const stat = fs.statSync(session.logFile).size;
      if (stat < MAX_LOG_SIZE) {
        fs.appendFileSync(session.logFile, text);
      }
    } catch (e) {
      // File may not exist yet — write it
      try { fs.appendFileSync(session.logFile, text); } catch (_) {}
    }
    this._persist(session);
    this._broadcast(session, { type: 'output', data: text });
  }

  _broadcast(session, message) {
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    const dead = [];
    for (const client of session.sseClients) {
      try {
        if (client.writableEnded || client.destroyed) {
          dead.push(client);
        } else {
          client.write(payload);
        }
      } catch (e) {
        dead.push(client);
      }
    }
    // Clean up dead clients outside iteration
    for (const client of dead) {
      session.sseClients.delete(client);
    }
  }

  _summarize(session) {
    return {
      id: session.id, name: session.name, status: session.status,
      createdAt: session.createdAt, workingDir: session.workingDir,
      skill: session.skill, model: session.model,
      linkedTaskId: session.linkedTaskId || null,
      bufferLines: session.buffer.length, sseClients: session.sseClients.size
    };
  }
}

module.exports = TerminalManager;
