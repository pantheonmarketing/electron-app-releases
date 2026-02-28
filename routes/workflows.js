const express = require('express');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { readTasks, writeTasks, readTemplates, readWorkflowRuns, writeWorkflowRuns, generateId, buildWorkflowPrompt, launchWorkersInternal } = require('../lib/helpers');
const router = express.Router();

router.post('/workflow-runs', (req, res) => {
  const { routine_id, space_id, working_dir, context, persona } = req.body;
  const tplData = readTemplates();
  const routine = tplData.routines.find(r => r.id === routine_id);
  if (!routine) return res.status(404).json({ error: 'Routine not found' });
  if (!routine.tasks || routine.tasks.length === 0) return res.status(400).json({ error: 'Routine has no tasks' });
  const runId = 'wfr-' + Date.now();
  const nodes = [];
  routine.tasks.forEach((rt, idx) => {
    nodes.push({
      index: idx, template_id: rt.template_id, variables: { ...(rt.variables || {}) },
      status: 'waiting', task_id: null, started_at: null, completed_at: null, output_preview: null
    });
  });
  const firstNode = nodes[0];
  const tpl = tplData.templates.find(t => t.id === firstNode.template_id);
  if (!tpl) return res.status(400).json({ error: `Template "${firstNode.template_id}" not found` });
  const run = {
    id: runId, routine_id, routine_name: routine.name, status: 'running',
    space_id: space_id || 'general', working_dir: working_dir || null, context: context || [],
    persona: persona || null,
    current_node_index: 0, nodes, started_at: new Date().toISOString(), completed_at: null, error: null
  };
  const prompt = buildWorkflowPrompt(tpl, firstNode.variables, run, 0);
  const tasks = readTasks();
  const taskId = generateId(tasks);
  const newTask = {
    id: taskId, task: prompt, skill: tpl.skill || null, status: 'pending', priority: 1,
    model: tpl.model || 'sonnet', max_turns: tpl.max_turns || 25, context: context || [],
    extra_context: [], working_dir: working_dir || null, space_id: space_id || 'general',
    persona: persona || null,
    worker: null, started_at: null, completed_at: null, result_file: null, error: null,
    workflow_run_id: runId, workflow_node_index: 0
  };
  tasks.push(newTask);
  writeTasks(tasks);
  firstNode.status = 'running'; firstNode.task_id = taskId; firstNode.started_at = new Date().toISOString();
  const wfData = readWorkflowRuns();
  wfData.runs.push(run);
  writeWorkflowRuns(wfData);
  launchWorkersInternal(1);
  console.log(`[Workflow] Run ${runId} started: "${routine.name}" (${nodes.length} nodes, first task: ${taskId})`);
  res.json({ ok: true, run_id: runId, run });
});

router.get('/workflow-runs', (req, res) => {
  const data = readWorkflowRuns();
  if (req.query.active === 'true') data.runs = data.runs.filter(r => r.status === 'running');
  res.json(data);
});

router.get('/workflow-runs/:id', (req, res) => {
  const data = readWorkflowRuns();
  const run = data.runs.find(r => r.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'Workflow run not found' });
  res.json(run);
});

function checkWorkflowProgress() {
  const wfData = readWorkflowRuns();
  const tasks = readTasks();
  const tplData = readTemplates();
  let changed = false;
  for (const run of wfData.runs) {
    if (run.status !== 'running') continue;
    const currentNode = run.nodes[run.current_node_index];
    if (!currentNode || currentNode.status !== 'running') continue;
    const task = tasks.find(t => t.id === currentNode.task_id);
    if (!task) continue;
    if (task.status === 'done') {
      currentNode.status = 'success';
      currentNode.completed_at = task.completed_at || new Date().toISOString();
      if (task.result_file) {
        const resultFile = path.isAbsolute(task.result_file) ? task.result_file : path.join(shared.BASE_DIR, task.result_file);
        if (fs.existsSync(resultFile)) {
          try {
            const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
            currentNode.output_preview = (result.claude_response?.result || '').slice(0, 200);
          } catch (_) {}
        }
      }
      const nextIndex = run.current_node_index + 1;
      if (nextIndex >= run.nodes.length) {
        run.status = 'done'; run.completed_at = new Date().toISOString(); changed = true;
        console.log(`[Workflow] Run ${run.id} completed successfully (${run.nodes.length} nodes)`);
      } else {
        const nextNode = run.nodes[nextIndex];
        const tpl = tplData.templates.find(t => t.id === nextNode.template_id);
        if (!tpl) {
          run.status = 'failed'; run.error = `Template "${nextNode.template_id}" not found for node ${nextIndex}`;
          run.completed_at = new Date().toISOString(); nextNode.status = 'error'; changed = true;
          console.log(`[Workflow] Run ${run.id} FAILED: ${run.error}`); continue;
        }
        const prompt = buildWorkflowPrompt(tpl, nextNode.variables, run, nextIndex);
        const allTasks = readTasks();
        const newTaskId = generateId(allTasks);
        const newTask = {
          id: newTaskId, task: prompt, skill: tpl.skill || null, status: 'pending', priority: 1,
          model: tpl.model || 'sonnet', max_turns: tpl.max_turns || 25, context: run.context || [],
          extra_context: [], working_dir: run.working_dir || null, space_id: run.space_id || 'general',
          persona: run.persona || null,
          worker: null, started_at: null, completed_at: null, result_file: null, error: null,
          workflow_run_id: run.id, workflow_node_index: nextIndex
        };
        allTasks.push(newTask); writeTasks(allTasks);
        nextNode.status = 'running'; nextNode.task_id = newTaskId; nextNode.started_at = new Date().toISOString();
        run.current_node_index = nextIndex; changed = true;
        launchWorkersInternal(1);
        console.log(`[Workflow] Run ${run.id}: Node ${nextIndex} started (task ${newTaskId})`);
      }
    } else if (task.status === 'failed') {
      currentNode.status = 'error'; currentNode.completed_at = task.completed_at || new Date().toISOString();
      run.status = 'failed'; run.completed_at = new Date().toISOString();
      run.error = `Node ${run.current_node_index} failed: ${task.error || 'Unknown error'}`;
      changed = true;
      console.log(`[Workflow] Run ${run.id} FAILED at node ${run.current_node_index}: ${task.error || 'Unknown'}`);
    }
  }
  if (changed) writeWorkflowRuns(wfData);
}

module.exports = router;
module.exports.checkWorkflowProgress = checkWorkflowProgress;
