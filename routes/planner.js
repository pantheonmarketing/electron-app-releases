const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { readTasks, writeTasks, readSkills, generateId, shellEscape } = require('../lib/helpers');
const router = express.Router();

router.post('/plan', (req, res) => {
  const { goal } = req.body;
  if (!goal) return res.status(400).json({ error: 'Goal description required' });
  const startTime = Date.now();
  const skills = readSkills();
  const skillsList = Object.entries(skills)
    .filter(([, info]) => fs.existsSync(info.file))
    .map(([name, info]) => `- ${name}: ${info.description}`)
    .join('\n');

  const plannerPrompt = `<system>
You are a Task Planner for the Claude Task Manager. Your job is to take a user's high-level business goal and break it down into specific, actionable tasks that can be executed by individual Claude agents.

Each task will be executed independently by a separate Claude instance. Tasks run one at a time in priority order (lower order number runs first). Later tasks can reference output from earlier tasks because they share the same working directory and results folder.

IMPORTANT RULES:
1. Each task must be self-contained with clear instructions
2. Assign exactly one skill per task from the available skills list, or null for general tasks
3. If a task depends on a previous task's output, say so explicitly in the task description (e.g., "Based on the research from the previous step, ...")
4. Keep task descriptions concise but specific enough that a fresh Claude instance can execute them
5. Use the right model: "haiku" for simple lookups/checks, "sonnet" for creative/analytical work
6. You MUST respond with ONLY valid JSON — no markdown fences, no explanation outside the JSON
7. Keep plans practical — aim for 3-8 steps
8. Only use skills from the available list below. If no skill fits, use null
</system>

<available-skills>
${skillsList}
</available-skills>

<user-goal>
${goal}
</user-goal>

Respond with ONLY this JSON structure:
{
  "plan_name": "Short descriptive name for this workflow",
  "plan_description": "One sentence explaining what this plan accomplishes",
  "steps": [
    {
      "order": 1,
      "title": "Short step title",
      "task_description": "Full task description that will be sent to Claude as the prompt",
      "skill": "skill-name-from-list-or-null",
      "model": "sonnet",
      "depends_on": []
    }
  ]
}

The "depends_on" array contains the order numbers of steps this step needs output from (e.g. [1, 2] means this step needs output from steps 1 and 2).`;

  const promptFile = path.join(shared.LOGS_DIR, `plan-prompt-${Date.now()}.txt`);
  fs.writeFileSync(promptFile, plannerPrompt);
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  const escapedPromptFile = shellEscape(promptFile);
  const catCmd = process.platform === 'win32' ? 'type' : 'cat';
  const cmd = `${catCmd} ${escapedPromptFile} | claude -p --dangerously-skip-permissions --output-format text --model sonnet --max-turns 3`;
  console.log(`[TaskMaster] Planning goal: "${goal.slice(0, 80)}..."`);
  try {
    const output = execSync(cmd, {
      env: cleanEnv, cwd: shared.BASE_DIR, shell: true, encoding: 'utf-8',
      timeout: 3 * 60 * 1000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    let jsonStr = output.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
    const plan = JSON.parse(jsonStr);
    const planningTime = Date.now() - startTime;
    console.log(`[TaskMaster] Plan generated: "${plan.plan_name}" (${plan.steps.length} steps) in ${planningTime}ms`);
    res.json({ ok: true, plan, meta: { planning_time_ms: planningTime, model_used: 'sonnet' } });
  } catch (err) {
    console.error('[TaskMaster] Plan generation failed:', err.message);
    const details = err.stdout ? err.stdout.slice(0, 500) : err.message;
    res.status(500).json({ ok: false, error: 'Planning failed. Claude may have returned invalid JSON.', details });
  } finally {
    try { fs.unlinkSync(promptFile); } catch (_) {}
  }
});

router.post('/plan/approve', (req, res) => {
  const { plan, space_id, working_dir, context, persona } = req.body;
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return res.status(400).json({ error: 'Plan with steps required' });
  }
  const tasks = readTasks();
  const createdIds = [];
  const totalSteps = plan.steps.length;
  const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);
  sortedSteps.forEach(step => {
    let taskDesc = `[Plan: "${plan.plan_name}" — Step ${step.order} of ${totalSteps}]\n\n`;
    if (step.depends_on && step.depends_on.length > 0) {
      const depNames = step.depends_on.map(depOrder => {
        const depStep = plan.steps.find(s => s.order === depOrder);
        return depStep ? `Step ${depOrder} (${depStep.title})` : `Step ${depOrder}`;
      });
      taskDesc += `This step depends on output from: ${depNames.join(', ')}.\nCheck the working directory for any files produced by those steps.\n\n`;
    }
    taskDesc += step.task_description;
    const allExisting = [...tasks, ...createdIds.map(id => ({ id }))];
    const newId = generateId(allExisting);
    const newTask = {
      id: newId, task: taskDesc, skill: step.skill || null, status: 'pending',
      priority: step.order, model: step.model || 'sonnet', max_turns: 25,
      context: context || [], extra_context: [],
      working_dir: working_dir || null, space_id: space_id || 'general',
      persona: persona || null,
      plan_id: plan.plan_name, plan_step: step.order, plan_total: totalSteps,
      worker: null, started_at: null, completed_at: null, result_file: null, error: null
    };
    tasks.push(newTask);
    createdIds.push({ id: newId });
  });
  writeTasks(tasks);
  console.log(`[TaskMaster] Approved plan "${plan.plan_name}": created ${createdIds.length} tasks`);
  res.json({ ok: true, tasks_created: createdIds.length, task_ids: createdIds.map(t => t.id) });
});

module.exports = router;
