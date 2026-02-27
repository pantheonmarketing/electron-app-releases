/**
 * worker.js — Single Claude Code worker
 *
 * Grabs next pending task from tasks.json, runs it via `claude -p`,
 * saves the result, marks task done/failed, loops until no more tasks.
 *
 * Usage: node worker.js <worker_id>
 */

const { execSync, spawn } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const WORKER_ID = process.argv[2] || '1';
const TARGET_TASK_ID = process.argv[3] || null;  // Optional: run only this specific task
// In packaged Electron, __dirname points inside app.asar (read-only, bundled files).
// The actual user data (tasks.json, skills.json, results/) lives in AppData/Roaming.
// Server passes the correct path via WORKER_BASE_DIR env var.
const BASE_DIR = process.env.WORKER_BASE_DIR || __dirname;
const TASKS_FILE = path.join(BASE_DIR, 'tasks.json');
const SKILLS_FILE = path.join(BASE_DIR, 'skills.json');
const RESULTS_DIR = path.join(BASE_DIR, 'results');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const LOCK_FILE = path.join(BASE_DIR, '.tasks.lock');

// Ensure dirs exist
[RESULTS_DIR, LOGS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Load skills registry
const skills = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf-8'));

// Clean env — remove CLAUDECODE to allow nested invocation
const cleanEnv = { ...process.env };
delete cleanEnv.CLAUDECODE;

// Simple file lock (spin-wait)
function acquireLock(maxWaitMs = 10000) {
  const start = Date.now();
  while (true) {
    try {
      fs.writeFileSync(LOCK_FILE, `worker-${WORKER_ID}`, { flag: 'wx' });
      return true;
    } catch (e) {
      if (Date.now() - start > maxWaitMs) {
        try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
        continue;
      }
      const waitUntil = Date.now() + 50;
      while (Date.now() < waitUntil) {}
    }
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

function readTasks() {
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  } catch (e) {
    log('WARNING: tasks.json corrupted, trying backup...');
    const backupFile = TASKS_FILE + '.bak';
    if (fs.existsSync(backupFile)) {
      try {
        const tasks = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
        log('Recovered from tasks.json.bak');
        fs.writeFileSync(TASKS_FILE, fs.readFileSync(backupFile));
        return tasks;
      } catch (_) {}
    }
    log('ERROR: No valid backup — returning empty');
    return [];
  }
}

function writeTasks(tasks) {
  const data = JSON.stringify(tasks, null, 2);
  const tmpFile = TASKS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, data);
  if (fs.existsSync(TASKS_FILE)) {
    fs.copyFileSync(TASKS_FILE, TASKS_FILE + '.bak');
  }
  fs.renameSync(tmpFile, TASKS_FILE);
}

let currentTaskId = null; // Track current task for live log

function log(msg) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${timestamp}] [W${WORKER_ID}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, `worker-${WORKER_ID}.log`), line + '\n');
  // Also write to per-task live log for web UI streaming
  if (currentTaskId) {
    fs.appendFileSync(path.join(LOGS_DIR, `live-${currentTaskId}.log`), line + '\n');
  }
}

function liveStatus(taskId, status, detail) {
  // Write a JSON status line for the web UI to poll
  const statusFile = path.join(LOGS_DIR, `live-${taskId}.json`);
  const data = {
    task_id: taskId,
    worker: `W${WORKER_ID}`,
    status,
    detail: detail || '',
    updated_at: new Date().toISOString()
  };
  try { fs.writeFileSync(statusFile, JSON.stringify(data)); } catch (_) {}
}

function grabNextTask() {
  acquireLock();
  try {
    const tasks = readTasks();

    // If targeting a specific task, only grab that one
    if (TARGET_TASK_ID) {
      const target = tasks.find(t => t.id === TARGET_TASK_ID && t.status === 'pending');
      if (!target) return null;
      const idx = tasks.findIndex(t => t.id === TARGET_TASK_ID);
      tasks[idx].status = 'running';
      tasks[idx].worker = `W${WORKER_ID}`;
      tasks[idx].started_at = new Date().toISOString();
      writeTasks(tasks);
      return target;
    }

    const pending = tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => (a.priority || 99) - (b.priority || 99));

    if (pending.length === 0) return null;

    const task = pending[0];
    const idx = tasks.findIndex(t => t.id === task.id);
    tasks[idx].status = 'running';
    tasks[idx].worker = `W${WORKER_ID}`;
    tasks[idx].started_at = new Date().toISOString();
    writeTasks(tasks);
    return task;
  } finally {
    releaseLock();
  }
}

function markTask(taskId, status, resultFile = null, error = null, claudeSessionId = null) {
  acquireLock();
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      tasks[idx].status = status;
      tasks[idx].completed_at = new Date().toISOString();
      if (resultFile) tasks[idx].result_file = resultFile;
      if (error) tasks[idx].error = error;
      if (claudeSessionId) tasks[idx].claudeSessionId = claudeSessionId;
    }
    writeTasks(tasks);
  } finally {
    releaseLock();
  }
}

function shellEscape(str) {
  return '"' + str.replace(/"/g, '\\"') + '"';
}

// Recursively read all files from a folder (up to maxDepth)
function readFolderFiles(folderPath, maxDepth = 2, currentDepth = 0) {
  let content = '';
  if (currentDepth > maxDepth) return content;
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, .git, etc.
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
        content += readFolderFiles(fullPath, maxDepth, currentDepth + 1);
      } else if (entry.isFile()) {
        // Only read text-like files
        const ext = path.extname(entry.name).toLowerCase();
        const textExts = ['.md', '.txt', '.json', '.js', '.ts', '.env', '.yaml', '.yml', '.toml', '.cfg', '.ini', '.sh', '.bat', '.cjs', '.mjs'];
        const isEnvFile = entry.name.startsWith('.env');
        if (textExts.includes(ext) || isEnvFile) {
          try {
            const fileContent = fs.readFileSync(fullPath, 'utf-8');
            // Skip huge files (>50KB per file)
            if (fileContent.length <= 50000) {
              // For large files (>15KB), include a summary header + truncated content
              if (fileContent.length > 15000) {
                content += `\n--- FILE: ${fullPath} (truncated — ${Math.round(fileContent.length/1024)}KB) ---\n${fileContent.slice(0, 15000)}\n... [truncated at 15KB]\n`;
              } else {
                content += `\n--- FILE: ${fullPath} ---\n${fileContent}\n`;
              }
            } else {
              content += `\n--- FILE: ${fullPath} (SKIPPED — ${Math.round(fileContent.length/1024)}KB too large) ---\n`;
            }
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
  return content;
}

// Run claude -p for a task using execSync (blocking, with live terminal output)
function runClaude(task) {
  const resultFile = path.join(RESULTS_DIR, `task-${task.id}.json`);

  // Build the full prompt: skill + context + task description
  // We pipe the full prompt via stdin to avoid command-line length limits
  let fullPrompt = '';
  let skillInjected = false;
  let skillSize = 0;
  let contextSize = 0;
  let contextFileCount = 0;

  // Helper: resolve skill/context paths (relative to app dir, or absolute)
  const resolvePath = (p) => path.isAbsolute(p) ? p : path.join(BASE_DIR, p);

  // 1. Inject skill content
  if (task.skill && skills[task.skill]) {
    const skillFile = resolvePath(skills[task.skill].file);
    if (fs.existsSync(skillFile)) {
      const skillContent = fs.readFileSync(skillFile, 'utf-8');
      skillSize = skillContent.length;
      fullPrompt += `<skill-instructions>\n${skillContent}\n</skill-instructions>\n\n`;
      skillInjected = true;
      log(`  Skill "${task.skill}" loaded: ${skillSize} chars (FULL content)`);
    } else {
      log(`  WARNING: Skill file not found: ${skillFile}`);
    }
  }

  // 2. Merge skill default context + task context (deduplicate)
  const skillContext = (task.skill && skills[task.skill] && skills[task.skill].context) ? skills[task.skill].context : [];
  const taskContext = task.context || [];
  // Merge: skill context first, then task context, deduplicated (normalize slashes for comparison)
  const normalize = p => p.replace(/\\/g, '/').toLowerCase();
  const seen = new Set();
  const mergedContext = [];
  for (const p of [...skillContext, ...taskContext]) {
    const key = normalize(p);
    if (!seen.has(key)) {
      seen.add(key);
      mergedContext.push(p);
    }
  }

  if (skillContext.length > 0) {
    log(`  Skill auto-context: ${skillContext.length} path(s) from skill definition`);
    if (skills[task.skill].context_notes) {
      log(`  → ${skills[task.skill].context_notes}`);
    }
  }
  if (taskContext.length > 0) {
    log(`  Task context: ${taskContext.length} path(s) from task/project`);
  }
  if (mergedContext.length > 0) {
    log(`  Merged context: ${mergedContext.length} unique path(s)`);
  }

  // Max total context size (chars) — keeps prompts under ~100K tokens
  const MAX_CONTEXT_CHARS = 80000;

  if (mergedContext.length > 0) {
    let contextContent = '';
    for (const rawCtxPath of mergedContext) {
      const ctxPath = resolvePath(rawCtxPath);
      if (!fs.existsSync(ctxPath)) {
        log(`  WARNING: Context path not found: ${ctxPath}`);
        continue;
      }
      const stat = fs.statSync(ctxPath);
      if (stat.isDirectory()) {
        log(`  Loading context folder: ${ctxPath}`);
        const folderContent = readFolderFiles(ctxPath);
        contextContent += folderContent;
      } else {
        log(`  Loading context file: ${ctxPath}`);
        try {
          const fileContent = fs.readFileSync(ctxPath, 'utf-8');
          contextContent += `\n--- FILE: ${ctxPath} ---\n${fileContent}\n`;
        } catch (e) {
          log(`  WARNING: Could not read ${ctxPath}: ${e.message}`);
        }
      }
      contextFileCount++;
    }
    if (contextContent) {
      // Truncate if context is too large — keeps the prompt manageable
      if (contextContent.length > MAX_CONTEXT_CHARS) {
        const originalSize = contextContent.length;
        contextContent = contextContent.slice(0, MAX_CONTEXT_CHARS)
          + `\n\n--- CONTEXT TRUNCATED (${Math.round(originalSize/1024)}KB → ${Math.round(MAX_CONTEXT_CHARS/1024)}KB) ---\n`
          + `The full context was too large. Only the first ${Math.round(MAX_CONTEXT_CHARS/1024)}KB is included.\n`;
        log(`  ⚠ Context truncated: ${Math.round(originalSize/1024)}KB → ${Math.round(MAX_CONTEXT_CHARS/1024)}KB`);
      }
      contextSize = contextContent.length;
      fullPrompt += `<project-context>\n${contextContent}\n</project-context>\n\n`;
      log(`  Context loaded: ${contextFileCount} source(s), ${contextSize} chars total`);
    }
  }

  // 3. Chain previous task output for sequential plan tasks
  //    If this task is part of a plan and depends on previous steps,
  //    inject the actual output from those completed tasks
  if (task.plan_id && task.plan_step && task.plan_step > 1) {
    const allTasks = readTasks();
    // Find previous tasks in the same plan that are done
    const planTasks = allTasks.filter(t =>
      t.plan_id === task.plan_id && t.status === 'done' && t.plan_step < task.plan_step
    ).sort((a, b) => (a.plan_step || 0) - (b.plan_step || 0));

    if (planTasks.length > 0) {
      let chainedOutput = '';
      for (const prevTask of planTasks) {
        const prevResultFile = path.join(RESULTS_DIR, `task-${prevTask.id}.json`);
        if (fs.existsSync(prevResultFile)) {
          try {
            const prevResult = JSON.parse(fs.readFileSync(prevResultFile, 'utf-8'));
            const prevOutput = prevResult.claude_response?.result || '';
            if (prevOutput) {
              // Truncate to 6000 chars per previous task to keep prompt manageable
              const truncated = prevOutput.length > 6000
                ? prevOutput.slice(0, 6000) + '\n... [truncated]'
                : prevOutput;
              chainedOutput += `\n--- Step ${prevTask.plan_step}: ${prevTask.task.split('\n')[0].replace(/\[Plan:.*?\]/, '').trim()} ---\n${truncated}\n`;
            }
          } catch (_) {}
        }
      }
      if (chainedOutput) {
        fullPrompt += `<previous-step-outputs>\nThe following outputs were produced by earlier steps in this plan. Use this information to inform your work:\n${chainedOutput}\n</previous-step-outputs>\n\n`;
        log(`  Chained output from ${planTasks.length} previous step(s) (${chainedOutput.length} chars)`);
      }
    }
  }

  // 4. Task description
  fullPrompt += `<task>\n${task.task}\n</task>`;

  // Write the full prompt to a temp file and pipe it via stdin
  const promptFile = path.join(LOGS_DIR, `prompt-${task.id}.txt`);
  fs.writeFileSync(promptFile, fullPrompt);
  log(`  Full prompt written to ${promptFile} (${fullPrompt.length} chars total)`);

  // Build the command — prompt comes via stdin (type on Windows, cat on Unix)
  const isWindows = process.platform === 'win32';
  const catCmd = isWindows ? 'type' : 'cat';
  const escapedPromptFile = shellEscape(promptFile);

  // Smart max_turns: heavy skills and large prompts get more turns
  let maxTurns = task.max_turns || 25;
  const heavySkills = ['fb-stories', 'adcreator', 'fb-story-video', 'longform-editor', 'youtube-creator', 'webinar-page', 'fb-ads'];
  if (task.skill && heavySkills.includes(task.skill) && maxTurns <= 25) {
    maxTurns = 50;
    log(`  Auto-increased max_turns to ${maxTurns} (heavy skill: ${task.skill})`);
  }
  // Plan tasks with dependencies get extra turns for the chained context
  if (task.plan_id && task.plan_step > 1 && maxTurns <= 25) {
    maxTurns = 35;
    log(`  Auto-increased max_turns to ${maxTurns} (plan task with dependencies)`);
  }

  // Generate a session ID so the conversation can be resumed later in a terminal
  const claudeSessionId = randomUUID();

  // Save claudeSessionId to task NOW (before execution) so the frontend can
  // create a terminal pane linked to this session while the task is running
  acquireLock();
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx !== -1) tasks[idx].claudeSessionId = claudeSessionId;
    writeTasks(tasks);
  } finally {
    releaseLock();
  }

  let cmd = `${catCmd} ${escapedPromptFile} | claude -p`;
  cmd += ` --dangerously-skip-permissions`;
  cmd += ` --output-format text`;
  cmd += ` --model ${task.model || 'sonnet'}`;
  cmd += ` --max-turns ${maxTurns}`;
  cmd += ` --session-id ${claudeSessionId}`;

  // Give Claude access to the working directory so it can read/write project files
  if (task.working_dir && fs.existsSync(task.working_dir)) {
    cmd += ` --add-dir ${shellEscape(task.working_dir)}`;
  }

  // Add allowed tools if specified
  if (task.allowed_tools) {
    cmd += ` --allowedTools ${shellEscape(task.allowed_tools)}`;
  }

  // Add budget cap if specified
  if (task.max_budget_usd) {
    cmd += ` --max-budget-usd ${task.max_budget_usd}`;
  }

  log(`Running: ${cmd.slice(0, 200)}...`);
  if (skillInjected) {
    log(`  Skill injection: FULL (${skillSize} chars) — piped via stdin`);
  }
  if (contextFileCount > 0) {
    log(`  Context injection: ${contextFileCount} source(s), ${contextSize} chars`);
  }
  liveStatus(task.id, 'running', `Skill: ${task.skill || 'none'} · Prompt: ${Math.round(fullPrompt.length/1000)}K chars · Executing...`);
  console.log('');
  console.log('─'.repeat(60));

  // Use spawn + manual timeout so we can taskkill the entire process tree on Windows.
  // execSync timeout doesn't reliably kill child processes, leaving orphan claude processes.
  const timeoutMs = (task.timeout_mins || 30) * 60 * 1000;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let timeoutId = null;

    const child = spawn(cmd, [], {
      env: cleanEnv,
      cwd: task.working_dir || BASE_DIR,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],  // stdin is handled by shell pipe (type file | claude)
      windowsHide: true
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    // Set up timeout that kills the ENTIRE process tree
    timeoutId = setTimeout(() => {
      killed = true;
      log(`Task ${task.id} timed out after ${task.timeout_mins || 30} minutes — killing process tree (PID ${child.pid})`);
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore', windowsHide: true });
        } else {
          execSync(`kill -9 ${child.pid}`, { stdio: 'ignore' });
        }
      } catch (_) {
        // Fallback: just kill the direct process
        try { child.kill('SIGKILL'); } catch (_2) {}
      }
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeoutId);

      console.log('─'.repeat(60));
      console.log('');

      if (killed) {
        // Timed out
        const result = {
          task_id: task.id, task_description: task.task,
          skill: task.skill || null, skill_injected: skillInjected,
          skill_chars: skillSize, context_files: contextFileCount, context_chars: contextSize,
          prompt_total_chars: fullPrompt.length,
          exit_code: 124,
          completed_at: new Date().toISOString(),
          claude_response: stdout.trim() ? { result: stdout } : null,
          raw_output: stdout, stderr,
          error: `Timed out after ${task.timeout_mins || 30} minutes`
        };
        fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

        if (stdout.trim()) {
          console.log('\x1b[33m--- Partial Output (before timeout) ---\x1b[0m');
          console.log(stdout);
          console.log('\x1b[33m--- End Output ---\x1b[0m');
        }

        return reject({ resultFile, result, code: 124, error: `Timed out after ${task.timeout_mins || 30} minutes`, claudeSessionId });
      }

      if (code === 0) {
        // Success
        console.log('\x1b[32m--- Claude Output ---\x1b[0m');
        console.log(stdout);
        console.log('\x1b[32m--- End Output ---\x1b[0m');
        console.log('');

        const result = {
          task_id: task.id, task_description: task.task,
          skill: task.skill || null, skill_injected: skillInjected,
          skill_chars: skillSize, context_files: contextFileCount, context_chars: contextSize,
          prompt_total_chars: fullPrompt.length,
          exit_code: 0,
          completed_at: new Date().toISOString(),
          claude_response: { result: stdout }
        };
        fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

        return resolve({ resultFile, result, claudeSessionId });
      } else {
        // Failed
        const result = {
          task_id: task.id, task_description: task.task,
          skill: task.skill || null, skill_injected: skillInjected,
          skill_chars: skillSize, context_files: contextFileCount, context_chars: contextSize,
          prompt_total_chars: fullPrompt.length,
          exit_code: code || 1,
          completed_at: new Date().toISOString(),
          claude_response: stdout.trim() ? { result: stdout } : null,
          raw_output: stdout, stderr,
          error: stderr.slice(0, 500) || `Exit code: ${code}`
        };
        fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

        if (stdout.trim()) {
          console.log('\x1b[33m--- Partial Output ---\x1b[0m');
          console.log(stdout);
          console.log('\x1b[33m--- End Output ---\x1b[0m');
        }

        return reject({ resultFile, result, code: code || 1, error: stderr.slice(0, 500) || `Exit code: ${code}`, claudeSessionId });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      const result = {
        task_id: task.id, task_description: task.task,
        skill: task.skill || null, skill_injected: skillInjected,
        skill_chars: skillSize, context_files: contextFileCount, context_chars: contextSize,
        prompt_total_chars: fullPrompt.length,
        exit_code: 1,
        completed_at: new Date().toISOString(),
        error: err.message?.slice(0, 500)
      };
      fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
      reject({ resultFile, result, code: 1, error: err.message, claudeSessionId });
    });
  });
}

// Phone home to server to clear worker from active list
function notifyDone() {
  try {
    const http = require('http');
    const data = JSON.stringify({ worker_id: `W${WORKER_ID}` });
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/api/workers/done',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    });
    req.on('error', () => {}); // ignore errors (server might be down)
    req.write(data);
    req.end();
  } catch (_) {}
}

// Main worker loop
async function main() {
  log(`Worker ${WORKER_ID} started`);

  while (true) {
    const task = grabNextTask();

    if (!task) {
      log('No more pending tasks. Worker exiting.');
      break;
    }

    currentTaskId = task.id;
    // Initialize live log file (clear previous if any)
    try { fs.writeFileSync(path.join(LOGS_DIR, `live-${task.id}.log`), ''); } catch (_) {}

    log(`Picked up task ${task.id}: "${task.task.slice(0, 60)}..." ${task.skill ? `[skill: ${task.skill}]` : ''}`);
    liveStatus(task.id, 'preparing', task.skill ? `Loading skill: ${task.skill}` : 'Building prompt...');

    try {
      const { resultFile, claudeSessionId } = await runClaude(task);
      markTask(task.id, 'done', resultFile, null, claudeSessionId);
      log(`Task ${task.id} completed successfully (session: ${claudeSessionId})`);
      liveStatus(task.id, 'done', 'Completed successfully');
    } catch (err) {
      const errorMsg = err.error || `Exit code: ${err.code}`;
      markTask(task.id, 'failed', err.resultFile || null, errorMsg, err.claudeSessionId || null);
      log(`Task ${task.id} failed: ${errorMsg}`);
      liveStatus(task.id, 'failed', errorMsg.slice(0, 200));
    }
    currentTaskId = null;

    console.log('');

    // If targeting a specific task, exit after running it (don't loop for more)
    if (TARGET_TASK_ID) {
      log(`Targeted task ${TARGET_TASK_ID} completed. Worker exiting.`);
      break;
    }
  }

  log(`Worker ${WORKER_ID} stopped`);
  notifyDone();
}

main().catch(err => {
  console.error('Worker crashed:', err);
  process.exit(1);
});
