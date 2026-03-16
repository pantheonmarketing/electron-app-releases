/**
 * server.js — AI CEO Studio API + Static File Server
 *
 * Orchestrator: initializes paths, populates shared state, mounts route modules.
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
const multer = require('multer');

const TerminalManager = require('./lib/terminal-manager');
const shared = require('./lib/shared');
const helpers = require('./lib/helpers');

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
  if (IS_WIN) {
    spawn('explorer', ['/select,' + filePath.replace(/\//g, '\\')], { shell: false, detached: true }).unref();
  } else if (IS_MAC) {
    spawn('open', ['-R', filePath], { shell: false, detached: true }).unref();
  } else {
    spawn('xdg-open', [path.dirname(filePath)], { shell: false, detached: true }).unref();
  }
}

function launchWorkerProcess(workerScript, workerId, taskId, cleanEnv) {
  const log = (msg) => console.log(`[LaunchWorker] ${msg}`);

  if (IS_WIN) {
    // Sanitize workerId and taskId to prevent command injection in .bat files
    const safeWorkerId = String(workerId).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeTaskId = taskId ? String(taskId).replace(/[^0-9]/g, '') : null;
    const label = safeTaskId ? `Task #${safeTaskId}` : `Worker ${safeWorkerId}`;
    const batFile = path.join(LOGS_DIR, `launch-worker-${safeTaskId || safeWorkerId}.bat`);
    const batContent = [
      '@echo off',
      `title Claude ${label}`,
      'set CLAUDECODE=',
      `set WORKER_BASE_DIR=${BASE_DIR}`,
      `cd /d "${BASE_DIR}"`,
      `node "${workerScript}" ${safeWorkerId}${safeTaskId ? ' ' + safeTaskId : ''}`,
    ].join('\r\n');

    log(`Writing bat file: ${batFile}`);
    log(`Bat content: cd /d "${BASE_DIR}" && node "${workerScript}" ${safeWorkerId}${safeTaskId ? ' ' + safeTaskId : ''}`);
    fs.writeFileSync(batFile, batContent);
    log(`Bat file written OK (${batContent.length} bytes)`);

    // Check node is accessible
    try {
      const nodeVer = execSync('node --version', { encoding: 'utf-8', timeout: 5000, windowsHide: true }).trim();
      log(`Node version: ${nodeVer}`);
    } catch (e) {
      log(`WARNING: node --version failed: ${e.message}`);
    }

    try {
      const psCmd = `powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c','\\\"${batFile.replace(/\\/g, '\\\\')}\\\"' -WindowStyle Hidden"`;
      log(`Trying PowerShell: ${psCmd.slice(0, 150)}...`);
      execSync(psCmd, { cwd: BASE_DIR, env: cleanEnv, shell: true, stdio: 'ignore', windowsHide: true });
      log(`PowerShell launch succeeded`);
      return true;
    } catch (psErr) {
      log(`PowerShell launch failed: ${psErr.message}`);
      try {
        const startCmd = `start /min "Claude ${label}" cmd /c "${batFile}"`;
        log(`Trying fallback start cmd: ${startCmd.slice(0, 150)}...`);
        execSync(startCmd, { cwd: BASE_DIR, env: cleanEnv, shell: true, stdio: 'ignore', windowsHide: true });
        log(`Fallback start cmd succeeded`);
        return true;
      } catch (startErr) {
        log(`Fallback start cmd also failed: ${startErr.message}`);
        return false;
      }
    }
  } else {
    const args = [workerScript, workerId];
    if (taskId) args.push(taskId);
    log(`Spawning: node ${args.join(' ')}`);
    const child = spawn('node', args, {
      cwd: BASE_DIR, env: { ...cleanEnv, CLAUDECODE: '', WORKER_BASE_DIR: BASE_DIR }, detached: true, stdio: 'ignore',
    });
    child.unref();
    log(`Spawned PID ${child.pid}`);
    return true;
  }
}

// ── Resolve bundled tool paths for Electron ──
function getFFmpegPath() {
  if (process.env.ELECTRON_MODE) {
    const resourcePath = process.resourcesPath || path.join(__dirname, '..');
    const winBin = path.join(resourcePath, 'bin', 'ffmpeg.exe');
    const unixBin = path.join(resourcePath, 'bin', 'ffmpeg');
    if (IS_WIN && fs.existsSync(winBin)) return `"${winBin}"`;
    if (!IS_WIN && fs.existsSync(unixBin)) return `"${unixBin}"`;
  }
  return 'ffmpeg';
}
const FFMPEG_BIN = getFFmpegPath();

// ── Express setup ──
const app = express();
const terminalManager = new TerminalManager();
const PORT = parseInt(process.env.ELECTRON_PORT) || 3456;

// ── Path constants ──
const IS_PACKAGED_ELECTRON = process.env.ELECTRON_MODE && __dirname.includes('app.asar');
const BASE_DIR = IS_PACKAGED_ELECTRON
  ? path.join(getAppDataDir(), 'claude-task-manager')
  : __dirname;
const APP_DIR = __dirname;
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
const STORY_PROJECTS_DIR = path.join(BASE_DIR, 'story-projects');
const STORY_PRESETS_DIR = path.join(BASE_DIR, 'story-presets');
const HEYGEN_CONFIG_FILE = path.join(BASE_DIR, 'heygen-config.json');
const SCHEDULES_FILE = path.join(BASE_DIR, 'schedules.json');
const SKILL_VERSIONS_DIR = path.join(BASE_DIR, 'skill-versions');
const SKILL_CONFIGS_FILE = path.join(BASE_DIR, 'skill-configs.json');
const INFLUENCER_PROJECTS_DIR = path.join(BASE_DIR, 'influencer-projects');
const GIVEAWAY_PROJECTS_DIR = path.join(BASE_DIR, 'giveaway-projects');

// ── Ensure directories exist ──
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
[RESULTS_DIR, LOGS_DIR, UPLOADS_DIR, REEL_PROJECTS_DIR, REEL_PRESETS_DIR, WHISPER_CACHE_DIR, HEYGEN_PROJECTS_DIR, SKILL_VERSIONS_DIR, STORY_PROJECTS_DIR, STORY_PRESETS_DIR, INFLUENCER_PROJECTS_DIR, GIVEAWAY_PROJECTS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Electron first-run seeding ──
// IMPORTANT: fs.copyFileSync does NOT work from inside .asar archives.
// Electron patches readFileSync/readdir/existsSync for asar, but NOT copyFileSync.
// Always use readFileSync + writeFileSync when copying from APP_DIR (which is inside .asar).
function extractFile(src, dest) {
  const content = fs.readFileSync(src);
  fs.writeFileSync(dest, content);
}

if (IS_PACKAGED_ELECTRON) {
  for (const f of ['tasks.json', 'skills.json', 'projects.json', 'templates.json']) {
    const dest = path.join(BASE_DIR, f);
    if (!fs.existsSync(dest)) {
      const resourceSrc = path.join(process.resourcesPath || '', f);
      const defaultsSrc = path.join(APP_DIR, 'defaults', f);
      const bundleSrc = path.join(APP_DIR, f);
      if (fs.existsSync(resourceSrc)) {
        try { extractFile(resourceSrc, dest); } catch (_) {}
      } else if (fs.existsSync(defaultsSrc)) {
        try { extractFile(defaultsSrc, dest); } catch (_) {}
      } else if (fs.existsSync(bundleSrc)) {
        try { extractFile(bundleSrc, dest); } catch (_) {}
      }
      if (!fs.existsSync(dest)) {
        const defaults = { 'tasks.json': '[]', 'skills.json': '{}', 'projects.json': '[]', 'templates.json': '{"templates":[],"routines":[]}' };
        fs.writeFileSync(dest, defaults[f] || '{}');
      }
    }
  }
  const bundlePresetsDir = path.join(APP_DIR, 'reel-presets');
  if (fs.existsSync(bundlePresetsDir) && fs.readdirSync(REEL_PRESETS_DIR).length === 0) {
    for (const f of fs.readdirSync(bundlePresetsDir)) {
      try { extractFile(path.join(bundlePresetsDir, f), path.join(REEL_PRESETS_DIR, f)); } catch (_) {}
    }
  }
  const bundleStoryPresetsDir = path.join(APP_DIR, 'story-presets');
  if (fs.existsSync(bundleStoryPresetsDir) && fs.readdirSync(STORY_PRESETS_DIR).length === 0) {
    for (const f of fs.readdirSync(bundleStoryPresetsDir)) {
      try { extractFile(path.join(bundleStoryPresetsDir, f), path.join(STORY_PRESETS_DIR, f)); } catch (_) {}
    }
  }
  // Always update skills.json from bundle (contains full skill registry with metadata)
  // IMPORTANT: Per-skill deep merge — bundled metadata updates, but local config_values are NEVER lost
  const bundledSkillsJson = path.join(APP_DIR, 'skills.json');
  if (fs.existsSync(bundledSkillsJson)) {
    try {
      const bundled = JSON.parse(fs.readFileSync(bundledSkillsJson, 'utf-8'));
      const local = fs.existsSync(SKILLS_FILE)
        ? JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf-8'))
        : {};
      // Load saved configs (protected file that survives all merges/syncs)
      const savedConfigs = fs.existsSync(SKILL_CONFIGS_FILE)
        ? JSON.parse(fs.readFileSync(SKILL_CONFIGS_FILE, 'utf-8'))
        : {};
      // Per-skill deep merge: bundled as base, local overrides, saved configs always win
      const merged = {};
      const allNames = new Set([...Object.keys(bundled), ...Object.keys(local)]);
      for (const name of allNames) {
        merged[name] = { ...(bundled[name] || {}), ...(local[name] || {}) };
        // Restore config_values from protected file (highest priority)
        if (savedConfigs[name]) merged[name].config_values = savedConfigs[name];
      }
      fs.writeFileSync(SKILLS_FILE, JSON.stringify(merged, null, 2));
      console.log(`[Server] Skills registry: ${Object.keys(merged).length} skills (${Object.keys(bundled).length} bundled)`);
    } catch (e) {
      console.error(`[Server] Failed to merge skills.json: ${e.message}`);
    }
  }

  // Always extract skill .md files from bundle to BASE_DIR
  const bundleSkillsDir = path.join(APP_DIR, 'skills');
  const destSkillsDir = path.join(BASE_DIR, 'skills');
  if (fs.existsSync(bundleSkillsDir)) {
    if (!fs.existsSync(destSkillsDir)) fs.mkdirSync(destSkillsDir, { recursive: true });
    let extracted = 0;
    for (const f of fs.readdirSync(bundleSkillsDir)) {
      try { extractFile(path.join(bundleSkillsDir, f), path.join(destSkillsDir, f)); extracted++; } catch (e) {
        console.error(`[Server] Failed to extract skill ${f}: ${e.message}`);
      }
    }
    console.log(`[Server] Extracted ${extracted} skill files to ${destSkillsDir}`);
  }

  // Extract executable scripts from app.asar to BASE_DIR so plain `node` can run them.
  for (const script of ['worker.js', 'giveaway-scout-apify.cjs', 'transcribe.py']) {
    const src = path.join(APP_DIR, script);
    const dest = path.join(BASE_DIR, script);
    try {
      if (fs.existsSync(src)) {
        extractFile(src, dest);
        console.log(`[Server] Extracted ${script} to ${dest}`);
      }
    } catch (e) {
      console.error(`[Server] Failed to extract ${script}: ${e.message}`);
    }
  }
}

// Migrate config_values to protected file (runs for all modes, including dev)
if (!fs.existsSync(SKILL_CONFIGS_FILE) && fs.existsSync(SKILLS_FILE)) {
  try {
    const skills = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf-8'));
    const configs = {};
    for (const [name, info] of Object.entries(skills)) {
      if (info.config_values && Object.keys(info.config_values).length > 0) {
        configs[name] = info.config_values;
      }
    }
    if (Object.keys(configs).length > 0) {
      fs.writeFileSync(SKILL_CONFIGS_FILE, JSON.stringify(configs, null, 2));
      console.log(`[Server] Migrated ${Object.keys(configs).length} skill configs to protected file`);
    }
  } catch (_) {}
}

// ── User environment variables ──
const USER_ENV_FILE = path.join(BASE_DIR, 'user-env.json');
function loadUserEnv() {
  try {
    if (fs.existsSync(USER_ENV_FILE)) {
      const vars = JSON.parse(fs.readFileSync(USER_ENV_FILE, 'utf-8'));
      for (const [k, v] of Object.entries(vars)) {
        if (k && v && typeof v === 'string') process.env[k] = v;
      }
      console.log(`[Server] Loaded ${Object.keys(vars).length} user env vars`);
    }
  } catch (_) {}
}
loadUserEnv();

// ── Debug telemetry disabled (was flooding Telegram) ──
function sendDebugTelemetry() {}
Object.assign(shared, { sendDebugTelemetry });

// ── License tier ──
let _cachedTier = null;
let _tierLastChecked = 0;
const TIER_REFRESH_MS = 10 * 60 * 1000; // re-check every 10 min

function getLicenseTier() {
  // Use cached tier if fresh (avoids file reads on every request)
  if (_cachedTier && (Date.now() - _tierLastChecked < TIER_REFRESH_MS)) {
    return _cachedTier;
  }
  try {
    const licFile = path.join(getAppDataDir(), 'claude-task-manager', 'license.json');
    if (fs.existsSync(licFile)) {
      const lic = JSON.parse(fs.readFileSync(licFile, 'utf-8'));
      _cachedTier = lic.tier || 'basic';
      _tierLastChecked = Date.now();
      return _cachedTier;
    }
  } catch (_) {}
  return process.env.ELECTRON_MODE ? 'basic' : 'lifetime';
}

// Live-sync tier from server on startup + every 10 min
// This fixes stale license.json that still says "basic" after an admin upgrade
function refreshLicenseTier() {
  try {
    const licFile = path.join(getAppDataDir(), 'claude-task-manager', 'license.json');
    if (!fs.existsSync(licFile)) {
      sendDebugTelemetry('license_refresh_skip', { reason: 'no license.json', path: licFile });
      return;
    }
    const lic = JSON.parse(fs.readFileSync(licFile, 'utf-8'));
    if (!lic.key) {
      sendDebugTelemetry('license_refresh_skip', { reason: 'no key in license.json', tier: lic.tier });
      return;
    }

    const https = require('https');
    const body = JSON.stringify({ key: lic.key });
    const req = https.request('https://www.aicreatorworkshop.com/api/license-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const resp = JSON.parse(data);
          sendDebugTelemetry('license_refresh_response', {
            api_valid: resp.valid, api_tier: resp.tier, local_tier: lic.tier,
            tier_changed: resp.tier !== lic.tier, api_error: resp.error || null,
          });
          if (resp.valid && resp.tier && resp.tier !== lic.tier) {
            console.log(`[License] Tier updated: ${lic.tier} → ${resp.tier}`);
            lic.tier = resp.tier;
            fs.writeFileSync(licFile, JSON.stringify(lic, null, 2));
            _cachedTier = resp.tier;
            _tierLastChecked = Date.now();
          }
        } catch (_) {}
      });
    });
    req.on('error', (e) => {
      sendDebugTelemetry('license_refresh_error', { error: e.message });
    });
    req.write(body);
    req.end();
  } catch (_) {}
}

// Run immediately on startup, then every 10 min
refreshLicenseTier();
setInterval(refreshLicenseTier, TIER_REFRESH_MS);

// Startup telemetry — report license state on boot
if (process.env.ELECTRON_MODE) {
  setTimeout(() => {
    const tier = getLicenseTier();
    const licFile = path.join(getAppDataDir(), 'claude-task-manager', 'license.json');
    let licData = {};
    try { licData = JSON.parse(fs.readFileSync(licFile, 'utf-8')); } catch (_) {}
    sendDebugTelemetry('app_startup', {
      resolved_tier: tier,
      license_file_exists: fs.existsSync(licFile),
      license_file_tier: licData.tier || 'missing',
      license_file_key: licData.key ? licData.key.slice(0, 9) + '...' : 'missing',
      is_packaged: !!IS_PACKAGED_ELECTRON,
      base_dir: BASE_DIR,
    });
  }, 5000); // delay 5s to let refreshLicenseTier finish
}

// ── Startup recovery for stuck tasks ──
function recoverStuckTasks() {
  const tasks = helpers.readTasks();
  let recovered = 0;
  const now = Date.now();
  for (const task of tasks) {
    if (task.status === 'running') {
      const startedAt = task.started_at ? new Date(task.started_at).getTime() : 0;
      const timeoutMs = (task.timeout_mins || 30) * 60 * 1000;
      if (!startedAt || (now - startedAt > timeoutMs)) {
        task.status = 'failed';
        task.error = 'Recovered: worker process did not complete (app was restarted)';
        task.completed_at = new Date().toISOString();
        recovered++;
      }
    }
  }
  if (recovered > 0) {
    helpers.writeTasks(tasks);
    console.log(`[Recovery] ${recovered} stuck task(s) recovered`);
  }
}

// ── Multer config for Reel Master uploads ──
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

// ──────────────────────────────────────────────
// Populate shared state for route modules
// ──────────────────────────────────────────────
Object.assign(shared, {
  BASE_DIR, APP_DIR, TASKS_FILE, SKILLS_FILE, SKILL_CONFIGS_FILE, PROJECTS_FILE, TEMPLATES_FILE,
  RESULTS_DIR, LOGS_DIR, WORKFLOW_RUNS_FILE, UPLOADS_DIR,
  REEL_PROJECTS_DIR, REEL_PRESETS_DIR, WHISPER_CACHE_DIR,
  HEYGEN_PROJECTS_DIR, HEYGEN_CONFIG_FILE, STORY_PROJECTS_DIR, STORY_PRESETS_DIR,
  SCHEDULES_FILE, FFMPEG_BIN, INFLUENCER_PROJECTS_DIR, GIVEAWAY_PROJECTS_DIR,
  IS_WIN, IS_MAC,
  terminalManager, reelUpload,
  launchWorkerProcess, killProcessTree, openInFolder, getAppDataDir, getLicenseTier,
});

// ── Recover stuck tasks before routes are active ──
recoverStuckTasks();

// ── Middleware ──
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(APP_DIR, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// License tier middleware (Electron only)
const LIFETIME_ONLY_PREFIXES = [
  '/api/plan', '/api/routines', '/api/schedules',
  '/api/terminal', '/api/workflow-runs', '/api/workers',
  '/api/tasks', '/api/story', '/api/scripter',
  '/api/heygen', '/api/giveaway', '/api/scout',
  '/api/skills', '/api/projects', '/api/templates',
];
app.use((req, res, next) => {
  if (!process.env.ELECTRON_MODE) return next();
  if (req.method === 'GET') return next();
  const isLocked = LIFETIME_ONLY_PREFIXES.some(prefix => req.path.startsWith(prefix));
  if (isLocked && getLicenseTier() === 'basic') {
    sendDebugTelemetry('upgrade_required_blocked', {
      path: req.path, method: req.method, resolved_tier: 'basic',
    });
    return res.status(403).json({ error: 'upgrade_required', tier: 'basic', message: 'Upgrade to Lifetime to unlock this feature.' });
  }
  next();
});

// ──────────────────────────────────────────────
// Mount route modules
// ──────────────────────────────────────────────
app.use('/api', require('./routes/env'));
app.use('/api', require('./routes/health'));
app.use('/api', require('./routes/tasks'));
app.use('/api', require('./routes/skills'));
app.use('/api', require('./routes/projects'));
app.use('/api', require('./routes/templates'));
app.use('/api', require('./routes/planner'));
app.use('/api', require('./routes/scripter'));
app.use('/api', require('./routes/schedules'));
app.use('/api', require('./routes/terminal'));
app.use('/api', require('./routes/workflows'));
app.use('/api', require('./routes/reel'));
app.use('/api', require('./routes/heygen'));
app.use('/api', require('./routes/stories'));
app.use('/api', require('./routes/influencer'));
app.use('/api', require('./routes/giveaway'));
app.use('/api', require('./routes/scout'));

// ── Claude CLI check ──
let claudeCliOk = false;
let claudeCliVersion = '';
let claudeLoggedIn = false;
let claudeEmail = '';
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
function checkClaudeAuth() {
  try {
    const out = execSync('claude auth status', {
      stdio: 'pipe', timeout: 8000, windowsHide: true, encoding: 'utf-8',
      env: { ...process.env }
    });
    const parsed = JSON.parse(out.trim());
    claudeLoggedIn = !!parsed.loggedIn;
    claudeEmail = parsed.email || '';
  } catch (_) {
    claudeLoggedIn = false;
    claudeEmail = '';
  }
}

// ── User preferences (persists across updates) ──
const USER_PREFS_FILE = path.join(BASE_DIR, 'user-prefs.json');
app.get('/api/user-prefs', (req, res) => {
  try {
    if (fs.existsSync(USER_PREFS_FILE)) {
      res.json(JSON.parse(fs.readFileSync(USER_PREFS_FILE, 'utf-8')));
    } else {
      res.json({});
    }
  } catch (_) { res.json({}); }
});
app.post('/api/user-prefs', express.json({ limit: '2mb' }), (req, res) => {
  try {
    // Merge with existing prefs
    let existing = {};
    if (fs.existsSync(USER_PREFS_FILE)) {
      try { existing = JSON.parse(fs.readFileSync(USER_PREFS_FILE, 'utf-8')); } catch (_) {}
    }
    const merged = { ...existing, ...req.body };
    fs.writeFileSync(USER_PREFS_FILE, JSON.stringify(merged, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Override the /api/health route with the extended version that includes uptime
// Re-checks Claude CLI + auth status on every call (not cached from boot time)
// so banner updates after user installs Claude via Setup
app.get('/api/health', (req, res) => {
  checkClaudeCli();
  if (claudeCliOk) checkClaudeAuth();
  res.json({
    ok: true,
    claude_cli: claudeCliOk,
    claude_version: claudeCliVersion,
    claude_logged_in: claudeLoggedIn,
    claude_email: claudeEmail,
    tasks: helpers.readTasks().length,
    uptime: process.uptime()
  });
});

// ── Intervals ──
const { checkWorkflowProgress } = require('./routes/workflows');
const { runSchedulerTick } = require('./lib/scheduler');

setInterval(checkWorkflowProgress, 3000);

// ──────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────
function startServer() {
  app.listen(PORT, () => {
    const appName = process.env.ELECTRON_MODE ? 'AI CEO' : 'AI CEO Studio';
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log(`║  🤖 ${appName.padEnd(38)}║`);
    console.log(`║  🌐 http://localhost:${String(PORT).padEnd(24)}║`);
    console.log('╚══════════════════════════════════════════════╝');

    if (checkClaudeCli()) {
      console.log(`  ✓ Claude CLI found: ${claudeCliVersion}`);
      checkClaudeAuth();
      if (claudeLoggedIn) {
        console.log(`  ✓ Logged in as: ${claudeEmail}`);
      } else {
        console.log('  ⚠ Claude CLI installed but NOT logged in');
        console.log('    Run "claude auth login" to connect your account');
      }
    } else {
      console.log('  ⚠ Claude CLI not found in PATH!');
      console.log('    Tasks will fail until "claude" is available.');
      console.log('    Install: https://docs.anthropic.com/en/docs/claude-code');
    }

    const { readSchedules } = require('./lib/scheduler');
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

// Auto-start when run directly or required by Electron
startServer();

// Clean up on shutdown
function gracefulShutdown() {
  console.log('\n[Server] Shutting down...');
  // Kill any tracked worker processes
  if (shared.activeWorkers.size > 0) {
    console.log(`[Server] Clearing ${shared.activeWorkers.size} active worker(s)...`);
    shared.activeWorkers.clear();
  }
  // Reset running tasks back to pending so they're recovered on next start
  try {
    const tasks = helpers.readTasks();
    let reset = 0;
    for (const t of tasks) {
      if (t.status === 'running') { t.status = 'pending'; t.worker = null; t.started_at = null; reset++; }
    }
    if (reset > 0) {
      helpers.writeTasks(tasks);
      console.log(`[Server] Reset ${reset} running task(s) to pending`);
    }
  } catch (_) {}
  terminalManager.cleanup();
  process.exit();
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
