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

const MAX_BUFFER_LINES = 500;
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB max per terminal log file
const LOGS_DIR = path.join(__dirname, '..', 'logs');

class TerminalManager {
  constructor() {
    this.sessions = new Map();
    this.nextId = 1;
  }

  /**
   * Create a new interactive Claude session (no process yet — just metadata)
   */
  createSession({ name, workingDir, skill, model, claudeSessionId, linkedTaskId }) {
    const id = `term-${Date.now()}-${this.nextId++}`;
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

    console.log(`[Terminal] Created session "${session.name}" (${id})`);
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

    // Build command string for Windows shell
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'claude ' + args.join(' ') : 'claude';
    const spawnArgs = isWin ? [] : args;

    const proc = spawn(cmd, spawnArgs, {
      cwd: session.workingDir || process.cwd(),
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
    console.log(`[Terminal] Killed session "${session.name}" (${sessionId})`);
  }

  removeSession(sessionId) {
    this.killSession(sessionId);
    this.sessions.delete(sessionId);
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
