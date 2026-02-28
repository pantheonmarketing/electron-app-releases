const express = require('express');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { readTasks, writeTasks, readSkills } = require('../lib/helpers');
const router = express.Router();

router.get('/terminal/sessions', (req, res) => {
  res.json(shared.terminalManager.listSessions());
});

router.post('/terminal/sessions', (req, res) => {
  const { name, workingDir, skill, model } = req.body;
  try {
    const session = shared.terminalManager.createSession({ name, workingDir, skill, model });
    res.json({ ok: true, session });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Live Task: create session + inject skill + send first message ──
// MUST be registered before :id routes to avoid matching "live" as an id
router.post('/terminal/sessions/live', (req, res) => {
  const { name, workingDir, skill, model, task, context, persona } = req.body;
  if (!task) return res.status(400).json({ error: 'task is required' });

  try {
    // Create session
    const session = shared.terminalManager.createSession({
      name: name || 'Live Task',
      workingDir: workingDir || null,
      skill: skill || null,
      model: model || 'sonnet'
    });

    // Build the first message with persona + skill injection
    let firstMessage = '';

    // 0. Inject persona context (AI Memory from space)
    if (persona) {
      const parts = [];
      if (persona.name) parts.push(`You're working for ${persona.name}.`);
      if (persona.business) parts.push(persona.business);
      if (persona.audience) parts.push(`Target audience: ${persona.audience}`);
      if (persona.tone) parts.push(`Tone/style: ${persona.tone}`);
      if (persona.extra) parts.push(persona.extra);
      if (parts.length > 0) {
        firstMessage += `<persona>\n${parts.join('\n')}\n</persona>\n\n`;
      }
    }

    // 1. Inject skill content if specified
    if (skill) {
      const allSkills = readSkills();
      const skillEntry = allSkills[skill];
      if (skillEntry && skillEntry.file) {
        const resolvePath = (p) => path.isAbsolute(p) ? p : path.join(shared.BASE_DIR, p);
        const skillFile = resolvePath(skillEntry.file);
        if (fs.existsSync(skillFile)) {
          const skillContent = fs.readFileSync(skillFile, 'utf-8');
          firstMessage += `<skill-instructions>\n${skillContent}\n</skill-instructions>\n\n`;
        }
      }
    }

    // 2. Inject context files (max 80KB total)
    if (context && context.length > 0) {
      const MAX_CTX = 80000;
      let ctxContent = '';
      for (const p of context) {
        if (ctxContent.length >= MAX_CTX) break;
        try {
          const resolved = path.isAbsolute(p) ? p : path.join(shared.BASE_DIR, p);
          if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
            const content = fs.readFileSync(resolved, 'utf-8');
            const available = MAX_CTX - ctxContent.length;
            ctxContent += `\n--- ${p} ---\n${content.slice(0, available)}\n`;
          }
        } catch (_) {}
      }
      if (ctxContent) {
        firstMessage += `<project-context>\n${ctxContent}\n</project-context>\n\n`;
      }
    }

    // 3. Add the actual task instruction
    firstMessage += `<task>\n${task}\n</task>`;

    // Send first message after a brief delay (let SSE connect first)
    setTimeout(() => {
      try { shared.terminalManager.sendInput(session.id, firstMessage); } catch (_) {}
    }, 500);

    res.json({ ok: true, session });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/terminal/sessions/:id', (req, res) => {
  const session = shared.terminalManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

router.get('/terminal/sessions/:id/stream', (req, res) => {
  try { shared.terminalManager.addSSEClient(req.params.id, res); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.post('/terminal/sessions/:id/input', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try { shared.terminalManager.sendInput(req.params.id, text); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/terminal/sessions/:id', (req, res) => {
  try { shared.terminalManager.removeSession(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/tasks/:id/attach-terminal', (req, res) => {
  const tasks = readTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.terminalSessionId) {
    const existing = shared.terminalManager.getSession(task.terminalSessionId);
    if (existing && existing.status !== 'dead') {
      return res.json({ ok: true, session: existing, reused: true });
    }
  }
  try {
    const session = shared.terminalManager.createSession({
      name: `#${task.id}: ${(task.task || '').substring(0, 35)}`,
      workingDir: task.working_dir || null,
      skill: task.skill || null, model: task.model || 'sonnet',
      claudeSessionId: task.claudeSessionId || null, linkedTaskId: task.id
    });
    const idx = tasks.findIndex(t => t.id === req.params.id);
    tasks[idx].terminalSessionId = session.id;
    writeTasks(tasks);
    res.json({ ok: true, session });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
