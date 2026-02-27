const express = require('express');
const fs = require('fs');
const { readProjects, writeProjects } = require('../lib/helpers');
const router = express.Router();

router.get('/projects', (req, res) => {
  const projects = readProjects();
  const result = Object.entries(projects).map(([id, p]) => ({
    id, name: p.name, working_dir: p.working_dir,
    context: p.context || [], valid: fs.existsSync(p.working_dir)
  }));
  res.json(result);
});

router.post('/projects', (req, res) => {
  const { id, name, working_dir, context } = req.body;
  if (!id || !name || !working_dir) return res.status(400).json({ error: 'id, name, working_dir required' });
  const projects = readProjects();
  projects[id] = { name, working_dir, context: context || [] };
  writeProjects(projects);
  res.json({ ok: true, project: projects[id] });
});

router.delete('/projects/:id', (req, res) => {
  const projects = readProjects();
  if (!projects[req.params.id]) return res.status(404).json({ error: 'Project not found' });
  delete projects[req.params.id];
  writeProjects(projects);
  res.json({ ok: true });
});

module.exports = router;
