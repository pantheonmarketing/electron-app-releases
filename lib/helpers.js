/**
 * lib/helpers.js — Shared helper functions for task-manager.
 * Reads paths from lib/shared.js.
 */

const fs = require('fs');
const path = require('path');
const shared = require('./shared');

// Write counter to detect reentrant calls
let _writeDepth = 0;

function readTasks() {
  if (!fs.existsSync(shared.TASKS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(shared.TASKS_FILE, 'utf-8'));
  } catch (e) {
    console.error('[!] tasks.json corrupted, attempting backup recovery...');
    const backupFile = shared.TASKS_FILE + '.bak';
    if (fs.existsSync(backupFile)) {
      try {
        const tasks = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
        console.log('[✓] Recovered from tasks.json.bak');
        fs.writeFileSync(shared.TASKS_FILE, fs.readFileSync(backupFile));
        return tasks;
      } catch (_) {}
    }
    console.error('[!] No valid backup found — starting fresh');
    return [];
  }
}

function writeTasks(tasks) {
  if (_writeDepth > 0) {
    console.warn('[!] Reentrant writeTasks() call detected — writing directly');
  }
  _writeDepth++;
  try {
    _writeTasksSync(tasks);
  } finally {
    _writeDepth--;
  }
}

function _writeTasksSync(tasks) {
  const data = JSON.stringify(tasks, null, 2);
  const tmpFile = shared.TASKS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, data);
  if (fs.existsSync(shared.TASKS_FILE)) {
    fs.copyFileSync(shared.TASKS_FILE, shared.TASKS_FILE + '.bak');
  }
  fs.renameSync(tmpFile, shared.TASKS_FILE);
}

function readSkills() {
  if (!fs.existsSync(shared.SKILLS_FILE)) return {};
  return JSON.parse(fs.readFileSync(shared.SKILLS_FILE, 'utf-8'));
}

function readProjects() {
  if (!fs.existsSync(shared.PROJECTS_FILE)) return {};
  return JSON.parse(fs.readFileSync(shared.PROJECTS_FILE, 'utf-8'));
}

function writeProjects(projects) {
  fs.writeFileSync(shared.PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

function readTemplates() {
  if (!fs.existsSync(shared.TEMPLATES_FILE)) return { templates: [], routines: [] };
  return JSON.parse(fs.readFileSync(shared.TEMPLATES_FILE, 'utf-8'));
}

function readWorkflowRuns() {
  if (!fs.existsSync(shared.WORKFLOW_RUNS_FILE)) return { runs: [] };
  try { return JSON.parse(fs.readFileSync(shared.WORKFLOW_RUNS_FILE, 'utf-8')); }
  catch (_) { return { runs: [] }; }
}

function writeWorkflowRuns(data) {
  const tmpFile = shared.WORKFLOW_RUNS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, shared.WORKFLOW_RUNS_FILE);
}

function generateId(tasks) {
  // Find max ID from current tasks AND from existing result files to avoid collisions
  let maxId = 0;
  for (const t of tasks) {
    const n = parseInt(t.id) || 0;
    if (n > maxId) maxId = n;
  }
  // Also check result files in case tasks were deleted but results remain
  try {
    const files = fs.readdirSync(shared.RESULTS_DIR);
    for (const f of files) {
      const m = f.match(/^task-(\d+)\.json$/);
      if (m) {
        const n = parseInt(m[1]) || 0;
        if (n > maxId) maxId = n;
      }
    }
  } catch (_) {}
  const next = maxId + 1;
  return String(next).padStart(Math.max(3, String(next).length), '0');
}

function shellEscape(str) {
  if (process.platform === 'win32') {
    // Windows cmd: wrap in double quotes, escape internal double quotes and percent signs
    return '"' + str.replace(/%/g, '%%').replace(/"/g, '\\"') + '"';
  }
  // Unix: wrap in single quotes, escape embedded single quotes
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function getNodeOutput(node, cachedTasks) {
  if (!node || node.status !== 'success' || !node.task_id) {
    console.log(`[Workflow] getNodeOutput: skip — node=${!!node} status=${node?.status} task_id=${node?.task_id}`);
    return '';
  }
  // Try RESULTS_DIR path first, then fall back to task.result_file from the tasks.json entry
  const candidates = [
    path.join(shared.RESULTS_DIR, `task-${node.task_id}.json`)
  ];
  // Also check the result_file stored on the task itself (may differ in Electron/AppData)
  const tasks = cachedTasks || readTasks();
  const task = tasks.find(t => t.id === node.task_id);
  if (task && task.result_file) {
    const absPath = path.isAbsolute(task.result_file) ? task.result_file : path.join(shared.BASE_DIR, task.result_file);
    if (!candidates.includes(absPath)) candidates.push(absPath);
  }
  for (const resultFile of candidates) {
    if (!fs.existsSync(resultFile)) continue;
    try {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
      const output = result.claude_response?.result || '';
      if (output) {
        console.log(`[Workflow] getNodeOutput(${node.task_id}): found ${output.length} chars from ${resultFile}`);
        return output;
      }
    } catch (_) {}
  }
  console.log(`[Workflow] getNodeOutput(${node.task_id}): NO output found. Tried: ${candidates.join(', ')}`);
  return '';
}

function buildPromptFromTemplate(tpl, vars) {
  let prompt = tpl.prompt_template || '';
  Object.entries(vars || {}).forEach(([key, val]) => {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  });
  prompt = prompt.replace(/\{[a-zA-Z_]+\}/g, '').replace(/\s{2,}/g, ' ').trim();
  return prompt;
}

function buildWorkflowPrompt(tpl, variables, run, nodeIndex) {
  console.log(`[Workflow] buildWorkflowPrompt: node ${nodeIndex}, template=${tpl.id}, variables=${JSON.stringify(variables)}`);
  const tasks = readTasks();
  const resolvedVars = { ...variables };
  if (nodeIndex > 0) {
    for (const [key, val] of Object.entries(resolvedVars)) {
      if (val === '{{prev}}') {
        resolvedVars[key] = getNodeOutput(run.nodes[nodeIndex - 1], tasks);
        if (!resolvedVars[key]) {
          console.log(`[Workflow] WARNING: {{prev}} resolved to empty for variable "${key}"`);
        }
      } else if (typeof val === 'string') {
        const stepMatch = val.match(/^\{\{step\.(\d+)\}\}$/);
        if (stepMatch) {
          const stepIdx = parseInt(stepMatch[1]) - 1;
          if (stepIdx >= 0 && stepIdx < nodeIndex) {
            resolvedVars[key] = getNodeOutput(run.nodes[stepIdx], tasks);
          }
        }
      }
    }
  }

  let prompt = buildPromptFromTemplate(tpl, resolvedVars);

  if (nodeIndex > 0) {
    let prevOutputs = '';
    const tplData = readTemplates();
    for (let i = 0; i < nodeIndex; i++) {
      const prevNode = run.nodes[i];
      const output = getNodeOutput(prevNode, tasks);
      if (output) {
        const truncated = output.length > 6000
          ? output.slice(0, 6000) + '\n... [truncated]'
          : output;
        const tplInfo = tplData.templates.find(t => t.id === prevNode.template_id);
        prevOutputs += `\n--- Step ${i + 1} (${tplInfo?.name || prevNode.template_id}) ---\n${truncated}\n`;
      }
    }
    if (prevOutputs) {
      prompt = `[Workflow: "${run.routine_name}" — Step ${nodeIndex + 1} of ${run.nodes.length}]\n\nPrevious step outputs:\n${prevOutputs}\n\nYour task:\n${prompt}`;
    }
  }

  return prompt;
}

function launchWorkersInternal(workerCount) {
  const debugLog = [];
  const log = (msg) => { console.log(`[RunAll] ${msg}`); debugLog.push(msg); };

  log(`launchWorkersInternal called with workerCount=${workerCount}`);
  log(`APP_DIR=${shared.APP_DIR}`);
  log(`BASE_DIR=${shared.BASE_DIR}`);

  const tasks = readTasks();
  const pending = tasks.filter(t => t.status === 'pending').length;
  log(`Tasks file has ${tasks.length} total, ${pending} pending`);
  if (pending === 0) return { ok: false, workers: 0, pending: 0, debug: debugLog };

  const actual = Math.min(workerCount, pending);
  shared.activeWorkers.clear();

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  // Prefer extracted worker.js in BASE_DIR (works with plain `node` outside .asar)
  // Fall back to APP_DIR for dev mode where they're the same folder
  const extractedWorker = path.join(shared.BASE_DIR, 'worker.js');
  const bundledWorker = path.join(shared.APP_DIR, 'worker.js');
  const workerScript = fs.existsSync(extractedWorker) ? extractedWorker : bundledWorker;
  const workerExists = fs.existsSync(workerScript);
  log(`Worker script: ${workerScript} (exists: ${workerExists})`);
  if (!workerExists) {
    log('ERROR: worker.js not found!');
    return { ok: false, workers: 0, pending, debug: debugLog, error: 'worker.js not found at ' + workerScript };
  }

  // Check launchWorkerProcess is set
  log(`launchWorkerProcess is: ${typeof shared.launchWorkerProcess}`);
  if (!shared.launchWorkerProcess) {
    log('ERROR: launchWorkerProcess is null/undefined — shared state not populated!');
    return { ok: false, workers: 0, pending, debug: debugLog, error: 'launchWorkerProcess not initialized' };
  }

  let launched = 0;
  for (let i = 1; i <= actual; i++) {
    const workerId = `W${i}`;
    log(`Attempting to launch Worker ${i}...`);

    try {
      const result = shared.launchWorkerProcess(workerScript, String(i), null, cleanEnv);
      log(`Worker ${i} launch result: ${result}`);
      if (result) {
        shared.activeWorkers.set(workerId, { startedAt: new Date().toISOString() });
        launched++;
        log(`Worker ${i} launched OK`);
      } else {
        log(`Worker ${i} launch returned false`);
      }
    } catch (err) {
      log(`Worker ${i} launch threw error: ${err.message}`);
    }
  }

  log(`Launch complete: ${launched}/${actual} workers started`);
  return { ok: launched > 0, workers: launched, pending, debug: debugLog };
}

module.exports = {
  readTasks,
  writeTasks,
  readSkills,
  readProjects,
  writeProjects,
  readTemplates,
  readWorkflowRuns,
  writeWorkflowRuns,
  generateId,
  shellEscape,
  getNodeOutput,
  buildPromptFromTemplate,
  buildWorkflowPrompt,
  launchWorkersInternal,
};
