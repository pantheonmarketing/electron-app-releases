/**
 * server.js — Task Manager API + Static File Server
 *
 * Serves the Kanban UI and provides REST API for task management.
 *
 * Usage: node server.js
 * Opens: http://localhost:3456
 */

require('dotenv').config();

// Prevent Electron crash on broken stdout/stderr pipe
process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });

const express = require('express');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const TerminalManager = require('./lib/terminal-manager');

// ── Platform helpers ──
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

function getAppDataDir() {
  if (IS_WIN) return process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
  if (IS_MAC) return path.join(require('os').homedir(), 'Library', 'Application Support');
  return path.join(require('os').homedir(), '.config'); // Linux
}

function killProcessTree(pid) {
  try {
    if (IS_WIN) {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    }
  } catch (_) {}
}

function openInFolder(filePath) {
  const { exec } = require('child_process');
  if (IS_WIN) {
    exec(`explorer /select,"${filePath.replace(/\//g, '\\\\')}"`);
  } else if (IS_MAC) {
    exec(`open -R "${filePath}"`);
  } else {
    exec(`xdg-open "${path.dirname(filePath)}"`);
  }
}

function launchWorkerProcess(workerScript, workerId, taskId, cleanEnv) {
  if (IS_WIN) {
    // Windows: write .bat file → hidden PowerShell launch → fallback to start /min
    const label = taskId ? `Task #${taskId}` : `Worker ${workerId}`;
    const batFile = path.join(LOGS_DIR, `launch-worker-${taskId || workerId}.bat`);
    const batContent = [
      '@echo off',
      `title Claude ${label}`,
      'set CLAUDECODE=',
      `cd /d "${BASE_DIR}"`,
      `node "${workerScript}" ${workerId}${taskId ? ' ' + taskId : ''}`,
    ].join('\r\n');
    fs.writeFileSync(batFile, batContent);

    try {
      const psCmd = `powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c','\\\"${batFile.replace(/\\/g, '\\\\')}\\\"' -WindowStyle Hidden"`;
      execSync(psCmd, { cwd: BASE_DIR, env: cleanEnv, shell: true, stdio: 'ignore', windowsHide: true });
      return true;
    } catch (_) {
      try {
        execSync(`start /min "Claude ${label}" cmd /c "${batFile}"`, { cwd: BASE_DIR, env: cleanEnv, shell: true, stdio: 'ignore', windowsHide: true });
        return true;
      } catch (_2) {
        return false;
      }
    }
  } else {
    // Mac/Linux: spawn detached node process
    const args = [workerScript, workerId];
    if (taskId) args.push(taskId);
    const child = spawn('node', args, {
      cwd: BASE_DIR,
      env: { ...cleanEnv, CLAUDECODE: '' },
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  }
}

// ── Resolve bundled tool paths for Electron ──
function getFFmpegPath() {
  if (process.env.ELECTRON_MODE) {
    // In packaged Electron app, ffmpeg is in extraResources/bin/
    const resourcePath = process.resourcesPath || path.join(__dirname, '..');
    const winBin = path.join(resourcePath, 'bin', 'ffmpeg.exe');
    const unixBin = path.join(resourcePath, 'bin', 'ffmpeg');
    if (IS_WIN && fs.existsSync(winBin)) return `"${winBin}"`;
    if (!IS_WIN && fs.existsSync(unixBin)) return `"${unixBin}"`;
  }
  return 'ffmpeg'; // fallback to system PATH
}
const FFMPEG_BIN = getFFmpegPath();

const app = express();
const terminalManager = new TerminalManager();
const PORT = parseInt(process.env.ELECTRON_PORT) || 3456;
const BASE_DIR = __dirname;
const TASKS_FILE = path.join(BASE_DIR, 'tasks.json');
const SKILLS_FILE = path.join(BASE_DIR, 'skills.json');
const PROJECTS_FILE = path.join(BASE_DIR, 'projects.json');
const TEMPLATES_FILE = path.join(BASE_DIR, 'templates.json');
const RESULTS_DIR = path.join(BASE_DIR, 'results');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const WORKFLOW_RUNS_FILE = path.join(BASE_DIR, 'workflow-runs.json');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');
const REEL_PROJECTS_DIR = path.join(BASE_DIR, 'reel-projects');
const REEL_PRESETS_DIR = path.join(BASE_DIR, 'reel-presets');
const WHISPER_CACHE_DIR = path.join(BASE_DIR, 'whisper-cache');
const HEYGEN_PROJECTS_DIR = path.join(BASE_DIR, 'heygen-projects');
const HEYGEN_CONFIG_FILE = path.join(BASE_DIR, 'heygen-config.json');

// Ensure dirs exist
[RESULTS_DIR, LOGS_DIR, UPLOADS_DIR, REEL_PROJECTS_DIR, REEL_PRESETS_DIR, WHISPER_CACHE_DIR, HEYGEN_PROJECTS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(BASE_DIR, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Health check — detect installed tools ──
function checkTool(cmd) {
  try {
    const out = execSync(cmd, { stdio: 'pipe', timeout: 8000, windowsHide: true, encoding: 'utf-8' });
    return { ok: true, version: out.trim().split('\n')[0].slice(0, 80) };
  } catch { return { ok: false }; }
}

app.get('/api/health', (req, res) => {
  const checks = {};

  // ffmpeg (bundled)
  checks.ffmpeg = checkTool(`${FFMPEG_BIN} -version`).ok;

  // python
  checks.python = checkTool('python --version').ok;

  // faster-whisper
  checks.whisper = checkTool('python -c "import faster_whisper; print(faster_whisper.__version__)"').ok;

  // claude CLI
  checks.claude = checkTool('claude --version').ok;

  // yt-dlp (for video transcription)
  checks.ytdlp = checkTool('yt-dlp --version').ok;

  checks.all_good = checks.ffmpeg && checks.python && checks.whisper && checks.claude && checks.ytdlp;
  checks.version = require('./package.json').version;
  res.json(checks);
});

// ── Detailed setup check — returns versions + install status ──
app.get('/api/setup/check', (req, res) => {
  const deps = {};

  // Python
  const py = checkTool('python --version');
  deps.python = { installed: py.ok, version: py.version || null, required: true,
    description: 'Required for AI transcription',
    installUrl: 'https://www.python.org/downloads/' };

  // Claude CLI
  const cl = checkTool('claude --version');
  deps.claude = { installed: cl.ok, version: cl.version || null, required: true,
    description: 'Required for AI task generation',
    installUrl: 'https://claude.ai/download' };

  // faster-whisper (pip)
  const fw = checkTool('python -c "import faster_whisper; print(faster_whisper.__version__)"');
  deps.faster_whisper = { installed: fw.ok, version: fw.version || null, required: false,
    description: 'Fast AI transcription (for Scripter)',
    pipPackage: 'faster-whisper' };

  // yt-dlp (pip)
  const yt = checkTool('yt-dlp --version');
  deps.ytdlp = { installed: yt.ok, version: yt.version || null, required: false,
    description: 'Download videos from TikTok, YouTube, etc.',
    pipPackage: 'yt-dlp' };

  // ffmpeg (bundled)
  const ff = checkTool(`${FFMPEG_BIN} -version`);
  deps.ffmpeg = { installed: ff.ok, version: ff.version || null, required: true,
    description: 'Video/audio processing (bundled)', bundled: true };

  const allRequired = deps.python.installed && deps.claude.installed && deps.ffmpeg.installed;
  const allOptional = deps.faster_whisper.installed && deps.ytdlp.installed;

  res.json({ deps, allRequired, allOptional, allGood: allRequired && allOptional });
});

// ── Install a pip package ──
app.post('/api/setup/install', express.json(), async (req, res) => {
  const { package: pkg } = req.body;
  const allowed = ['faster-whisper', 'yt-dlp'];
  if (!pkg || !allowed.includes(pkg)) {
    return res.status(400).json({ ok: false, error: `Invalid package. Allowed: ${allowed.join(', ')}` });
  }

  console.log(`[Setup] Installing ${pkg}...`);

  const runCmd = (cmd, opts) => new Promise((resolve, reject) => {
    const { exec: execCb } = require('child_process');
    execCb(cmd, opts, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; err.stdout = stdout; return reject(err); }
      resolve({ stdout, stderr });
    });
  });

  try {
    const { stdout, stderr } = await runCmd(`pip install ${pkg}`, {
      shell: true, encoding: 'utf-8', timeout: 120 * 1000, windowsHide: true
    });
    console.log(`[Setup] ${pkg} installed successfully`);
    res.json({ ok: true, package: pkg, output: stdout.slice(-500) });
  } catch (err) {
    console.error(`[Setup] Failed to install ${pkg}:`, err.message?.slice(0, 200));
    res.status(500).json({ ok: false, error: `Failed to install ${pkg}`, details: (err.stderr || err.message).slice(0, 500) });
  }
});

// Mark first-run setup as complete
app.post('/api/setup-complete', express.json(), (req, res) => {
  const setupFile = path.join(getAppDataDir(), 'electron', 'setup-done.json');
  try {
    fs.mkdirSync(path.dirname(setupFile), { recursive: true });
    fs.writeFileSync(setupFile, JSON.stringify({ completed_at: new Date().toISOString() }));
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true }); // Don't block even if file write fails
  }
});

// ── License tier endpoint + middleware ──
function getLicenseTier() {
  try {
    const licFile = path.join(getAppDataDir(), 'electron', 'license.json');
    if (fs.existsSync(licFile)) {
      const lic = JSON.parse(fs.readFileSync(licFile, 'utf-8'));
      return lic.tier || 'basic';
    }
  } catch (_) {}
  // If not in Electron mode (dev), default to lifetime (no restrictions)
  return process.env.ELECTRON_MODE ? 'basic' : 'lifetime';
}

app.get('/api/license-tier', (req, res) => {
  res.json({ tier: getLicenseTier() });
});

// Middleware: basic tier can SEE everything (GET allowed) but can't USE locked features (POST/PUT/DELETE blocked)
const LIFETIME_ONLY_PREFIXES = [
  '/api/tasks', '/api/run', '/api/stop', '/api/reset',
  '/api/plan', '/api/routines', '/api/schedules',
  '/api/terminal', '/api/workflow-runs', '/api/workers',
];
app.use((req, res, next) => {
  // Only enforce in Electron mode
  if (!process.env.ELECTRON_MODE) return next();
  const p = req.path;
  // Allow all GET requests — basic users can see everything
  if (req.method === 'GET') return next();
  // Check if this is a lifetime-only route (POST/PUT/DELETE)
  const isLocked = LIFETIME_ONLY_PREFIXES.some(prefix => p.startsWith(prefix));
  if (isLocked && getLicenseTier() === 'basic') {
    return res.status(403).json({ error: 'upgrade_required', tier: 'basic', message: 'Upgrade to Lifetime to unlock this feature.' });
  }
  next();
});

// ──────────────────────────────────────────────
// Multer config for Reel Master uploads
// ──────────────────────────────────────────────
const reelUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const projectId = req.params.projectId || 'temp';
      const dir = path.join(UPLOADS_DIR, projectId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp4|mov|avi|webm|mkv|mp3|wav|aac|m4a|ogg|jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Unsupported file type'));
  }
});

// Track active worker processes
const activeWorkers = new Map();

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function readTasks() {
  if (!fs.existsSync(TASKS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  } catch (e) {
    console.error('[!] tasks.json corrupted, attempting backup recovery...');
    const backupFile = TASKS_FILE + '.bak';
    if (fs.existsSync(backupFile)) {
      try {
        const tasks = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
        console.log('[✓] Recovered from tasks.json.bak');
        fs.writeFileSync(TASKS_FILE, fs.readFileSync(backupFile));
        return tasks;
      } catch (_) {}
    }
    console.error('[!] No valid backup found — starting fresh');
    return [];
  }
}

function writeTasks(tasks) {
  const data = JSON.stringify(tasks, null, 2);
  const tmpFile = TASKS_FILE + '.tmp';
  // Atomic write: tmp → backup → rename
  fs.writeFileSync(tmpFile, data);
  if (fs.existsSync(TASKS_FILE)) {
    fs.copyFileSync(TASKS_FILE, TASKS_FILE + '.bak');
  }
  fs.renameSync(tmpFile, TASKS_FILE);
}

function readSkills() {
  if (!fs.existsSync(SKILLS_FILE)) return {};
  return JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf-8'));
}

function readProjects() {
  if (!fs.existsSync(PROJECTS_FILE)) return {};
  return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
}

function readTemplates() {
  if (!fs.existsSync(TEMPLATES_FILE)) return { templates: [], routines: [] };
  return JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8'));
}

function writeProjects(projects) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

function readWorkflowRuns() {
  if (!fs.existsSync(WORKFLOW_RUNS_FILE)) return { runs: [] };
  try { return JSON.parse(fs.readFileSync(WORKFLOW_RUNS_FILE, 'utf-8')); }
  catch (_) { return { runs: [] }; }
}

function writeWorkflowRuns(data) {
  const tmpFile = WORKFLOW_RUNS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, WORKFLOW_RUNS_FILE);
}

function getNodeOutput(node) {
  if (!node || node.status !== 'success' || !node.task_id) return '';
  const resultFile = path.join(RESULTS_DIR, `task-${node.task_id}.json`);
  if (!fs.existsSync(resultFile)) return '';
  try {
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
    return result.claude_response?.result || '';
  } catch (_) { return ''; }
}

function buildWorkflowPrompt(tpl, variables, run, nodeIndex) {
  // Resolve {{prev}} and {{step.N}} variable references
  const resolvedVars = { ...variables };
  if (nodeIndex > 0) {
    for (const [key, val] of Object.entries(resolvedVars)) {
      if (val === '{{prev}}') {
        resolvedVars[key] = getNodeOutput(run.nodes[nodeIndex - 1]);
      } else if (typeof val === 'string') {
        const stepMatch = val.match(/^\{\{step\.(\d+)\}\}$/);
        if (stepMatch) {
          const stepIdx = parseInt(stepMatch[1]) - 1; // 1-indexed → 0-indexed
          if (stepIdx >= 0 && stepIdx < nodeIndex) {
            resolvedVars[key] = getNodeOutput(run.nodes[stepIdx]);
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
      const output = getNodeOutput(prevNode);
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

function generateId(tasks) {
  if (tasks.length === 0) return '001';
  const maxId = Math.max(...tasks.map(t => parseInt(t.id) || 0));
  return String(maxId + 1).padStart(3, '0');
}

function shellEscape(str) {
  return '"' + str.replace(/"/g, '\\"') + '"';
}

// ──────────────────────────────────────────────
// Schedules
// ──────────────────────────────────────────────

const SCHEDULES_FILE = path.join(BASE_DIR, 'schedules.json');

function readSchedules() {
  if (!fs.existsSync(SCHEDULES_FILE)) return { schedules: [] };
  try { return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8')); }
  catch (_) { return { schedules: [] }; }
}

function writeSchedules(data) {
  const d = JSON.stringify(data, null, 2);
  const tmp = SCHEDULES_FILE + '.tmp';
  fs.writeFileSync(tmp, d);
  if (fs.existsSync(SCHEDULES_FILE)) fs.copyFileSync(SCHEDULES_FILE, SCHEDULES_FILE + '.bak');
  fs.renameSync(tmp, SCHEDULES_FILE);
}

function computeNextRun(schedule) {
  if (!schedule.enabled) return null;
  const now = new Date();
  const { hour, minute } = schedule.time;

  // Try today first, then look ahead up to 7 days
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(hour, minute, 0, 0);

    // Must be in the future
    if (candidate <= now) continue;

    // Check day-of-week
    const dow = candidate.getDay(); // 0=Sun...6=Sat
    const days = schedule.days;
    if (days === 'daily') { return candidate.toISOString(); }
    if (days === 'weekdays' && dow >= 1 && dow <= 5) { return candidate.toISOString(); }
    if (days === 'weekends' && (dow === 0 || dow === 6)) { return candidate.toISOString(); }
    if (Array.isArray(days) && days.includes(dow)) { return candidate.toISOString(); }
  }
  return null;
}

function shouldFireNow(schedule) {
  if (!schedule.enabled) return false;
  const now = new Date();
  const { hour, minute } = schedule.time;

  // Check day-of-week
  const dow = now.getDay();
  const days = schedule.days;
  let dayMatch = false;
  if (days === 'daily') dayMatch = true;
  else if (days === 'weekdays') dayMatch = dow >= 1 && dow <= 5;
  else if (days === 'weekends') dayMatch = dow === 0 || dow === 6;
  else if (Array.isArray(days)) dayMatch = days.includes(dow);
  if (!dayMatch) return false;

  // Check time: within the current minute
  if (now.getHours() !== hour || now.getMinutes() !== minute) return false;

  // Check not already fired today
  if (schedule.last_run) {
    const lastRun = new Date(schedule.last_run);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    if (lastRun >= todayStart) return false; // Already ran today
  }

  return true;
}

function shouldFireCatchUp(schedule) {
  // Boot catch-up: fire if missed within last 5 minutes
  if (!schedule.enabled) return false;
  const now = new Date();
  const { hour, minute } = schedule.time;

  const scheduledTime = new Date(now);
  scheduledTime.setHours(hour, minute, 0, 0);

  const diffMs = now - scheduledTime;
  if (diffMs < 0 || diffMs > 5 * 60 * 1000) return false; // Not within 5-min window

  // Check day-of-week
  const dow = now.getDay();
  const days = schedule.days;
  let dayMatch = false;
  if (days === 'daily') dayMatch = true;
  else if (days === 'weekdays') dayMatch = dow >= 1 && dow <= 5;
  else if (days === 'weekends') dayMatch = dow === 0 || dow === 6;
  else if (Array.isArray(days)) dayMatch = days.includes(dow);
  if (!dayMatch) return false;

  // Check not already fired today
  if (schedule.last_run) {
    const lastRun = new Date(schedule.last_run);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    if (lastRun >= todayStart) return false;
  }

  return true;
}

function buildPromptFromTemplate(tpl, vars) {
  let prompt = tpl.prompt_template || '';
  Object.entries(vars || {}).forEach(([key, val]) => {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  });
  prompt = prompt.replace(/\{[a-zA-Z_]+\}/g, '').replace(/\s{2,}/g, ' ').trim();
  return prompt;
}

function launchWorkersInternal(workerCount) {
  const tasks = readTasks();
  const pending = tasks.filter(t => t.status === 'pending').length;
  if (pending === 0) return { ok: false, workers: 0, pending: 0 };

  const actual = Math.min(workerCount, pending);
  activeWorkers.clear();

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  let launched = 0;
  for (let i = 1; i <= actual; i++) {
    const workerId = `W${i}`;
    const workerScript = path.join(BASE_DIR, 'worker.js');

    if (launchWorkerProcess(workerScript, String(i), null, cleanEnv)) {
      activeWorkers.set(workerId, { startedAt: new Date().toISOString() });
      launched++;
      console.log(`[Server] Launched Worker ${i}`);
    } else {
      console.error(`[Server] Failed to launch Worker ${i}`);
    }
  }

  return { ok: launched > 0, workers: launched, pending };
}

function fireSchedule(schedule) {
  console.log(`[Scheduler] Firing: ${schedule.name}`);

  // Check if workers are already running
  const tasks = readTasks();
  const running = tasks.filter(t => t.status === 'running').length;
  if (running > 0) {
    console.log(`[Scheduler] Skipped "${schedule.name}" — ${running} tasks already running`);
    recordScheduleRun(schedule, 'skipped', 0, 0, 'Workers busy');
    return;
  }

  const tplData = readTemplates();
  const routine = tplData.routines.find(r => r.id === schedule.routine_id);
  if (!routine) {
    console.error(`[Scheduler] Routine "${schedule.routine_id}" not found`);
    recordScheduleRun(schedule, 'error', 0, 0, 'Routine not found');
    return;
  }

  let createdCount = 0;

  if (routine.source === 'task-master' && routine.plan) {
    // Plan-based routine
    const plan = routine.plan;
    const planId = plan.plan_name || routine.name;
    const steps = plan.steps || [];

    steps.forEach(step => {
      const id = generateId(tasks);
      const depNote = step.depends_on && step.depends_on.length > 0
        ? `\n\nThis step depends on output from: ${step.depends_on.map(d => `Step ${d}`).join(', ')}.\nCheck the working directory for any files produced by those steps.\n`
        : '';

      tasks.push({
        id,
        task: `[Plan: "${planId}" — Step ${step.order} of ${steps.length}]\n\n${step.task_description}${depNote}`,
        skill: step.skill || null,
        status: 'pending',
        priority: step.order,
        model: step.model || 'sonnet',
        max_turns: step.max_turns || 25,
        context: schedule.context || [],
        extra_context: [],
        working_dir: schedule.working_dir || null,
        space_id: schedule.space_id,
        plan_id: planId,
        plan_step: step.order,
        plan_total: steps.length
      });
      createdCount++;
    });

    writeTasks(tasks);
    const result = launchWorkersInternal(1); // Sequential for plans
    recordScheduleRun(schedule, 'ok', createdCount, result.workers);

  } else if (routine.tasks && routine.tasks.length > 0) {
    // Regular routine
    routine.tasks.forEach((rt, idx) => {
      const tpl = tplData.templates.find(t => t.id === rt.template_id);
      if (!tpl) { console.warn(`[Scheduler] Template "${rt.template_id}" not found, skipping`); return; }

      const prompt = buildPromptFromTemplate(tpl, rt.variables || {});
      const id = generateId(tasks);
      tasks.push({
        id,
        task: prompt,
        skill: tpl.skill || null,
        status: 'pending',
        priority: idx + 1,
        model: tpl.model || 'sonnet',
        max_turns: tpl.max_turns || 25,
        context: schedule.context || [],
        extra_context: [],
        working_dir: schedule.working_dir || null,
        space_id: schedule.space_id
      });
      createdCount++;
    });

    writeTasks(tasks);
    // Smart workers for regular routines
    const wCount = createdCount === 1 ? 1 : createdCount <= 3 ? 2 : 3;
    const result = launchWorkersInternal(wCount);
    recordScheduleRun(schedule, 'ok', createdCount, result.workers);

  } else {
    recordScheduleRun(schedule, 'error', 0, 0, 'Routine has no tasks');
  }
}

function recordScheduleRun(schedule, status, tasksCreated, workers, reason) {
  const data = readSchedules();
  const s = data.schedules.find(sc => sc.id === schedule.id);
  if (!s) return;

  s.last_run = new Date().toISOString();
  s.last_run_status = status;
  if (!s.history) s.history = [];
  s.history.unshift({
    fired_at: s.last_run,
    status,
    tasks_created: tasksCreated,
    workers_launched: workers,
    reason: reason || null
  });
  // Keep only last 10 entries
  if (s.history.length > 10) s.history = s.history.slice(0, 10);
  s.next_run = computeNextRun(s);

  writeSchedules(data);
  console.log(`[Scheduler] ${schedule.name}: ${status} (${tasksCreated} tasks, ${workers} workers)${reason ? ' — ' + reason : ''}`);
}

function runSchedulerTick() {
  const data = readSchedules();
  if (data.schedules.length === 0) return;

  data.schedules.forEach(s => {
    if (shouldFireNow(s) || shouldFireCatchUp(s)) {
      fireSchedule(s);
    }
  });
}

// ──────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────

// GET /api/tasks — List all tasks
app.get('/api/tasks', (req, res) => {
  res.json(readTasks());
});

// Helper: resolve skill/context paths (relative to app dir, or absolute)
const resolveSkillPath = (p) => path.isAbsolute(p) ? p : path.join(BASE_DIR, p);

// GET /api/skills — List available skills (with default context)
app.get('/api/skills', (req, res) => {
  const skills = readSkills();
  const result = Object.entries(skills).map(([name, info]) => ({
    name,
    description: info.description,
    exists: fs.existsSync(resolveSkillPath(info.file)),
    context: info.context || [],
    context_notes: info.context_notes || null
  }));
  res.json(result);
});

// POST /api/skills/scan — Scan project memory dirs for new *-skill.md files
app.post('/api/skills/scan', (req, res) => {
  const skills = readSkills();
  const projects = readProjects();
  const existingFiles = new Set(Object.values(skills).map(s => s.file.replace(/\\/g, '/')));
  const existingBaseNames = new Set(Object.values(skills).map(s => path.basename(s.file)));
  const added = [];

  // Collect all memory directories to scan
  const scanDirs = new Set();
  for (const [, proj] of Object.entries(projects)) {
    if (!proj.working_dir || !fs.existsSync(proj.working_dir)) continue;
    const wd = proj.working_dir.replace(/\\/g, '/');
    // Check .claude-portable/memory inside the project
    const portableMemory = path.join(wd, '.claude-portable', 'memory');
    if (fs.existsSync(portableMemory)) scanDirs.add(portableMemory);
    // Also check any context dirs that look like memory folders
    if (proj.context) {
      for (const ctx of proj.context) {
        const ctxNorm = ctx.replace(/\\/g, '/');
        if (ctxNorm.includes('/memory') && fs.existsSync(ctx) && fs.statSync(ctx).isDirectory()) {
          scanDirs.add(ctx);
        }
      }
    }
  }

  // Also scan the Claude projects memory directory pattern
  const claudeProjectsDir = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'projects');
  if (fs.existsSync(claudeProjectsDir)) {
    try {
      const projDirs = fs.readdirSync(claudeProjectsDir);
      for (const pd of projDirs) {
        const memDir = path.join(claudeProjectsDir, pd, 'memory');
        if (fs.existsSync(memDir) && fs.statSync(memDir).isDirectory()) {
          scanDirs.add(memDir);
        }
      }
    } catch (e) { /* ignore read errors */ }
  }

  // Scan each directory for *-skill.md files
  for (const dir of scanDirs) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('-skill.md'));
      for (const file of files) {
        const fullPath = path.join(dir, file).replace(/\\/g, '/');
        if (existingFiles.has(fullPath)) continue;
        if (existingBaseNames.has(file)) continue; // same file registered from another dir

        // Extract skill name from filename: "jonny-writer-skill.md" → "jonny-writer"
        const skillName = file.replace(/-skill\.md$/, '');
        if (skills[skillName]) continue; // already registered under this name

        // Extract description from file (line after the title)
        let description = 'No description';
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          // Find first non-empty, non-heading line
          for (let i = 1; i < Math.min(lines.length, 10); i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('#') && line !== '---') {
              description = line.length > 80 ? line.substring(0, 80) + '...' : line;
              break;
            }
          }
        } catch (e) { /* can't read file, use default description */ }

        skills[skillName] = {
          file: fullPath,
          description,
          context: []
        };
        existingFiles.add(fullPath);
        existingBaseNames.add(file);
        added.push({ name: skillName, description, file: fullPath });
      }
    } catch (e) { /* ignore dir read errors */ }
  }

  // Save if we found new skills
  if (added.length > 0) {
    fs.writeFileSync(SKILLS_FILE, JSON.stringify(skills, null, 2));
  }

  // Return full updated list + what was added
  const result = Object.entries(skills).map(([name, info]) => ({
    name,
    description: info.description,
    exists: fs.existsSync(info.file),
    context: info.context || [],
    context_notes: info.context_notes || null
  }));

  res.json({
    ok: true,
    total: result.length,
    added: added.length,
    new_skills: added.map(a => a.name),
    skills: result
  });
});

// GET /api/templates — List templates and routines
app.get('/api/templates', (req, res) => {
  res.json(readTemplates());
});

// GET /api/projects — List all project profiles
app.get('/api/projects', (req, res) => {
  const projects = readProjects();
  const result = Object.entries(projects).map(([id, p]) => ({
    id,
    name: p.name,
    working_dir: p.working_dir,
    context: p.context || [],
    valid: fs.existsSync(p.working_dir)
  }));
  res.json(result);
});

// POST /api/projects — Create/update a project profile
app.post('/api/projects', (req, res) => {
  const { id, name, working_dir, context } = req.body;
  if (!id || !name || !working_dir) return res.status(400).json({ error: 'id, name, working_dir required' });

  const projects = readProjects();
  projects[id] = { name, working_dir, context: context || [] };
  writeProjects(projects);
  res.json({ ok: true, project: projects[id] });
});

// DELETE /api/projects/:id — Delete a project profile
app.delete('/api/projects/:id', (req, res) => {
  const projects = readProjects();
  if (!projects[req.params.id]) return res.status(404).json({ error: 'Project not found' });
  delete projects[req.params.id];
  writeProjects(projects);
  res.json({ ok: true });
});

// POST /api/tasks — Create a new task
app.post('/api/tasks', (req, res) => {
  const { task, skill, priority, model, max_turns, max_budget_usd, allowed_tools, working_dir, context, space_id, extra_context } = req.body;

  if (!task) return res.status(400).json({ error: 'Task description required' });

  const tasks = readTasks();
  const newTask = {
    id: generateId(tasks),
    task,
    skill: skill || null,
    status: 'pending',
    priority: priority || 5,
    model: model || 'sonnet',
    max_turns: max_turns || 25,
    context: context || [],
    extra_context: extra_context || [],
    working_dir: working_dir || null,
    space_id: space_id || 'general',
    worker: null,
    started_at: null,
    completed_at: null,
    result_file: null,
    error: null
  };

  if (max_budget_usd) newTask.max_budget_usd = max_budget_usd;
  if (allowed_tools) newTask.allowed_tools = allowed_tools;

  tasks.push(newTask);
  writeTasks(tasks);
  res.json(newTask);
});

// PUT /api/tasks/:id — Update a task
app.put('/api/tasks/:id', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });

  Object.assign(tasks[idx], req.body);
  writeTasks(tasks);
  res.json(tasks[idx]);
});

// DELETE /api/tasks/:id — Delete a task
app.delete('/api/tasks/:id', (req, res) => {
  let tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });

  tasks.splice(idx, 1);
  writeTasks(tasks);
  res.json({ ok: true });
});

// POST /api/tasks/:id/move — Move task to a different status column
app.post('/api/tasks/:id/move', (req, res) => {
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

// POST /api/reset — Reset all tasks to pending
app.post('/api/reset', (req, res) => {
  const tasks = readTasks();
  tasks.forEach(t => {
    t.status = 'pending';
    t.worker = null;
    t.started_at = null;
    t.completed_at = null;
    t.result_file = null;
    t.error = null;
  });
  writeTasks(tasks);
  res.json({ ok: true, count: tasks.length });
});

// GET /api/tasks/:id/result — Get task result
app.get('/api/tasks/:id/result', (req, res) => {
  const resultFile = path.join(RESULTS_DIR, `task-${req.params.id}.json`);
  if (!fs.existsSync(resultFile)) {
    return res.status(404).json({ error: 'No result yet' });
  }
  res.json(JSON.parse(fs.readFileSync(resultFile, 'utf-8')));
});

// GET /api/tasks/:id/log — Get task log
app.get('/api/tasks/:id/log', (req, res) => {
  const logFile = path.join(LOGS_DIR, `task-${req.params.id}.log`);
  if (!fs.existsSync(logFile)) {
    return res.status(404).json({ error: 'No log yet' });
  }
  res.type('text/plain').send(fs.readFileSync(logFile, 'utf-8'));
});

// POST /api/run — Start workers in visible terminal windows
app.post('/api/run', (req, res) => {
  const tasks = readTasks();
  const pending = tasks.filter(t => t.status === 'pending').length;

  if (pending === 0) {
    return res.json({ ok: false, message: 'No pending tasks' });
  }

  // Smart auto-workers: calculate from pending count if not explicitly provided
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

// POST /api/tasks/:id/run — Run a single specific task
app.post('/api/tasks/:id/run', (req, res) => {
  const tasks = readTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ ok: false, message: 'Task not found' });
  if (task.status !== 'pending') return res.json({ ok: false, message: `Task is ${task.status}, not pending` });

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const workerId = `S${req.params.id}`; // "S" for single-task worker
  const workerScript = path.join(BASE_DIR, 'worker.js');

  if (launchWorkerProcess(workerScript, workerId, req.params.id, cleanEnv)) {
    activeWorkers.set(workerId, { startedAt: new Date().toISOString(), taskId: req.params.id });
    console.log(`[Server] Launched single-task worker for #${req.params.id}`);
    res.json({ ok: true, worker: workerId, task_id: req.params.id });
  } else {
    console.error(`[Server] Failed to launch worker for #${req.params.id}`);
    res.status(500).json({ ok: false, message: 'Failed to launch worker' });
  }
});

// POST /api/workers/done — Worker phones home when it finishes
app.post('/api/workers/done', (req, res) => {
  const { worker_id } = req.body;
  if (worker_id && activeWorkers.has(worker_id)) {
    activeWorkers.delete(worker_id);
    console.log(`[Server] Worker ${worker_id} reported done, removed from active list`);
  }
  res.json({ ok: true });
});

// GET /api/workers — Get active workers (derived from tasks.json as source of truth)
app.get('/api/workers', (req, res) => {
  const tasks = readTasks();
  const runningWorkers = [...new Set(tasks.filter(t => t.status === 'running' && t.worker).map(t => t.worker))];
  res.json({
    active: runningWorkers,
    count: runningWorkers.length
  });
});

// POST /api/tasks/archive — Archive done/failed tasks (bulk)
app.post('/api/tasks/archive', (req, res) => {
  const { task_ids } = req.body; // optional: specific IDs. If empty, archive all done+failed
  const tasks = readTasks();
  let count = 0;
  tasks.forEach(t => {
    if (task_ids && task_ids.length > 0) {
      if (task_ids.includes(t.id) && !t.archived) { t.archived = true; t.archived_at = new Date().toISOString(); count++; }
    } else {
      if ((t.status === 'done' || t.status === 'failed') && !t.archived) {
        t.archived = true;
        t.archived_at = new Date().toISOString();
        count++;
      }
    }
  });
  writeTasks(tasks);
  res.json({ ok: true, archived: count });
});

// POST /api/tasks/:id/unarchive — Restore a task from archive
app.post('/api/tasks/:id/unarchive', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  tasks[idx].archived = false;
  delete tasks[idx].archived_at;
  writeTasks(tasks);
  res.json({ ok: true });
});

// GET /api/tasks/:id/live — Get live status for a running task
app.get('/api/tasks/:id/live', (req, res) => {
  const statusFile = path.join(LOGS_DIR, `live-${req.params.id}.json`);
  if (!fs.existsSync(statusFile)) {
    return res.json({ status: 'unknown', detail: 'Waiting for worker...' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    res.json(data);
  } catch (e) {
    res.json({ status: 'unknown', detail: 'Reading status...' });
  }
});

// GET /api/tasks/:id/live-log — Get live log lines for a running task
app.get('/api/tasks/:id/live-log', (req, res) => {
  const logFile = path.join(LOGS_DIR, `live-${req.params.id}.log`);
  if (!fs.existsSync(logFile)) {
    return res.type('text/plain').send('');
  }
  const content = fs.readFileSync(logFile, 'utf-8');
  // Return last 30 lines
  const lines = content.split('\n').filter(l => l.trim());
  const last30 = lines.slice(-30).join('\n');
  res.type('text/plain').send(last30);
});

// POST /api/stop — Clear active workers (terminal windows must be closed manually)
app.post('/api/stop', (req, res) => {
  activeWorkers.clear();
  res.json({ ok: true, message: 'Worker tracking cleared. Close terminal windows manually if still open.' });
});

// ──────────────────────────────────────────────
// Task Master — AI Planner
// ──────────────────────────────────────────────

// POST /api/plan — Generate a task plan from a high-level goal
app.post('/api/plan', (req, res) => {
  const { goal } = req.body;
  if (!goal) return res.status(400).json({ error: 'Goal description required' });

  const startTime = Date.now();

  // Build skills summary for the planner prompt
  const skills = readSkills();
  const skillsList = Object.entries(skills)
    .filter(([, info]) => fs.existsSync(info.file))
    .map(([name, info]) => `- ${name}: ${info.description}`)
    .join('\n');

  // Build the planner prompt
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

  // Write prompt to temp file (stdin pipe approach for long prompts)
  const promptFile = path.join(LOGS_DIR, `plan-prompt-${Date.now()}.txt`);
  fs.writeFileSync(promptFile, plannerPrompt);

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const escapedPromptFile = shellEscape(promptFile);
  const catCmd = process.platform === 'win32' ? 'type' : 'cat';
  const cmd = `${catCmd} ${escapedPromptFile} | claude -p --dangerously-skip-permissions --output-format text --model sonnet --max-turns 3`;

  console.log(`[TaskMaster] Planning goal: "${goal.slice(0, 80)}..."`);

  try {
    const output = execSync(cmd, {
      env: cleanEnv,
      cwd: BASE_DIR,
      shell: true,
      encoding: 'utf-8',
      timeout: 3 * 60 * 1000,  // 3 min timeout
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    // Parse Claude's JSON response — strip markdown fences if present
    let jsonStr = output.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    // Try to find JSON object in the output
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
    }

    const plan = JSON.parse(jsonStr);
    const planningTime = Date.now() - startTime;

    console.log(`[TaskMaster] Plan generated: "${plan.plan_name}" (${plan.steps.length} steps) in ${planningTime}ms`);

    res.json({
      ok: true,
      plan,
      meta: { planning_time_ms: planningTime, model_used: 'sonnet' }
    });
  } catch (err) {
    console.error('[TaskMaster] Plan generation failed:', err.message);
    const details = err.stdout ? err.stdout.slice(0, 500) : err.message;
    res.status(500).json({
      ok: false,
      error: 'Planning failed. Claude may have returned invalid JSON.',
      details
    });
  } finally {
    try { fs.unlinkSync(promptFile); } catch (_) {}
  }
});

// POST /api/scripter/generate — Generate a video script using a framework
app.post('/api/scripter/generate', (req, res) => {
  const { framework, topic, rewriteScript, mode, voice, durationSecs } = req.body;
  if (!framework || !topic) return res.status(400).json({ error: 'Framework and topic required' });

  const startTime = Date.now();
  const scriptMode = mode || 'ads';
  const targetSecs = durationSecs || 30;
  const wordsLow = Math.round(targetSecs * 2.5);
  const wordsHigh = Math.round(targetSecs * 3);

  // Read the frameworks skill file as system context
  const frameworksPath = path.join(BASE_DIR, 'skills', 'scripter-frameworks.md');
  if (!fs.existsSync(frameworksPath)) return res.status(500).json({ error: 'Frameworks file not found' });
  const frameworksDoc = fs.readFileSync(frameworksPath, 'utf-8');

  // Build the mode instruction
  const modeInstruction = scriptMode === 'social'
    ? `Generate a viral SOCIAL MEDIA script (organic content for TikTok/Reels/Shorts) using the "${framework}" style.

This is NOT an ad. The goal is maximum watch time, saves, shares, and comments — NOT selling a product.
- NO product pitch, NO "link in bio", NO sales CTA
- End with an ENGAGEMENT prompt: a question, challenge, hot take, "comment if...", or cliffhanger that makes people respond
- Structure for retention: strong hook (first 2 seconds), curiosity loop or escalating value, satisfying payoff
- Feel like real content a creator would post, not a brand`
    : `Generate a complete video ad script using the "${framework}" framework.`;

  let userPrompt = `${modeInstruction}

Topic${scriptMode === 'ads' ? '/Product' : ''}: ${topic}

TARGET LENGTH: ${targetSecs} seconds (~${wordsLow}-${wordsHigh} words). This is important — write the script body to fit this duration when read aloud at a natural pace.`;

  // Voice/persona instruction
  if (voice) {
    userPrompt += `

VOICE/PERSONA: Write the entire script in this voice and tone:
${voice}
Match the word choice, slang, sentence structure, and energy of this persona. The script should sound like THIS person actually wrote and would say it — not a generic AI voice.`;
  }

  if (rewriteScript) {
    userPrompt += `

REWRITE MODE: Take the following existing script and rewrite it using the "${framework}" ${scriptMode === 'social' ? 'style' : 'framework structure'}. Preserve the best hooks and proof points but restructure the flow to follow the ${scriptMode === 'social' ? 'style' : 'framework'} exactly.

Existing script to rewrite:
---
${rewriteScript}
---`;
  }

  userPrompt += `

Output the script in the exact format specified in the system prompt. Include 5 hook variations and all ${scriptMode === 'social' ? 'sections' : 'framework sections'}.${scriptMode === 'social' ? ' Use ENGAGEMENT: instead of CTA: for the ending.' : ''}`;

  const fullPrompt = `<system>\n${frameworksDoc}\n</system>\n\n<user>\n${userPrompt}\n</user>`;

  const promptFile = path.join(LOGS_DIR, `scripter-prompt-${Date.now()}.txt`);
  fs.writeFileSync(promptFile, fullPrompt);

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const escapedPromptFile = shellEscape(promptFile);
  const catCmd = process.platform === 'win32' ? 'type' : 'cat';
  const cmd = `${catCmd} ${escapedPromptFile} | claude -p --dangerously-skip-permissions --output-format text --model sonnet --max-turns 1`;

  console.log(`[Scripter] Generating ${scriptMode}/${framework}/${targetSecs}s script for: "${topic.slice(0, 60)}..."`);

  try {
    const output = execSync(cmd, {
      env: cleanEnv,
      cwd: BASE_DIR,
      shell: true,
      encoding: 'utf-8',
      timeout: 2 * 60 * 1000,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    const genTime = Date.now() - startTime;
    console.log(`[Scripter] Script generated in ${genTime}ms`);

    res.json({ ok: true, script: output.trim(), framework, topic, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[Scripter] Generation failed:', err.message);
    const details = err.stdout ? err.stdout.slice(0, 500) : err.message;
    res.status(500).json({ ok: false, error: 'Script generation failed', details });
  } finally {
    try { fs.unlinkSync(promptFile); } catch (_) {}
  }
});

// POST /api/scripter/transcribe — Download video from URL and transcribe with Whisper
app.post('/api/scripter/transcribe', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const startTime = Date.now();
  const tmpId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const tmpDir = path.join(WHISPER_CACHE_DIR, tmpId);
  fs.mkdirSync(tmpDir, { recursive: true });

  const audioFile = path.join(tmpDir, 'audio.wav');

  console.log(`[Transcribe] Downloading audio from: ${url.slice(0, 80)}...`);

  const runCmd = (cmd, opts) => new Promise((resolve, reject) => {
    const { exec: execCb } = require('child_process');
    execCb(cmd, opts, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      resolve({ stdout, stderr });
    });
  });

  try {
    // Step 1: Download audio with yt-dlp (async — doesn't block event loop)
    const ytCmd = `yt-dlp -x --audio-format wav --no-playlist -o "${audioFile}" "${url}"`;
    await runCmd(ytCmd, {
      cwd: tmpDir, shell: true, encoding: 'utf-8',
      timeout: 120 * 1000, windowsHide: true
    });

    // yt-dlp sometimes appends the extension, find the actual file
    let actualAudio = audioFile;
    if (!fs.existsSync(audioFile)) {
      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.wav'));
      if (files.length > 0) {
        actualAudio = path.join(tmpDir, files[0]);
      } else {
        throw new Error('Audio download failed — no .wav file produced');
      }
    }

    const dlTime = Date.now() - startTime;
    console.log(`[Transcribe] Downloaded in ${dlTime}ms, transcribing with faster-whisper...`);

    // Step 2: Transcribe with faster-whisper (async — doesn't block event loop)
    const transcribeScript = path.join(BASE_DIR, 'transcribe.py');
    const whisperCmd = `python "${transcribeScript}" "${actualAudio}" base`;
    const whisperEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    const { stdout: whisperOut } = await runCmd(whisperCmd, {
      cwd: tmpDir, shell: true, encoding: 'utf-8',
      timeout: 5 * 60 * 1000, windowsHide: true, env: whisperEnv,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(whisperOut.trim());
    if (!result.ok) {
      throw new Error(result.error || 'Transcription failed');
    }

    const transcript = result.transcript;
    const totalTime = Date.now() - startTime;

    console.log(`[Transcribe] Done in ${totalTime}ms — ${transcript.length} chars (lang: ${result.language})`);

    res.json({
      ok: true,
      transcript,
      url,
      language: result.language,
      duration_ms: totalTime
    });

  } catch (err) {
    console.error('[Transcribe] Failed:', err.message?.slice(0, 300));
    const details = err.stderr ? err.stderr.slice(0, 500) : err.message;
    res.status(500).json({ ok: false, error: 'Transcription failed', details });
  } finally {
    // Clean up temp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

// POST /api/plan/approve — Create tasks from an approved plan
app.post('/api/plan/approve', (req, res) => {
  const { plan, space_id, working_dir, context } = req.body;
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return res.status(400).json({ error: 'Plan with steps required' });
  }

  const tasks = readTasks();
  const createdIds = [];
  const totalSteps = plan.steps.length;

  // Sort steps by order
  const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);

  sortedSteps.forEach(step => {
    // Build enhanced task description with plan context header
    let taskDesc = `[Plan: "${plan.plan_name}" — Step ${step.order} of ${totalSteps}]\n\n`;

    if (step.depends_on && step.depends_on.length > 0) {
      const depNames = step.depends_on.map(depOrder => {
        const depStep = plan.steps.find(s => s.order === depOrder);
        return depStep ? `Step ${depOrder} (${depStep.title})` : `Step ${depOrder}`;
      });
      taskDesc += `This step depends on output from: ${depNames.join(', ')}.\n`;
      taskDesc += `Check the working directory for any files produced by those steps.\n\n`;
    }

    taskDesc += step.task_description;

    // Generate unique ID (account for tasks we've already created in this batch)
    const allExisting = [...tasks, ...createdIds.map(id => ({ id }))];
    const newId = generateId(allExisting);

    const newTask = {
      id: newId,
      task: taskDesc,
      skill: step.skill || null,
      status: 'pending',
      priority: step.order,
      model: step.model || 'sonnet',
      max_turns: 25,
      context: context || [],
      extra_context: [],
      working_dir: working_dir || null,
      space_id: space_id || 'general',
      plan_id: plan.plan_name,
      plan_step: step.order,
      plan_total: totalSteps,
      worker: null,
      started_at: null,
      completed_at: null,
      result_file: null,
      error: null
    };

    tasks.push(newTask);
    createdIds.push({ id: newId });
  });

  writeTasks(tasks);
  console.log(`[TaskMaster] Approved plan "${plan.plan_name}": created ${createdIds.length} tasks`);

  res.json({
    ok: true,
    tasks_created: createdIds.length,
    task_ids: createdIds.map(t => t.id)
  });
});

// POST /api/routines — Save a plan as a reusable routine
app.post('/api/routines', (req, res) => {
  const { name, icon, description, plan } = req.body;
  if (!name || !plan) return res.status(400).json({ error: 'name and plan required' });

  const tplData = readTemplates();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Check for duplicate
  if (tplData.routines.find(r => r.id === id)) {
    return res.status(409).json({ error: 'Routine with that name already exists' });
  }

  const routine = {
    id,
    name: name.trim(),
    icon: icon || '🧠',
    description: description || plan.plan_description || '',
    source: 'task-master',
    plan
  };

  tplData.routines.push(routine);
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(tplData, null, 2));

  console.log(`[TaskMaster] Saved routine: "${name}" (${plan.steps.length} steps)`);
  res.json({ ok: true, routine });
});

// POST /api/routines/custom — Create a custom template-based routine
app.post('/api/routines/custom', (req, res) => {
  const { name, icon, description, tasks } = req.body;
  if (!name || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'name and tasks[] required' });
  }

  const tplData = readTemplates();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (tplData.routines.find(r => r.id === id)) {
    return res.status(409).json({ error: 'Routine with that name already exists' });
  }

  const routine = {
    id,
    name: name.trim(),
    icon: icon || '⚡',
    description: description || '',
    tasks
  };

  tplData.routines.push(routine);
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(tplData, null, 2));
  console.log(`[Routines] Created custom routine: "${name}" (${tasks.length} steps)`);
  res.json({ ok: true, routine });
});

// PUT /api/routines/:id — Update a routine
app.put('/api/routines/:id', (req, res) => {
  const tplData = readTemplates();
  const idx = tplData.routines.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Routine not found' });

  const { name, icon, description, tasks, plan } = req.body;
  if (name) {
    tplData.routines[idx].name = name.trim();
    // Update id if name changed
    const newId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (newId !== req.params.id && !tplData.routines.find(r => r.id === newId)) {
      tplData.routines[idx].id = newId;
    }
  }
  if (icon !== undefined) tplData.routines[idx].icon = icon;
  if (description !== undefined) tplData.routines[idx].description = description;
  if (tasks) tplData.routines[idx].tasks = tasks;
  if (plan) tplData.routines[idx].plan = plan;

  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(tplData, null, 2));
  res.json({ ok: true, routine: tplData.routines[idx] });
});

// DELETE /api/routines/:id — Delete a routine
app.delete('/api/routines/:id', (req, res) => {
  const tplData = readTemplates();
  const idx = tplData.routines.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Routine not found' });

  tplData.routines.splice(idx, 1);
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(tplData, null, 2));
  console.log(`[Routines] Deleted routine: ${req.params.id}`);
  res.json({ ok: true });
});

// ──────────────────────────────────────────────
// Schedule API
// ──────────────────────────────────────────────

// GET /api/schedules
app.get('/api/schedules', (req, res) => {
  const data = readSchedules();
  // Recompute next_run for all
  data.schedules.forEach(s => { s.next_run = computeNextRun(s); });
  res.json(data);
});

// POST /api/schedules — create new schedule
app.post('/api/schedules', (req, res) => {
  const { name, routine_id, time, days, space_id, working_dir, context } = req.body;
  if (!name || !routine_id || !time) {
    return res.status(400).json({ error: 'name, routine_id, and time are required' });
  }

  // Verify routine exists
  const tplData = readTemplates();
  const routine = tplData.routines.find(r => r.id === routine_id);
  if (!routine) {
    return res.status(404).json({ error: `Routine "${routine_id}" not found` });
  }

  const data = readSchedules();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

  const schedule = {
    id,
    name: name.trim(),
    routine_id,
    routine_name: routine.name,
    routine_icon: routine.icon || '📋',
    enabled: true,
    time: { hour: parseInt(time.hour), minute: parseInt(time.minute) },
    days: days || 'daily',
    space_id: space_id || 'general',
    working_dir: working_dir || null,
    context: context || [],
    created_at: new Date().toISOString(),
    last_run: null,
    last_run_status: null,
    history: []
  };
  schedule.next_run = computeNextRun(schedule);

  data.schedules.push(schedule);
  writeSchedules(data);

  console.log(`[Scheduler] Created schedule: "${name}" → ${routine.name} at ${time.hour}:${String(time.minute).padStart(2, '0')}`);
  res.json({ ok: true, schedule });
});

// PUT /api/schedules/:id — update schedule
app.put('/api/schedules/:id', (req, res) => {
  const data = readSchedules();
  const idx = data.schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });

  const updates = req.body;
  const s = data.schedules[idx];

  if (updates.enabled !== undefined) s.enabled = updates.enabled;
  if (updates.name) s.name = updates.name.trim();
  if (updates.time) s.time = { hour: parseInt(updates.time.hour), minute: parseInt(updates.time.minute) };
  if (updates.days) s.days = updates.days;
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

// DELETE /api/schedules/:id
app.delete('/api/schedules/:id', (req, res) => {
  const data = readSchedules();
  const idx = data.schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });
  const removed = data.schedules.splice(idx, 1)[0];
  writeSchedules(data);
  console.log(`[Scheduler] Deleted schedule: "${removed.name}"`);
  res.json({ ok: true });
});

// POST /api/schedules/:id/run-now — manually trigger
app.post('/api/schedules/:id/run-now', (req, res) => {
  const data = readSchedules();
  const schedule = data.schedules.find(s => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

  fireSchedule(schedule);
  // Re-read after fire (fireSchedule writes history)
  const updated = readSchedules();
  const s = updated.schedules.find(sc => sc.id === req.params.id);
  res.json({ ok: true, schedule: s });
});

// ──────────────────────────────────────────────
// Health / Status
// ──────────────────────────────────────────────

let claudeCliOk = false;
let claudeCliVersion = '';

function checkClaudeCli() {
  try {
    const result = execSync('claude --version', { timeout: 10000, encoding: 'utf-8', windowsHide: true }).trim();
    claudeCliOk = true;
    claudeCliVersion = result;
    return true;
  } catch (e) {
    claudeCliOk = false;
    claudeCliVersion = '';
    return false;
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    claude_cli: claudeCliOk,
    claude_version: claudeCliVersion,
    tasks: readTasks().length,
    uptime: process.uptime()
  });
});

// ──────────────────────────────────────────────
// Terminal API (Interactive Claude Sessions)
// ──────────────────────────────────────────────

// GET /api/terminal/sessions — List all sessions
app.get('/api/terminal/sessions', (req, res) => {
  res.json(terminalManager.listSessions());
});

// POST /api/terminal/sessions — Create a new interactive session
app.post('/api/terminal/sessions', (req, res) => {
  const { name, workingDir, skill, model } = req.body;
  try {
    const session = terminalManager.createSession({ name, workingDir, skill, model });
    res.json({ ok: true, session });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/terminal/sessions/:id — Get session details + full buffer
app.get('/api/terminal/sessions/:id', (req, res) => {
  const session = terminalManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// GET /api/terminal/sessions/:id/stream — SSE endpoint for real-time output
app.get('/api/terminal/sessions/:id/stream', (req, res) => {
  try {
    terminalManager.addSSEClient(req.params.id, res);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// POST /api/terminal/sessions/:id/input — Send user message to session stdin
app.post('/api/terminal/sessions/:id/input', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    terminalManager.sendInput(req.params.id, text);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/terminal/sessions/:id — Kill and remove session
app.delete('/api/terminal/sessions/:id', (req, res) => {
  try {
    terminalManager.removeSession(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/tasks/:id/attach-terminal — Create/reuse terminal session for a task
app.post('/api/tasks/:id/attach-terminal', (req, res) => {
  const tasks = readTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // If task already has a live terminal session, return it
  if (task.terminalSessionId) {
    const existing = terminalManager.getSession(task.terminalSessionId);
    if (existing && existing.status !== 'dead') {
      return res.json({ ok: true, session: existing, reused: true });
    }
  }

  try {
    const session = terminalManager.createSession({
      name: `#${task.id}: ${(task.task || '').substring(0, 35)}`,
      workingDir: task.working_dir || null,
      skill: task.skill || null,
      model: task.model || 'sonnet',
      claudeSessionId: task.claudeSessionId || null,
      linkedTaskId: task.id
    });

    // Save terminal session ID on the task
    const idx = tasks.findIndex(t => t.id === req.params.id);
    tasks[idx].terminalSessionId = session.id;
    writeTasks(tasks);

    res.json({ ok: true, session });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Workflow Runs (Sequential Execution Engine)
// ──────────────────────────────────────────────

// POST /api/workflow-runs — Start a sequential workflow run
app.post('/api/workflow-runs', (req, res) => {
  const { routine_id, space_id, working_dir, context } = req.body;
  const tplData = readTemplates();
  const routine = tplData.routines.find(r => r.id === routine_id);
  if (!routine) return res.status(404).json({ error: 'Routine not found' });
  if (!routine.tasks || routine.tasks.length === 0) return res.status(400).json({ error: 'Routine has no tasks' });

  const runId = 'wfr-' + Date.now();
  const nodes = [];

  // Build node list from routine tasks
  routine.tasks.forEach((rt, idx) => {
    nodes.push({
      index: idx,
      template_id: rt.template_id,
      variables: { ...(rt.variables || {}) },
      status: 'waiting',
      task_id: null,
      started_at: null,
      completed_at: null,
      output_preview: null
    });
  });

  // Create the first task
  const firstNode = nodes[0];
  const tpl = tplData.templates.find(t => t.id === firstNode.template_id);
  if (!tpl) return res.status(400).json({ error: `Template "${firstNode.template_id}" not found` });

  const run = {
    id: runId,
    routine_id,
    routine_name: routine.name,
    status: 'running',
    space_id: space_id || 'general',
    working_dir: working_dir || null,
    context: context || [],
    current_node_index: 0,
    nodes,
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null
  };

  const prompt = buildWorkflowPrompt(tpl, firstNode.variables, run, 0);
  const tasks = readTasks();
  const taskId = generateId(tasks);
  const newTask = {
    id: taskId,
    task: prompt,
    skill: tpl.skill || null,
    status: 'pending',
    priority: 1,
    model: tpl.model || 'sonnet',
    max_turns: tpl.max_turns || 25,
    context: context || [],
    extra_context: [],
    working_dir: working_dir || null,
    space_id: space_id || 'general',
    worker: null,
    started_at: null,
    completed_at: null,
    result_file: null,
    error: null,
    workflow_run_id: runId,
    workflow_node_index: 0
  };
  tasks.push(newTask);
  writeTasks(tasks);

  // Update node 0
  firstNode.status = 'running';
  firstNode.task_id = taskId;
  firstNode.started_at = new Date().toISOString();

  // Save run
  const wfData = readWorkflowRuns();
  wfData.runs.push(run);
  writeWorkflowRuns(wfData);

  // Launch 1 worker
  launchWorkersInternal(1);

  console.log(`[Workflow] Run ${runId} started: "${routine.name}" (${nodes.length} nodes, first task: ${taskId})`);
  res.json({ ok: true, run_id: runId, run });
});

// GET /api/workflow-runs — List workflow runs
app.get('/api/workflow-runs', (req, res) => {
  const data = readWorkflowRuns();
  if (req.query.active === 'true') {
    data.runs = data.runs.filter(r => r.status === 'running');
  }
  res.json(data);
});

// GET /api/workflow-runs/:id — Get single workflow run
app.get('/api/workflow-runs/:id', (req, res) => {
  const data = readWorkflowRuns();
  const run = data.runs.find(r => r.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'Workflow run not found' });
  res.json(run);
});

// Orchestration tick — check active workflow runs for progress
function checkWorkflowProgress() {
  const wfData = readWorkflowRuns();
  const tasks = readTasks();
  const tplData = readTemplates();
  let changed = false;

  for (const run of wfData.runs) {
    if (run.status !== 'running') continue;

    const currentNode = run.nodes[run.current_node_index];
    if (!currentNode || currentNode.status !== 'running') continue;

    // Find the task for this node
    const task = tasks.find(t => t.id === currentNode.task_id);
    if (!task) continue;

    if (task.status === 'done') {
      // Node succeeded
      currentNode.status = 'success';
      currentNode.completed_at = task.completed_at || new Date().toISOString();

      // Read output preview from result file
      if (task.result_file) {
        const resultFile = path.join(BASE_DIR, task.result_file);
        if (fs.existsSync(resultFile)) {
          try {
            const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
            currentNode.output_preview = (result.claude_response?.result || '').slice(0, 200);
          } catch (_) {}
        }
      }

      // Check if there's a next node
      const nextIndex = run.current_node_index + 1;
      if (nextIndex >= run.nodes.length) {
        // All nodes done!
        run.status = 'done';
        run.completed_at = new Date().toISOString();
        changed = true;
        console.log(`[Workflow] Run ${run.id} completed successfully (${run.nodes.length} nodes)`);
      } else {
        // Create next task
        const nextNode = run.nodes[nextIndex];
        const tpl = tplData.templates.find(t => t.id === nextNode.template_id);
        if (!tpl) {
          run.status = 'failed';
          run.error = `Template "${nextNode.template_id}" not found for node ${nextIndex}`;
          run.completed_at = new Date().toISOString();
          nextNode.status = 'error';
          changed = true;
          console.log(`[Workflow] Run ${run.id} FAILED: ${run.error}`);
          continue;
        }

        const prompt = buildWorkflowPrompt(tpl, nextNode.variables, run, nextIndex);
        const allTasks = readTasks();
        const newTaskId = generateId(allTasks);
        const newTask = {
          id: newTaskId,
          task: prompt,
          skill: tpl.skill || null,
          status: 'pending',
          priority: 1,
          model: tpl.model || 'sonnet',
          max_turns: tpl.max_turns || 25,
          context: run.context || [],
          extra_context: [],
          working_dir: run.working_dir || null,
          space_id: run.space_id || 'general',
          worker: null,
          started_at: null,
          completed_at: null,
          result_file: null,
          error: null,
          workflow_run_id: run.id,
          workflow_node_index: nextIndex
        };
        allTasks.push(newTask);
        writeTasks(allTasks);

        // Update run state
        nextNode.status = 'running';
        nextNode.task_id = newTaskId;
        nextNode.started_at = new Date().toISOString();
        run.current_node_index = nextIndex;
        changed = true;

        // Launch 1 worker for this task
        launchWorkersInternal(1);
        console.log(`[Workflow] Run ${run.id}: Node ${nextIndex} started (task ${newTaskId})`);
      }
    } else if (task.status === 'failed') {
      // Node failed — stop the workflow
      currentNode.status = 'error';
      currentNode.completed_at = task.completed_at || new Date().toISOString();
      run.status = 'failed';
      run.completed_at = new Date().toISOString();
      run.error = `Node ${run.current_node_index} failed: ${task.error || 'Unknown error'}`;
      changed = true;
      console.log(`[Workflow] Run ${run.id} FAILED at node ${run.current_node_index}: ${task.error || 'Unknown'}`);
    }
  }

  if (changed) {
    writeWorkflowRuns(wfData);
  }
}

// Run orchestration tick every 3 seconds
setInterval(checkWorkflowProgress, 3000);

// ──────────────────────────────────────────────
// Reel Master Helpers
// ──────────────────────────────────────────────

function readReelProject(id) {
  const file = path.join(REEL_PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (_) { return null; }
}

function writeReelProject(project) {
  project.updated_at = new Date().toISOString();
  const file = path.join(REEL_PROJECTS_DIR, `${project.id}.json`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
  return project;
}

function listReelProjects() {
  if (!fs.existsSync(REEL_PROJECTS_DIR)) return [];
  return fs.readdirSync(REEL_PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(REEL_PROJECTS_DIR, f), 'utf-8')); }
      catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function deleteReelProject(id) {
  const file = path.join(REEL_PROJECTS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const uploadDir = path.join(UPLOADS_DIR, id);
  if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
}

function readReelPreset(id) {
  const file = path.join(REEL_PRESETS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (_) { return null; }
}

function writeReelPreset(preset) {
  const file = path.join(REEL_PRESETS_DIR, `${preset.id}.json`);
  fs.writeFileSync(file, JSON.stringify(preset, null, 2));
  return preset;
}

function listReelPresets() {
  if (!fs.existsSync(REEL_PRESETS_DIR)) return [];
  return fs.readdirSync(REEL_PRESETS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(REEL_PRESETS_DIR, f), 'utf-8')); }
      catch (_) { return null; }
    })
    .filter(Boolean);
}

function getFileHash(filePath) {
  const hash = crypto.createHash('md5');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function defaultReelStyle() {
  return {
    preset_id: 'default-purple',
    colors: { primary: '#7B2FF2', secondary: '#C084FC', text: '#ffffff', background: '#0a0a12' },
    font: { family: 'Playfair Display', size: 48, weight: 700 },
    subtitle: { family: 'Inter', size: 32, shadow: true, position: 'bottom' },
    animation: { type: 'spring', damping: 18, stiffness: 120, mass: 0.7 },
    video: { zoom: 1.0, offsetX: 0, offsetY: 0, layout: 'bottom-half' }
  };
}

// ──────────────────────────────────────────────
// Reel Master API
// ──────────────────────────────────────────────

// List projects
app.get('/api/reel/projects', (req, res) => {
  const projects = listReelProjects().map(p => ({
    id: p.id, name: p.name, created_at: p.created_at, updated_at: p.updated_at,
    clip_count: (p.clips || []).length, scene_count: (p.scenes || []).length
  }));
  res.json(projects);
});

// Create project
app.post('/api/reel/projects', (req, res) => {
  const id = 'reel-' + Date.now();
  const project = {
    id,
    name: req.body.name || 'Untitled Reel',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    clips: [],
    scenes: [],
    music: null,
    style: defaultReelStyle(),
    output: { width: 1080, height: 1920, fps: 30, codec: 'h264', crf: 18 }
  };
  writeReelProject(project);
  res.json({ ok: true, project });
});

// Get project
app.get('/api/reel/projects/:id', (req, res) => {
  const project = readReelProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// Update project
app.put('/api/reel/projects/:id', (req, res) => {
  let project = readReelProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  // Merge top-level fields
  const allowed = ['name', 'clips', 'scenes', 'music', 'style', 'output', 'mode'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) project[key] = req.body[key];
  }
  writeReelProject(project);
  res.json({ ok: true, project });
});

// Delete project
app.delete('/api/reel/projects/:id', (req, res) => {
  deleteReelProject(req.params.id);
  res.json({ ok: true });
});

// Upload files to project
app.post('/api/reel/projects/:projectId/upload', reelUpload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const uploaded = req.files.map(f => {
    const relPath = `uploads/${req.params.projectId}/${f.filename}`;
    const ext = path.extname(f.originalname).toLowerCase();
    let type = 'clip';
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(ext)) type = 'image';
    else if (/\.(mp3|wav|aac|m4a|ogg)$/i.test(ext)) type = 'music';

    const clipObj = {
      id: 'clip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      filename: f.originalname,
      storedName: f.filename,
      path: relPath,
      size: f.size,
      type,
      mime: f.mimetype,
      whisper: null,
      added_at: new Date().toISOString()
    };

    project.clips.push(clipObj);
    return clipObj;
  });

  writeReelProject(project);
  res.json({ ok: true, files: uploaded });
});

// Extract audio from video using ffmpeg
app.post('/api/reel/projects/:projectId/extract-audio', express.json(), (req, res) => {
  const { clip_path } = req.body;
  if (!clip_path) return res.status(400).json({ error: 'clip_path required' });

  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const inputPath = path.join(BASE_DIR, clip_path);
  if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'Source file not found' });

  const outputName = path.basename(clip_path, path.extname(clip_path)) + '-audio.aac';
  const outputDir = path.join(UPLOADS_DIR, req.params.projectId);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, outputName);
  const relPath = `uploads/${req.params.projectId}/${outputName}`;

  try {
    execSync(`${FFMPEG_BIN} -i "${inputPath}" -vn -acodec aac -b:a 192k -y "${outputPath}"`, {
      stdio: 'pipe', timeout: 120000, windowsHide: true
    });

    const stat = fs.statSync(outputPath);
    const fileObj = {
      id: 'clip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      filename: outputName,
      storedName: outputName,
      path: relPath,
      size: stat.size,
      type: 'music',
      mime: 'audio/aac',
      added_at: new Date().toISOString()
    };

    project.clips.push(fileObj);
    writeReelProject(project);

    res.json({ ok: true, file: fileObj });
  } catch (e) {
    console.error('Audio extraction failed:', e.message);
    res.status(500).json({ error: 'Audio extraction failed: ' + (e.stderr ? e.stderr.toString().slice(-200) : e.message) });
  }
});

// Whisper transcription
const whisperJobs = new Map();

app.post('/api/reel/projects/:projectId/whisper', (req, res) => {
  const { clip_id } = req.body;
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const clip = project.clips.find(c => c.id === clip_id);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });

  const filePath = path.join(BASE_DIR, clip.path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Clip file missing' });

  // Check cache
  const hash = getFileHash(filePath);
  const cacheFile = path.join(WHISPER_CACHE_DIR, `${hash}.json`);
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    clip.whisper = cached;
    writeReelProject(project);
    return res.json({ ok: true, status: 'cached', result: cached });
  }

  // Start whisper process
  const jobId = 'wh-' + Date.now();
  const outputDir = path.join(WHISPER_CACHE_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  const args = [filePath, '--model', 'small', '--language', 'en',
    '--word_timestamps', 'True', '--output_format', 'json', '--output_dir', outputDir];

  const proc = spawn('whisper', args, { windowsHide: true, shell: true });
  whisperJobs.set(jobId, { status: 'processing', clip_id, project_id: req.params.projectId, progress: 0, proc });

  let stderrBuf = '';
  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split('\n');
    for (const line of lines) {
      const match = line.match(/(\d+)%\|/);
      if (match) {
        const job = whisperJobs.get(jobId);
        if (job) job.progress = parseInt(match[1]);
      }
    }
  });

  proc.on('close', (code) => {
    const job = whisperJobs.get(jobId);
    if (!job) return;
    if (code === 0) {
      try {
        const outputFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.json'));
        if (outputFiles.length > 0) {
          const result = JSON.parse(fs.readFileSync(path.join(outputDir, outputFiles[0]), 'utf-8'));
          fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
          const proj = readReelProject(job.project_id);
          if (proj) {
            const c = proj.clips.find(c => c.id === job.clip_id);
            if (c) { c.whisper = result; writeReelProject(proj); }
          }
          job.status = 'done';
          job.result = result;
        } else {
          job.status = 'error';
          job.error = 'Whisper produced no output';
        }
      } catch (e) {
        job.status = 'error';
        job.error = e.message;
      }
    } else {
      job.status = 'error';
      job.error = `Whisper exited with code ${code}`;
    }
    try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch (_) {}
  });

  res.json({ ok: true, job_id: jobId, status: 'processing' });
});

app.get('/api/reel/whisper-status/:jobId', (req, res) => {
  const job = whisperJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const response = { status: job.status, progress: job.progress };
  if (job.status === 'done') response.result = job.result;
  if (job.status === 'error') response.error = job.error;
  res.json(response);
});

// Generate scenes from Whisper data
app.post('/api/reel/projects/:projectId/generate-scenes', (req, res) => {
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const maxWords = req.body.max_words_per_scene || 8;
  const scenes = [];
  let sceneIdx = 0;
  const debug = { clips_checked: 0, clips_with_whisper: 0, segments_found: 0, words_found: 0, fallback_used: false };

  for (const clip of project.clips) {
    debug.clips_checked++;
    if (clip.type !== 'clip') continue;
    if (!clip.whisper) continue;
    debug.clips_with_whisper++;

    // Support multiple whisper output formats
    const segments = clip.whisper.segments || [];
    debug.segments_found += segments.length;

    for (const seg of segments) {
      const words = seg.words || [];
      debug.words_found += words.length;

      if (words.length > 0) {
        // Word-level timestamps available — group into scenes
        let buf = [];
        for (const w of words) {
          buf.push(w);
          const text = buf.map(b => (b.word || '')).join('').trim();
          const endsWithPunctuation = /[.!?]$/.test(text);
          if (buf.length >= maxWords || endsWithPunctuation) {
            scenes.push({
              id: 'scene-' + (++sceneIdx),
              clip_id: clip.id,
              start: buf[0].start,
              end: buf[buf.length - 1].end + 0.3,
              words: buf.map(b => ({ word: (b.word || '').trim(), start: b.start, end: b.end })),
              text: buf.map(b => (b.word || '')).join('').trim(),
              images: [],
              text_overlay: '',
              display_mode: 'subtitles',
              mfx_preset: 'none',
              mfx_opacity: 0.5,
              mfx_instructions: ''
            });
            buf = [];
          }
        }
        if (buf.length > 0) {
          scenes.push({
            id: 'scene-' + (++sceneIdx),
            clip_id: clip.id,
            start: buf[0].start,
            end: buf[buf.length - 1].end + 0.3,
            words: buf.map(b => ({ word: (b.word || '').trim(), start: b.start, end: b.end })),
            text: buf.map(b => (b.word || '')).join('').trim(),
            images: [],
            text_overlay: '',
            mfx_preset: 'none',
            mfx_opacity: 0.5,
            mfx_instructions: ''
          });
        }
      } else if (seg.text && seg.start != null && seg.end != null) {
        // Fallback: no word-level timestamps, use segment as a single scene
        debug.fallback_used = true;
        const segText = (seg.text || '').trim();
        if (segText) {
          // Split segment text into fake words for subtitle display
          const fakeWords = segText.split(/\s+/).filter(Boolean);
          const segDuration = seg.end - seg.start;
          const wordDur = fakeWords.length > 0 ? segDuration / fakeWords.length : segDuration;
          scenes.push({
            id: 'scene-' + (++sceneIdx),
            clip_id: clip.id,
            start: seg.start,
            end: seg.end + 0.3,
            words: fakeWords.map((w, wi) => ({
              word: w,
              start: seg.start + wi * wordDur,
              end: seg.start + (wi + 1) * wordDur
            })),
            text: segText,
            images: [],
            text_overlay: '',
            mfx_preset: 'none',
            mfx_opacity: 0.5,
            mfx_instructions: ''
          });
        }
      }
    }

    // Last resort: if whisper has .text but no segments at all, create one big scene
    if (segments.length === 0 && clip.whisper.text) {
      debug.fallback_used = true;
      const fullText = (clip.whisper.text || '').trim();
      if (fullText) {
        // Split into chunks of ~maxWords words each
        const allWords = fullText.split(/\s+/).filter(Boolean);
        for (let i = 0; i < allWords.length; i += maxWords) {
          const chunk = allWords.slice(i, i + maxWords);
          scenes.push({
            id: 'scene-' + (++sceneIdx),
            clip_id: clip.id,
            start: null,
            end: null,
            words: chunk.map(w => ({ word: w, start: null, end: null })),
            text: chunk.join(' '),
            images: [],
            text_overlay: '',
            mfx_preset: 'none',
            mfx_opacity: 0.5,
            mfx_instructions: ''
          });
        }
      }
    }
  }

  // Merge tiny scenes (fewer than 3 words) into their neighbor
  const MIN_WORDS = 3;
  for (let i = scenes.length - 1; i >= 0; i--) {
    const s = scenes[i];
    if ((s.words || []).length < MIN_WORDS && scenes.length > 1) {
      // Prefer merging into previous scene, fallback to next
      const mergeIdx = i > 0 ? i - 1 : i + 1;
      const target = scenes[mergeIdx];
      if (i > 0) {
        // Append to previous
        target.words = (target.words || []).concat(s.words || []);
        target.text = target.words.map(w => w.word).join(' ');
        target.end = s.end;
      } else {
        // Prepend to next
        target.words = (s.words || []).concat(target.words || []);
        target.text = target.words.map(w => w.word).join(' ');
        target.start = s.start;
      }
      scenes.splice(i, 1);
    }
  }

  // Re-number scene IDs after merges
  scenes.forEach((s, idx) => { s.id = 'scene-' + (idx + 1); });

  // Store original_text on each scene for undo support
  for (const scene of scenes) {
    scene.original_text = scene.text;
  }

  project.scenes = scenes;
  writeReelProject(project);
  console.log(`[ReelMaster] Generated ${scenes.length} scenes from ${debug.clips_with_whisper}/${debug.clips_checked} clips (${debug.segments_found} segments, ${debug.words_found} words, fallback: ${debug.fallback_used})`);
  res.json({ ok: true, scenes, debug });
});

// AI Image Generation — uses SkillBoss api-hub.js
app.post('/api/reel/projects/:projectId/generate-image', (req, res) => {
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ ok: false, error: 'Project not found' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ ok: false, error: 'No prompt provided' });

  // Find SkillBoss api-hub.js
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const skillbossPaths = [
    path.join(homeDir, '.claude', 'skills', 'skillboss', 'scripts', 'api-hub.js'),
    path.join(homeDir, 'Downloads', 'skillboss', 'skillboss', 'scripts', 'api-hub.js'),
  ];
  const apiHub = skillbossPaths.find(p => fs.existsSync(p));
  if (!apiHub) {
    return res.json({ ok: false, error: 'SkillBoss not found. Install it first.' });
  }

  // Generate filename and output path
  const filename = `ai-gen-${Date.now()}.png`;
  const uploadsDir = path.join(BASE_DIR, 'uploads', req.params.projectId);
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const outputPath = path.join(uploadsDir, filename);

  // Call SkillBoss image generation
  const { execSync: execSyncLocal } = require('child_process');
  try {
    execSyncLocal(`node "${apiHub}" image --prompt "${prompt.replace(/"/g, '\\"')}" --size "1024*1024" --output "${outputPath}"`, {
      timeout: 60000,
      encoding: 'utf-8',
      stdio: 'pipe',
      windowsHide: true
    });

    if (!fs.existsSync(outputPath)) {
      return res.json({ ok: false, error: 'Image generation completed but file not found' });
    }

    // Add to project clips
    const clipPath = `uploads/${req.params.projectId}/${filename}`;
    const clip = {
      path: clipPath,
      storedName: filename,
      originalName: filename,
      type: 'image',
      size: fs.statSync(outputPath).size,
    };
    project.clips.push(clip);
    writeReelProject(project);

    res.json({ ok: true, url: `/${clipPath}`, clip, filename });
  } catch (err) {
    console.error('[AI Image Gen] Error:', err.message?.slice(0, 200));
    res.json({ ok: false, error: err.stderr?.slice(0, 200) || err.message?.slice(0, 200) || 'Generation failed' });
  }
});

// Image search — supports multiple sources: pexels, pixabay, google
app.get('/api/reel/image-search', async (req, res) => {
  const query = req.query.q;
  const source = req.query.source || 'pexels';
  if (!query) return res.json({ ok: false, error: 'No query', results: [] });

  try {
    if (source === 'pexels') {
      const apiKey = process.env.PEXELS_API_KEY || '';
      if (!apiKey) return res.json({ ok: false, error: 'PEXELS_API_KEY not set. Get a free key at pexels.com/api', results: [] });
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=40`;
      const resp = await fetch(url, { headers: { Authorization: apiKey } });
      if (!resp.ok) return res.json({ ok: false, error: `Pexels error: ${resp.status}`, results: [] });
      const data = await resp.json();
      const results = (data.photos || []).map(p => ({
        id: p.id, thumb: p.src.small, url: p.src.large, original: p.src.original,
        photographer: p.photographer, alt: p.alt || query, source: 'pexels'
      }));
      return res.json({ ok: true, results });
    }

    if (source === 'pixabay') {
      const apiKey = process.env.PIXABAY_API_KEY || '';
      if (!apiKey) return res.json({ ok: false, error: 'PIXABAY_API_KEY not set. Get a free key at pixabay.com/api/docs/', results: [] });
      const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=40&image_type=photo&safesearch=true`;
      const resp = await fetch(url);
      if (!resp.ok) return res.json({ ok: false, error: `Pixabay error: ${resp.status}`, results: [] });
      const data = await resp.json();
      const results = (data.hits || []).map(p => ({
        id: p.id, thumb: p.previewURL, url: p.largeImageURL, original: p.largeImageURL,
        photographer: p.user, alt: p.tags || query, source: 'pixabay'
      }));
      return res.json({ ok: true, results });
    }

    if (source === 'google') {
      // Google Custom Search JSON API — 100 free queries/day
      const apiKey = process.env.GOOGLE_SEARCH_API_KEY || '';
      const cx = process.env.GOOGLE_SEARCH_CX || '';
      if (!apiKey || !cx) return res.json({ ok: false, error: 'Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX in .env. Get them at programmablesearchengine.google.com', results: [] });
      // Fetch 2 pages (10 each) for 20 results
      const results = [];
      for (const start of [1, 11]) {
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&num=10&start=${start}&imgSize=large&safe=active`;
        const resp = await fetch(url);
        if (!resp.ok) {
          if (start === 1) return res.json({ ok: false, error: `Google API error: ${resp.status}`, results: [] });
          break;
        }
        const data = await resp.json();
        for (const item of (data.items || [])) {
          results.push({
            id: item.link, thumb: item.image?.thumbnailLink || item.link,
            url: item.link, original: item.link,
            photographer: item.displayLink || '', alt: item.title || query, source: 'google'
          });
        }
      }
      return res.json({ ok: true, results });
    }

    res.json({ ok: false, error: `Unknown source: ${source}`, results: [] });
  } catch (e) {
    res.json({ ok: false, error: e.message, results: [] });
  }
});

// Download external image to project uploads
app.post('/api/reel/projects/:projectId/download-image', async (req, res) => {
  const { url, filename } = req.body;
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());

    const dir = path.join(UPLOADS_DIR, req.params.projectId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = (filename || 'image').replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + Date.now() + '.jpg';
    const filePath = path.join(dir, safeName);
    fs.writeFileSync(filePath, buffer);

    const relPath = `uploads/${req.params.projectId}/${safeName}`;
    const clipObj = {
      id: 'clip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      filename: filename || 'pexels-image.jpg',
      storedName: safeName,
      path: relPath,
      size: buffer.length,
      type: 'image',
      mime: 'image/jpeg',
      whisper: null,
      added_at: new Date().toISOString()
    };
    project.clips.push(clipObj);
    writeReelProject(project);
    res.json({ ok: true, clip: clipObj });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Preset CRUD
app.get('/api/reel/presets', (req, res) => {
  let presets = listReelPresets();
  // Ensure default preset exists
  if (!presets.find(p => p.id === 'default-purple')) {
    const def = { id: 'default-purple', name: 'Purple Premium', description: 'Default dark purple theme', style: defaultReelStyle() };
    writeReelPreset(def);
    presets.unshift(def);
  }
  res.json(presets);
});

app.post('/api/reel/presets', (req, res) => {
  const { name, description, style } = req.body;
  const preset = {
    id: 'preset-' + Date.now(),
    name: name || 'Custom Preset',
    description: description || '',
    style: style || defaultReelStyle()
  };
  writeReelPreset(preset);
  res.json({ ok: true, preset });
});

app.delete('/api/reel/presets/:id', (req, res) => {
  if (req.params.id === 'default-purple') return res.status(400).json({ error: 'Cannot delete default preset' });
  const file = path.join(REEL_PRESETS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

// Browse for folder (native dialog — cross-platform)
app.post('/api/reel/browse-folder', (req, res) => {
  if (IS_WIN) {
    // Windows: PowerShell FolderBrowserDialog
    const ps = spawn('powershell', ['-Command', `
      Add-Type -AssemblyName System.Windows.Forms
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
      $dialog.Description = "Select Remotion project folder"
      $dialog.ShowNewFolderButton = $false
      if ($dialog.ShowDialog() -eq 'OK') { $dialog.SelectedPath } else { '' }
    `], { windowsHide: false });
    let stdout = '';
    ps.stdout.on('data', d => stdout += d.toString());
    ps.on('close', () => {
      const folder = stdout.trim();
      res.json({ ok: true, folder });
    });
    ps.on('error', (e) => {
      res.json({ ok: false, folder: '', error: e.message });
    });
  } else if (process.env.ELECTRON_MODE) {
    // Mac/Linux in Electron: use IPC to trigger dialog.showOpenDialog in main process
    try {
      const { ipcMain, BrowserWindow } = require('electron');
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        const { dialog } = require('electron');
        dialog.showOpenDialog(win, {
          properties: ['openDirectory'],
          title: 'Select Remotion project folder'
        }).then(result => {
          const folder = result.canceled ? '' : (result.filePaths[0] || '');
          res.json({ ok: true, folder });
        }).catch(e => {
          res.json({ ok: false, folder: '', error: e.message });
        });
      } else {
        res.json({ ok: false, folder: '', error: 'No active window' });
      }
    } catch (e) {
      res.json({ ok: false, folder: '', error: e.message });
    }
  } else {
    // Mac/Linux non-Electron: use osascript (Mac) or zenity (Linux)
    if (IS_MAC) {
      const ps = spawn('osascript', ['-e', 'POSIX path of (choose folder with prompt "Select Remotion project folder")']);
      let stdout = '';
      ps.stdout.on('data', d => stdout += d.toString());
      ps.on('close', () => {
        const folder = stdout.trim().replace(/\/$/, ''); // remove trailing slash
        res.json({ ok: true, folder });
      });
      ps.on('error', (e) => {
        res.json({ ok: false, folder: '', error: e.message });
      });
    } else {
      // Linux fallback
      const ps = spawn('zenity', ['--file-selection', '--directory', '--title=Select Remotion project folder']);
      let stdout = '';
      ps.stdout.on('data', d => stdout += d.toString());
      ps.on('close', () => {
        const folder = stdout.trim();
        res.json({ ok: true, folder });
      });
      ps.on('error', (e) => {
        res.json({ ok: false, folder: '', error: e.message });
      });
    }
  }
});

// Render — creates a Claude task
app.post('/api/reel/projects/:projectId/render', (req, res) => {
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { working_dir, space_id } = req.body;
  if (!working_dir) return res.status(400).json({ error: 'No working_dir provided' });

  // 1. Write config file to the Remotion project's public/ directory
  const configDir = path.join(working_dir, 'public', 'reel-data');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(project, null, 2));

  // 2. Copy media files (video clips, images, music) to Remotion public/reel-data/
  const mediaMap = {}; // old path → new filename
  for (const clip of project.clips) {
    if (!clip.path) continue;
    const srcPath = path.join(BASE_DIR, clip.path);
    if (!fs.existsSync(srcPath)) continue;
    const destName = clip.storedName || path.basename(clip.path);
    const destPath = path.join(configDir, destName);
    try { fs.copyFileSync(srcPath, destPath); } catch (_) {}
    mediaMap[clip.path] = destName;
  }
  // Also copy B-roll videos from scenes
  for (const scene of (project.scenes || [])) {
    for (const brollPath of (scene.broll || [])) {
      const srcPath = path.join(BASE_DIR, brollPath);
      if (!fs.existsSync(srcPath)) continue;
      const destName = path.basename(brollPath);
      try { fs.copyFileSync(srcPath, path.join(configDir, destName)); } catch (_) {}
      mediaMap[brollPath] = destName;
    }
  }
  // Also copy music
  if (project.music && project.music.path) {
    const srcPath = path.join(BASE_DIR, project.music.path);
    if (fs.existsSync(srcPath)) {
      const destName = path.basename(project.music.path);
      try { fs.copyFileSync(srcPath, path.join(configDir, destName)); } catch (_) {}
      mediaMap[project.music.path] = destName;
    }
  }
  fs.writeFileSync(path.join(configDir, 'media-map.json'), JSON.stringify(mediaMap, null, 2));

  // 3. Build a compact summary for the task prompt (no whisper data inline)
  const style = project.style || {};
  const anim = style.animation || {};
  const colors = style.colors || {};
  const sub = style.subtitle || {};
  const video = style.video || {};
  const sceneCount = (project.scenes || []).length;
  const sceneSummary = (project.scenes || []).map((s, i) =>
    `  ${i+1}. "${s.text}" (${s.start?.toFixed(1)}s-${s.end?.toFixed(1)}s) [${s.display_mode || 'subtitles'}]${s.images?.length > 1 ? ` [${s.images.length} images - slideshow]` : s.images?.length ? ' [has image]' : ''}${s.images?.length && s.img_position && s.img_position !== 'top' ? ` [img_position: ${s.img_position}]` : ''}${s.images?.length && s.img_border && s.img_border !== 'none' ? ` [img_border: ${s.img_border}]` : ''}${s.broll?.length ? ' [has B-roll video]' : ''}${s.display_mode === 'mfx' && s.mfx_preset && s.mfx_preset !== 'none' ? ` [mfx: ${s.mfx_preset}]` : ''}${s.display_mode === 'mfx' && s.mfx_instructions ? ` [instructions: ${s.mfx_instructions}]` : ''}`
  ).join('\n');

  const prompt = `Build and render a Remotion FB Story video from the config file.

CONFIG FILE: public/reel-data/config.json (read this file for full scene data, whisper words, and settings)
MEDIA FILES: public/reel-data/ (video clips, images, music are copied here)
MEDIA MAP: public/reel-data/media-map.json (maps original paths to filenames in reel-data/)

SUMMARY (${sceneCount} scenes):
${sceneSummary}

STYLE:
- Colors: primary=${colors.primary}, secondary=${colors.secondary}, text=${colors.text}, bg=${colors.background}
- Heading: ${style.font?.family || 'Playfair Display'} ${style.font?.size || 48}px weight ${style.font?.weight || 700}
- Subtitle: ${sub.family || 'Inter'} ${sub.size || 32}px, position=${sub.position || 'bottom'}, shadow=${sub.shadow !== false}, maxWords=${sub.maxWords || 6}
- Animation: type=${anim.type || 'spring'}, damping=${anim.damping || 18}, stiffness=${anim.stiffness || 120}, mass=${anim.mass || 0.7}
- Video: zoom=${video.zoom || 1}, offsetX=${video.offsetX || 0}%, offsetY=${video.offsetY || 0}%
- Mode: ${project.mode || 'full'} (full = video fills 100%, images overlay on top; split = separate image zone on top, video at bottom)
- Image: fit=${video.imageFit || 'contain'}, size=${video.imageSize || 35}% (only used in split mode)
- Music: ${project.music ? project.music.filename + ' @ volume ' + (project.music.volume || 0.12) : 'none'}
- Display Mode: PER-SCENE (see below)

OUTPUT: ${project.output.width}x${project.output.height} @ ${project.output.fps}fps, codec h264, crf ${project.output.crf || 18}

DISPLAY MODES:
Each scene has a display_mode — 'subtitles', 'mfx', or 'none':
- SUBTITLES: Show word-synced animated subtitles at the bottom of the screen (standard karaoke-style).
- MFX (Motion Graphics): Animate the scene's text as the main visual element (typographic animation, kinetic text, motion graphics). The text IS the content — make it visually engaging with movement, scale, reveals, etc. If a specific preset is set (lines, corners, particles, etc.), use that style. If custom instructions are provided, follow them. If neither preset nor instructions are given, create a clean animated text presentation of the scene's words timed to the audio.
- NONE (No Text): Do NOT render any text, subtitles, or motion graphics for this scene. Just show the video (and image if present). The audio still plays but no visual text appears.

LAYOUT RULES (MODE: ${project.mode || 'full'}):
${(project.mode === 'split') ? `- SPLIT SCREEN MODE: The frame has two zones: TOP (image area, 50% height) and BOTTOM (video area, 45% height) with a 5% divider.
- Images go in the TOP zone. Text/subtitles go in the BOTTOM zone, over the video.
- NEVER place text on top of images. Text and images must be in separate zones.
- Images should have NO glow, NO colored box-shadow, NO border effects. Clean with object-fit: ${video.imageFit || 'contain'}.` : `- FULL VIDEO MODE: The video fills 100% of the frame (full screen).
- Images OVERLAY on top of the video (position: absolute, top: 0, covering the top ~50% of the frame).
- Text/subtitles appear over the video at the bottom.
- Images should have NO glow, NO colored box-shadow, NO border effects. Clean with object-fit: ${video.imageFit || 'contain'}.`}
- CRITICAL IMAGE SCOPING: Each scene's image MUST be wrapped in its own <Sequence from={} durationInFrames={}> so it ONLY appears during that scene's time range. When a scene ends, its image must disappear.
- PER-SCENE IMAGE POSITION: Each scene may have an img_position field. Apply these CSS positions (in full/youtube mode, images overlay on video):
  * "top" (default): position:absolute; top:0; width:100%; height:50%
  * "center": position:absolute; top:25%; width:100%; height:50%
  * "bottom": position:absolute; bottom:0; width:100%; height:50%
  * "full": position:absolute; top:0; width:100%; height:100%
  In split mode, position is ignored (image fills the top zone).
- PER-SCENE IMAGE BORDER: Each scene may have an img_border field. Apply these CSS styles:
  * "none" (default): no border effects
  * "rounded": border-radius:16px; margin:4%
  * "shadow": border-radius:12px; margin:4%; box-shadow: 0 8px 32px rgba(0,0,0,0.6)
  * "frame": border: 3px solid rgba(255,255,255,0.15); border-radius:8px; margin:4%
  * "glow": border-radius:12px; margin:4%; box-shadow: 0 0 20px rgba(123,47,242,0.5)
  When margin is applied, adjust width/height to 92% to account for the inset.
- SLIDESHOW: If a scene has multiple images (check scenes[i].images array length), cycle through them evenly within the scene duration. For example, 3 images in a 3s scene = 1s per image. Use opacity transitions (fade in/out) to switch between them. Stack them absolutely on top of each other and animate opacity.
- B-ROLL: If a scene has a broll array (scenes[i].broll), use the B-roll video INSTEAD of the main video for that scene's duration. Use <OffthreadVideo> with the B-roll file from reel-data/.

INSTRUCTIONS:
1. Read public/reel-data/config.json for the full project data (scenes with word-level timestamps)
2. Read public/reel-data/media-map.json to know which media files are available
3. Create/update Remotion components: use <OffthreadVideo> for video
4. For 'subtitles' scenes: word-synced subtitles from scenes[].words, positioned at bottom over video. Show max ${sub.maxWords || 6} words at a time (group words into chunks of ${sub.maxWords || 6}).
5. For 'mfx' scenes: animated text presentation of the scene's words (follow any instructions/preset if provided)
6. For 'none' scenes: NO text at all — just video and image (if any). Skip all subtitles and motion graphics for that scene.
7. For scenes with images: apply per-scene img_position and img_border CSS (see above). Use object-fit: ${video.imageFit || 'contain'}.
8. For scenes with B-roll: use the B-roll video for that scene instead of the main video clip
9. CRITICAL: Only show an image during its scene's time range. Never persist a previous scene's image.
10. Apply spring(${JSON.stringify({damping: anim.damping || 18, stiffness: anim.stiffness || 120, mass: anim.mass || 0.7})}) animations
11. Add background music with <Audio> at volume ${project.music?.volume || 0.12}
12. Render: npx remotion render src/index.ts MainComp out/${(project.name || 'reel').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'reel'}.mp4 --codec h264 --crf ${project.output.crf || 18}`;

  const tasks = readTasks();
  const id = generateId(tasks);
  const newTask = {
    id,
    task: prompt,
    skill: 'fb-story-video',
    status: 'pending',
    priority: 1,
    model: 'sonnet',
    max_turns: 50,
    context: [],
    extra_context: [],
    working_dir: working_dir || null,
    space_id: space_id || 'general',
    timeout_mins: 45,  // video renders need more time than default 30
    worker: null, started_at: null, completed_at: null, result_file: null, error: null, archived: false
  };
  tasks.push(newTask);
  writeTasks(tasks);

  res.json({ ok: true, task_id: id, config_path: configPath });
});

// ──────────────────────────────────────────────
// HeyGen Video Creator
// ──────────────────────────────────────────────

// Helpers
function readHeyGenConfig() {
  try { return JSON.parse(fs.readFileSync(HEYGEN_CONFIG_FILE, 'utf-8')); } catch { return {}; }
}
function writeHeyGenConfig(data) { fs.writeFileSync(HEYGEN_CONFIG_FILE, JSON.stringify(data, null, 2)); }

function listHeyGenProjects() {
  if (!fs.existsSync(HEYGEN_PROJECTS_DIR)) return [];
  const files = fs.readdirSync(HEYGEN_PROJECTS_DIR).filter(f => f.endsWith('.json') && !f.includes('-result'));
  return files.map(f => {
    try {
      const proj = JSON.parse(fs.readFileSync(path.join(HEYGEN_PROJECTS_DIR, f), 'utf-8'));
      // Merge result file if it exists and project isn't already completed
      if (proj.id && proj.status !== 'completed') {
        const resultPath = path.join(HEYGEN_PROJECTS_DIR, proj.id + '-result.json');
        if (fs.existsSync(resultPath)) {
          try {
            const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
            if (result.status === 'completed' && result.videoUrl) {
              proj.status = 'completed';
              proj.videoUrl = result.videoUrl;
              proj.updatedAt = new Date().toISOString();
              // Persist the merge so we don't re-read every time
              fs.writeFileSync(path.join(HEYGEN_PROJECTS_DIR, f), JSON.stringify(proj, null, 2));
            }
          } catch {}
        }
      }
      return proj;
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
}
function readHeyGenProject(id) {
  const p = path.join(HEYGEN_PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function writeHeyGenProject(id, data) {
  fs.writeFileSync(path.join(HEYGEN_PROJECTS_DIR, `${id}.json`), JSON.stringify(data, null, 2));
}
function deleteHeyGenProjectFile(id) {
  const p = path.join(HEYGEN_PROJECTS_DIR, `${id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// In-memory cache (5 min TTL)
const hgCache = {};
function getCached(key) {
  const entry = hgCache[key];
  if (entry && Date.now() - entry.ts < 300000) return entry.data;
  return null;
}
function setCache(key, data) { hgCache[key] = { data, ts: Date.now() }; }

// Settings
app.get('/api/heygen/settings', (req, res) => {
  const cfg = readHeyGenConfig();
  res.json({
    hasKey: !!cfg.apiKey,
    keyPreview: cfg.apiKey ? '••••' + cfg.apiKey.slice(-4) : null,
    loginEmail: cfg.loginEmail || '',
    hasPassword: !!cfg.loginPassword
  });
});

app.get('/api/heygen/credits', async (req, res) => {
  const cfg = readHeyGenConfig();
  if (!cfg.apiKey) return res.status(400).json({ error: 'No API key' });
  try {
    const resp = await fetch('https://api.heygen.com/v2/user/remaining_quota', {
      headers: { 'X-API-KEY': cfg.apiKey, 'Accept': 'application/json' }
    });
    const data = await resp.json();
    const quotaSec = data.data?.remaining_quota ?? 0;
    res.json({ credits: Math.floor(quotaSec / 60), seconds: quotaSec });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/heygen/settings', (req, res) => {
  const { apiKey, loginEmail, loginPassword } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API key is required' });
  const cfg = readHeyGenConfig();
  cfg.apiKey = apiKey.trim();
  if (loginEmail !== undefined) cfg.loginEmail = loginEmail.trim();
  if (loginPassword !== undefined) cfg.loginPassword = loginPassword;
  writeHeyGenConfig(cfg);
  // Clear cache so new key is used
  delete hgCache.avatars;
  delete hgCache.voices;
  res.json({ ok: true });
});

// Proxy: List avatars
app.get('/api/heygen/avatars', async (req, res) => {
  const cfg = readHeyGenConfig();
  if (!cfg.apiKey) return res.status(400).json({ error: 'No HeyGen API key configured' });
  const cached = getCached('avatars');
  if (cached) return res.json(cached);
  try {
    const resp = await fetch('https://api.heygen.com/v2/avatars', {
      headers: { 'X-API-KEY': cfg.apiKey, 'Accept': 'application/json' }
    });
    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ error: `HeyGen API error: ${err}` });
    }
    const data = await resp.json();
    setCache('avatars', data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: List voices
app.get('/api/heygen/voices', async (req, res) => {
  const cfg = readHeyGenConfig();
  if (!cfg.apiKey) return res.status(400).json({ error: 'No HeyGen API key configured' });
  const cached = getCached('voices');
  if (cached) return res.json(cached);
  try {
    const resp = await fetch('https://api.heygen.com/v2/voices', {
      headers: { 'X-API-KEY': cfg.apiKey, 'Accept': 'application/json' }
    });
    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ error: `HeyGen API error: ${err}` });
    }
    const data = await resp.json();
    setCache('voices', data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: Generate video
app.post('/api/heygen/generate', async (req, res) => {
  const cfg = readHeyGenConfig();
  if (!cfg.apiKey) return res.status(400).json({ error: 'No HeyGen API key configured' });
  const { projectId, avatarId, avatarType, voiceId, script, dimension } = req.body;
  if (!avatarId || !voiceId || !script) {
    return res.status(400).json({ error: 'avatarId, voiceId, and script are required' });
  }
  try {
    // Build character payload based on avatar type (talking_photo vs regular avatar)
    const character = avatarType === 'talking_photo'
      ? { type: 'talking_photo', talking_photo_id: avatarId }
      : { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' };
    const payload = {
      video_inputs: [{
        character,
        voice: { type: 'text', input_text: script, voice_id: voiceId, speed: 1.0 }
      }],
      dimension: dimension || { width: 1920, height: 1080 },
      title: req.body.title || 'Untitled Video'
    };
    const resp = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-API-KEY': cfg.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.error) {
      const errMsg = typeof data.error === 'string' ? data.error : (data.error?.message || data.message || JSON.stringify(data.error));
      return res.status(400).json({ error: errMsg });
    }
    if (data.code && data.code !== 100) {
      return res.status(400).json({ error: data.message || `HeyGen error code ${data.code}` });
    }
    // Update project with video_id
    if (projectId) {
      const proj = readHeyGenProject(projectId);
      if (proj) {
        proj.videoId = data.data?.video_id;
        proj.status = 'pending';
        proj.updatedAt = new Date().toISOString();
        writeHeyGenProject(projectId, proj);
      }
    }
    res.json({ ok: true, videoId: data.data?.video_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: Check video status
app.get('/api/heygen/status/:videoId', async (req, res) => {
  const cfg = readHeyGenConfig();
  if (!cfg.apiKey) return res.status(400).json({ error: 'No HeyGen API key configured' });
  try {
    const resp = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${req.params.videoId}`, {
      headers: { 'X-API-KEY': cfg.apiKey, 'Accept': 'application/json' }
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Project CRUD
app.get('/api/heygen/projects', (req, res) => {
  res.json({ projects: listHeyGenProjects() });
});

app.post('/api/heygen/projects', (req, res) => {
  const id = crypto.randomUUID();
  const project = {
    id,
    name: req.body.name || 'Untitled Video',
    avatarId: null, avatarName: null, avatarThumb: null,
    voiceId: null, voiceName: null,
    script: '',
    dimension: { width: 1920, height: 1080 },
    videoId: null, status: 'draft',
    videoUrl: null, thumbnailUrl: null, duration: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  writeHeyGenProject(id, project);
  res.json({ ok: true, project });
});

app.put('/api/heygen/projects/:id', (req, res) => {
  const proj = readHeyGenProject(req.params.id);
  if (!proj) return res.status(404).json({ error: 'Project not found' });
  Object.assign(proj, req.body, { updatedAt: new Date().toISOString() });
  writeHeyGenProject(req.params.id, proj);
  res.json({ ok: true, project: proj });
});

app.delete('/api/heygen/projects/:id', (req, res) => {
  deleteHeyGenProjectFile(req.params.id);
  res.json({ ok: true });
});

// Browser-based generation (free — uses Creator plan via browser automation)
app.post('/api/heygen/generate-browser', (req, res) => {
  const { projectId } = req.body;
  const proj = readHeyGenProject(projectId);
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  const resultPath = path.join(HEYGEN_PROJECTS_DIR, projectId + '-result.json');
  const cfg = readHeyGenConfig();

  // Build task description with all params the agent needs
  let loginBlock = '';
  if (proj.cookies) {
    loginBlock = `
Cookies (set these BEFORE navigating to app.heygen.com to skip login):
---COOKIES---
${proj.cookies}
---END_COOKIES---

To set cookies, use browser_run_code or browser_evaluate:
  async (page) => {
    const cookies = <paste the JSON array above>;
    // Map to Playwright format: keep name, value, domain, path, secure, httpOnly, sameSite
    // sameSite mapping: "lax" → "Lax", "strict" → "Strict", "unspecified"/"no_restriction"/"none" → "None"
    const mapped = cookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
      secure: !!c.secure, httpOnly: !!c.httpOnly,
      sameSite: c.sameSite === 'lax' ? 'Lax' : c.sameSite === 'strict' ? 'Strict' : 'None'
    }));
    await page.context().addCookies(mapped);
  }
Then navigate to https://app.heygen.com/ — you should already be logged in.
`;
  } else if (cfg.loginEmail && cfg.loginPassword) {
    loginBlock = `
Login credentials (use if not already logged in):
  Email: ${cfg.loginEmail}
  Password: ${cfg.loginPassword}
`;
  }

  const taskDesc = `Generate a HeyGen avatar video using browser automation.

Avatar: ${proj.avatarName || 'Not set'}
Voice: ${proj.voiceName || 'Not set'}
Dimensions: ${proj.dimension?.width || 1920}x${proj.dimension?.height || 1080}
Result path: ${resultPath}
${loginBlock}
Script:
---
${proj.script || ''}
---

Follow the heygen-studio skill instructions to create this video on app.heygen.com.
Write the result JSON to: ${resultPath}`;

  // Create task
  const tasks = readTasks();
  const newId = generateId(tasks);
  const newTask = {
    id: newId,
    task: taskDesc,
    skill: 'heygen-studio',
    status: 'pending',
    priority: 1,
    model: 'sonnet',
    max_turns: 50,
    context: [],
    working_dir: BASE_DIR,
    _heygen_project_id: projectId
  };
  tasks.push(newTask);
  writeTasks(tasks);

  // Update project status
  proj.status = 'browser-pending';
  proj.taskId = newId;
  proj.updatedAt = new Date().toISOString();
  writeHeyGenProject(projectId, proj);

  // Launch via same mechanism as POST /api/tasks/:id/run
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const workerId = `S${newId}`;
  const workerScript = path.join(BASE_DIR, 'worker.js');

  if (launchWorkerProcess(workerScript, workerId, newId, cleanEnv)) {
    activeWorkers.set(workerId, { startedAt: new Date().toISOString(), taskId: newId });
    console.log(`[Server] Launched HeyGen browser worker for task #${newId} (project ${projectId})`);
    res.json({ ok: true, taskId: newId, projectId });
  } else {
    console.error(`[Server] Failed to launch HeyGen browser worker`);
    res.status(500).json({ ok: false, error: 'Failed to launch browser worker' });
  }
});

app.get('/api/heygen/browser-result/:projectId', (req, res) => {
  const resultPath = path.join(HEYGEN_PROJECTS_DIR, req.params.projectId + '-result.json');
  if (fs.existsSync(resultPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
      res.json({ found: true, ...data });
    } catch (e) {
      res.json({ found: false });
    }
  } else {
    res.json({ found: false });
  }
});

// Load HeyGen video into Reel Master
app.post('/api/heygen/load-to-reels', async (req, res) => {
  const { projectId } = req.body;
  const proj = readHeyGenProject(projectId);
  if (!proj) return res.status(404).json({ error: 'HeyGen project not found' });

  // Get video URL from project or result file
  let videoUrl = proj.videoUrl;
  if (!videoUrl) {
    const resultPath = path.join(HEYGEN_PROJECTS_DIR, projectId + '-result.json');
    if (fs.existsSync(resultPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        if (result.videoUrl) videoUrl = result.videoUrl;
      } catch {}
    }
  }
  if (!videoUrl) return res.status(400).json({ error: 'No video URL found for this project' });

  try {
    // Download the video
    const resp = await fetch(videoUrl);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());

    // Create a new Reel Master project
    const reelId = 'reel-' + Date.now();
    const reelProject = {
      id: reelId,
      name: proj.name || 'HeyGen Video',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      clips: [],
      scenes: [],
      music: null,
      style: defaultReelStyle(),
      output: {
        width: proj.dimension?.width || 1080,
        height: proj.dimension?.height || 1920,
        fps: 30, codec: 'h264', crf: 18
      }
    };

    // Save video file
    const dir = path.join(UPLOADS_DIR, reelId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = (proj.name || 'heygen-video').replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + Date.now() + '.mp4';
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);

    const relPath = `uploads/${reelId}/${filename}`;
    const clipObj = {
      id: 'clip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      filename: (proj.name || 'heygen-video') + '.mp4',
      storedName: filename,
      path: relPath,
      size: buffer.length,
      type: 'clip',
      mime: 'video/mp4',
      whisper: null,
      added_at: new Date().toISOString()
    };
    reelProject.clips.push(clipObj);
    writeReelProject(reelProject);

    res.json({ ok: true, reelId, reelName: reelProject.name });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Download HeyGen video locally and open in folder
app.post('/api/heygen/open-in-folder', async (req, res) => {
  const { projectId } = req.body;
  const proj = readHeyGenProject(projectId);
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  let videoUrl = proj.videoUrl;
  if (!videoUrl) {
    const resultPath = path.join(HEYGEN_PROJECTS_DIR, projectId + '-result.json');
    if (fs.existsSync(resultPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        if (result.videoUrl) videoUrl = result.videoUrl;
      } catch {}
    }
  }
  if (!videoUrl) return res.status(400).json({ error: 'No video URL found' });

  try {
    const dir = path.join(HEYGEN_PROJECTS_DIR, 'downloads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = (proj.name || 'heygen-video').replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + projectId.slice(0, 8) + '.mp4';
    const filePath = path.join(dir, filename);

    // Download if not already saved
    if (!fs.existsSync(filePath)) {
      const resp = await fetch(videoUrl);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    }

    // Open in file manager (cross-platform)
    openInFolder(filePath);

    res.json({ ok: true, path: filePath });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ──────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────

function startServer() {
  app.listen(PORT, () => {
    const appName = process.env.ELECTRON_MODE ? 'Electron' : 'Claude Task Manager';
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log(`║  🤖 ${appName.padEnd(38)}║`);
    console.log(`║  🌐 http://localhost:${String(PORT).padEnd(24)}║`);
    console.log('╚══════════════════════════════════════════════╝');

    // Check Claude CLI at startup
    if (checkClaudeCli()) {
      console.log(`  ✓ Claude CLI found: ${claudeCliVersion}`);
    } else {
      console.log('  ⚠ Claude CLI not found in PATH!');
      console.log('    Tasks will fail until "claude" is available.');
      console.log('    Install: https://docs.anthropic.com/en/docs/claude-code');
    }

    // Start scheduler
    const schedData = readSchedules();
    const activeSchedules = schedData.schedules.filter(s => s.enabled).length;
    if (activeSchedules > 0) {
      console.log(`  🕐 Scheduler: ${activeSchedules} active schedule${activeSchedules > 1 ? 's' : ''}`);
    }

    // Run scheduler tick every 60 seconds
    setInterval(runSchedulerTick, 60 * 1000);
    // Boot catch-up after 10s delay
    setTimeout(runSchedulerTick, 10000);

    console.log('');
  });
}

// Auto-start when run directly (node server.js), or when required by Electron
startServer();

// Clean up terminal sessions on shutdown
process.on('SIGINT', () => { terminalManager.cleanup(); process.exit(); });
process.on('SIGTERM', () => { terminalManager.cleanup(); process.exit(); });
