const express = require('express');
const shared = require('../lib/shared');
const { readTasks, writeTasks } = require('../lib/helpers');
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
