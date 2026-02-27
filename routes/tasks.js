const express = require('express');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { readTasks, writeTasks, generateId, launchWorkersInternal } = require('../lib/helpers');
const router = express.Router();

// Sanitize task IDs to prevent path traversal — only allow digits
function sanitizeId(id) {
  if (!id || !/^\d+$/.test(id)) return null;
  return id;
}

// Middleware: validate :id param on all routes that use it
router.param('id', (req, res, next, id) => {
  const clean = sanitizeId(id);
  if (!clean) return res.status(400).json({ error: 'Invalid task ID' });
  req.params.id = clean;
  next();
});

router.get('/tasks', (req, res) => {
  res.json(readTasks());
});

router.post('/tasks', (req, res) => {
  const { task, skill, priority, model, max_turns, max_budget_usd, allowed_tools, working_dir, context, space_id, extra_context } = req.body;
  if (!task) return res.status(400).json({ error: 'Task description required' });
  const tasks = readTasks();
  const newTask = {
    id: generateId(tasks), task, skill: skill || null, status: 'pending',
    priority: priority || 5, model: model || 'sonnet', max_turns: max_turns || 25,
    context: context || [], extra_context: extra_context || [],
    working_dir: working_dir || null, space_id: space_id || 'general',
    worker: null, started_at: null, completed_at: null, result_file: null, error: null
  };
  if (max_budget_usd) newTask.max_budget_usd = max_budget_usd;
  if (allowed_tools) newTask.allowed_tools = allowed_tools;
  tasks.push(newTask);
  writeTasks(tasks);
  res.json(newTask);
});

router.put('/tasks/:id', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  // Whitelist allowed fields to prevent arbitrary property injection
  const ALLOWED_FIELDS = [
    'task', 'skill', 'status', 'priority', 'model', 'max_turns',
    'max_budget_usd', 'allowed_tools', 'context', 'extra_context',
    'working_dir', 'space_id', 'worker', 'started_at', 'completed_at',
    'result_file', 'error', 'archived', 'archived_at',
    'plan_id', 'plan_step', 'plan_total', 'claudeSessionId', 'terminalSessionId',
    'timeout_mins'
  ];
  for (const key of ALLOWED_FIELDS) {
    if (key in req.body) tasks[idx][key] = req.body[key];
  }
  writeTasks(tasks);
  res.json(tasks[idx]);
});

router.delete('/tasks/:id', (req, res) => {
  let tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  tasks.splice(idx, 1);
  writeTasks(tasks);
  res.json({ ok: true });
});

router.post('/tasks/:id/move', (req, res) => {
  const { status } = req.body;
  if (!['pending', 'running', 'done', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  tasks[idx].status = status;
  if (status === 'pending') {
    tasks[idx].worker = null;
    tasks[idx].started_at = null;
    tasks[idx].completed_at = null;
    tasks[idx].error = null;
  }
  writeTasks(tasks);
  res.json(tasks[idx]);
});

router.post('/reset', (req, res) => {
  const tasks = readTasks();
  tasks.forEach(t => {
    t.status = 'pending'; t.worker = null; t.started_at = null;
    t.completed_at = null; t.result_file = null; t.error = null;
  });
  writeTasks(tasks);
  res.json({ ok: true, count: tasks.length });
});

router.get('/tasks/:id/result', (req, res) => {
  const resultFile = path.join(shared.RESULTS_DIR, `task-${req.params.id}.json`);
  if (!fs.existsSync(resultFile)) return res.status(404).json({ error: 'No result yet' });
  res.json(JSON.parse(fs.readFileSync(resultFile, 'utf-8')));
});

router.get('/tasks/:id/log', (req, res) => {
  const logFile = path.join(shared.LOGS_DIR, `task-${req.params.id}.log`);
  if (!fs.existsSync(logFile)) return res.status(404).json({ error: 'No log yet' });
  res.type('text/plain').send(fs.readFileSync(logFile, 'utf-8'));
});

router.post('/run', (req, res) => {
  const tasks = readTasks();
  const pending = tasks.filter(t => t.status === 'pending').length;
  if (pending === 0) return res.json({ ok: false, message: 'No pending tasks' });
  let workerCount;
  if (req.body.workers && req.body.workers > 0) {
    workerCount = req.body.workers;
  } else {
    if (pending === 1) workerCount = 1;
    else if (pending <= 3) workerCount = 2;
    else workerCount = 3;
  }
  const result = launchWorkersInternal(workerCount);
  res.json(result);
});

router.post('/tasks/:id/run', (req, res) => {
  const tasks = readTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ ok: false, message: 'Task not found' });
  if (task.status !== 'pending') return res.json({ ok: false, message: `Task is ${task.status}, not pending` });
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  const workerId = `S${req.params.id}`;
  const workerScript = path.join(shared.APP_DIR, 'worker.js');
  if (shared.launchWorkerProcess(workerScript, workerId, req.params.id, cleanEnv)) {
    shared.activeWorkers.set(workerId, { startedAt: new Date().toISOString(), taskId: req.params.id });
    console.log(`[Server] Launched single-task worker for #${req.params.id}`);
    res.json({ ok: true, worker: workerId, task_id: req.params.id });
  } else {
    console.error(`[Server] Failed to launch worker for #${req.params.id}`);
    res.status(500).json({ ok: false, message: 'Failed to launch worker' });
  }
});

router.post('/workers/done', (req, res) => {
  const { worker_id } = req.body;
  if (worker_id && shared.activeWorkers.has(worker_id)) {
    shared.activeWorkers.delete(worker_id);
    console.log(`[Server] Worker ${worker_id} reported done, removed from active list`);
  }
  res.json({ ok: true });
});

router.get('/workers', (req, res) => {
  const tasks = readTasks();
  const runningWorkers = [...new Set(tasks.filter(t => t.status === 'running' && t.worker).map(t => t.worker))];
  res.json({ active: runningWorkers, count: runningWorkers.length });
});

router.post('/tasks/archive', (req, res) => {
  const { task_ids } = req.body;
  const tasks = readTasks();
  let count = 0;
  tasks.forEach(t => {
    if (task_ids && task_ids.length > 0) {
      if (task_ids.includes(t.id) && !t.archived) { t.archived = true; t.archived_at = new Date().toISOString(); count++; }
    } else {
      if ((t.status === 'done' || t.status === 'failed') && !t.archived) {
        t.archived = true; t.archived_at = new Date().toISOString(); count++;
      }
    }
  });
  writeTasks(tasks);
  res.json({ ok: true, archived: count });
});

router.post('/tasks/:id/unarchive', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  tasks[idx].archived = false;
  delete tasks[idx].archived_at;
  writeTasks(tasks);
  res.json({ ok: true });
});

router.get('/tasks/:id/live', (req, res) => {
  const statusFile = path.join(shared.LOGS_DIR, `live-${req.params.id}.json`);
  if (!fs.existsSync(statusFile)) return res.json({ status: 'unknown', detail: 'Waiting for worker...' });
  try {
    const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    res.json(data);
  } catch (e) { res.json({ status: 'unknown', detail: 'Reading status...' }); }
});

router.get('/tasks/:id/live-log', (req, res) => {
  const logFile = path.join(shared.LOGS_DIR, `live-${req.params.id}.log`);
  if (!fs.existsSync(logFile)) return res.type('text/plain').send('');
  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const last30 = lines.slice(-30).join('\n');
  res.type('text/plain').send(last30);
});

router.post('/stop', (req, res) => {
  shared.activeWorkers.clear();
  res.json({ ok: true, message: 'Worker tracking cleared. Close terminal windows manually if still open.' });
});

module.exports = router;
