const express = require('express');
const fs = require('fs');
const shared = require('../lib/shared');
const { readTemplates } = require('../lib/helpers');
const router = express.Router();

router.get('/templates', (req, res) => {
  res.json(readTemplates());
});

router.post('/routines', (req, res) => {
  const { name, icon, description, plan } = req.body;
  if (!name || !plan) return res.status(400).json({ error: 'name and plan required' });
  const tplData = readTemplates();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (tplData.routines.find(r => r.id === id)) {
    return res.status(409).json({ error: 'Routine with that name already exists' });
  }
  const routine = { id, name: name.trim(), icon: icon || '🧠', description: description || plan.plan_description || '', source: 'task-master', plan };
  tplData.routines.push(routine);
  fs.writeFileSync(shared.TEMPLATES_FILE, JSON.stringify(tplData, null, 2));
  console.log(`[TaskMaster] Saved routine: "${name}" (${plan.steps.length} steps)`);
  res.json({ ok: true, routine });
});

router.post('/routines/custom', (req, res) => {
  const { name, icon, description, tasks } = req.body;
  if (!name || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'name and tasks[] required' });
  }
  const tplData = readTemplates();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (tplData.routines.find(r => r.id === id)) {
    return res.status(409).json({ error: 'Routine with that name already exists' });
  }
  const routine = { id, name: name.trim(), icon: icon || '⚡', description: description || '', tasks };
  tplData.routines.push(routine);
  fs.writeFileSync(shared.TEMPLATES_FILE, JSON.stringify(tplData, null, 2));
  console.log(`[Routines] Created custom routine: "${name}" (${tasks.length} steps)`);
  res.json({ ok: true, routine });
});

router.put('/routines/:id', (req, res) => {
  const tplData = readTemplates();
  const idx = tplData.routines.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Routine not found' });
  const { name, icon, description, tasks, plan } = req.body;
  if (name) {
    tplData.routines[idx].name = name.trim();
    const newId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (newId !== req.params.id && !tplData.routines.find(r => r.id === newId)) {
      tplData.routines[idx].id = newId;
    }
  }
  if (icon !== undefined) tplData.routines[idx].icon = icon;
  if (description !== undefined) tplData.routines[idx].description = description;
  if (tasks) tplData.routines[idx].tasks = tasks;
  if (plan) tplData.routines[idx].plan = plan;
  fs.writeFileSync(shared.TEMPLATES_FILE, JSON.stringify(tplData, null, 2));
  res.json({ ok: true, routine: tplData.routines[idx] });
});

router.delete('/routines/:id', (req, res) => {
  const tplData = readTemplates();
  const idx = tplData.routines.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Routine not found' });
  tplData.routines.splice(idx, 1);
  fs.writeFileSync(shared.TEMPLATES_FILE, JSON.stringify(tplData, null, 2));
  console.log(`[Routines] Deleted routine: ${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
