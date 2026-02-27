const express = require('express');
const shared = require('../lib/shared');
const { readTemplates } = require('../lib/helpers');
const { readSchedules, writeSchedules, computeNextRun, fireSchedule } = require('../lib/scheduler');
const router = express.Router();

router.get('/schedules', (req, res) => {
  const data = readSchedules();
  data.schedules.forEach(s => { s.next_run = computeNextRun(s); });
  res.json(data);
});

router.post('/schedules', (req, res) => {
  const { name, routine_id, time, days, space_id, working_dir, context, timezone } = req.body;
  if (!name || !routine_id || !time) {
    return res.status(400).json({ error: 'name, routine_id, and time are required' });
  }
  const tplData = readTemplates();
  const routine = tplData.routines.find(r => r.id === routine_id);
  if (!routine) return res.status(404).json({ error: `Routine "${routine_id}" not found` });
  const data = readSchedules();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
  const schedule = {
    id, name: name.trim(), routine_id, routine_name: routine.name,
    routine_icon: routine.icon || '📋', enabled: true,
    time: { hour: parseInt(time.hour), minute: parseInt(time.minute) },
    days: days || 'daily', timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    space_id: space_id || 'general', working_dir: working_dir || null, context: context || [],
    created_at: new Date().toISOString(), last_run: null, last_run_status: null, history: []
  };
  schedule.next_run = computeNextRun(schedule);
  data.schedules.push(schedule);
  writeSchedules(data);
  console.log(`[Scheduler] Created schedule: "${name}" → ${routine.name} at ${time.hour}:${String(time.minute).padStart(2, '0')} (${schedule.timezone})`);
  res.json({ ok: true, schedule });
});

router.put('/schedules/:id', (req, res) => {
  const data = readSchedules();
  const idx = data.schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });
  const updates = req.body;
  const s = data.schedules[idx];
  if (updates.enabled !== undefined) s.enabled = updates.enabled;
  if (updates.name) s.name = updates.name.trim();
  if (updates.time) s.time = { hour: parseInt(updates.time.hour), minute: parseInt(updates.time.minute) };
  if (updates.days) s.days = updates.days;
  if (updates.timezone) s.timezone = updates.timezone;
  if (updates.routine_id) {
    const tplData = readTemplates();
    const routine = tplData.routines.find(r => r.id === updates.routine_id);
    if (routine) {
      s.routine_id = updates.routine_id;
      s.routine_name = routine.name;
      s.routine_icon = routine.icon || '📋';
    }
  }
  s.next_run = computeNextRun(s);
  writeSchedules(data);
  res.json({ ok: true, schedule: s });
});

router.delete('/schedules/:id', (req, res) => {
  const data = readSchedules();
  const idx = data.schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });
  const removed = data.schedules.splice(idx, 1)[0];
  writeSchedules(data);
  console.log(`[Scheduler] Deleted schedule: "${removed.name}"`);
  res.json({ ok: true });
});

router.post('/schedules/:id/run-now', (req, res) => {
  const data = readSchedules();
  const schedule = data.schedules.find(s => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  fireSchedule(schedule);
  const updated = readSchedules();
  const s = updated.schedules.find(sc => sc.id === req.params.id);
  res.json({ ok: true, schedule: s });
});

module.exports = router;
