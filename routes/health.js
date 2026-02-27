const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { readTasks } = require('../lib/helpers');
const router = express.Router();

// ── Fix PATH for macOS Electron ──
// Electron apps on Mac don't inherit the user's shell PATH, so tools installed
// via Homebrew, nvm, npm -g, pyenv etc. aren't found. Add common locations.
if (shared.IS_MAC) {
  const extraPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',            // Apple Silicon Homebrew
    '/opt/homebrew/sbin',
    path.join(require('os').homedir(), '.nvm/versions/node'),  // nvm
    path.join(require('os').homedir(), '.local/bin'),           // pip --user
    path.join(require('os').homedir(), 'Library/Python'),       // macOS pip
    '/usr/local/opt/python/libexec/bin',
  ];
  // For nvm: find latest node version
  const nvmDir = path.join(require('os').homedir(), '.nvm/versions/node');
  try {
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir).sort().reverse();
      if (versions.length > 0) {
        extraPaths.push(path.join(nvmDir, versions[0], 'bin'));
      }
    }
  } catch (_) {}
  // For npm global: find prefix
  try {
    const npmPrefix = execSync('npm prefix -g', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (npmPrefix) extraPaths.push(path.join(npmPrefix, 'bin'));
  } catch (_) {}

  const currentPath = process.env.PATH || '';
  const newPaths = extraPaths.filter(p => !currentPath.includes(p) && fs.existsSync(p));
  if (newPaths.length > 0) {
    process.env.PATH = newPaths.join(':') + ':' + currentPath;
    console.log(`[PATH] Added ${newPaths.length} Mac paths: ${newPaths.join(', ')}`);
  }
}

// Also fix PATH for Windows — npm global, Python, etc.
if (shared.IS_WIN) {
  const home = require('os').homedir();
  const extraPaths = [
    path.join(home, 'AppData', 'Roaming', 'npm'),       // npm -g
    path.join(home, 'AppData', 'Local', 'Programs', 'Python'),
    'C:\\Python312', 'C:\\Python311', 'C:\\Python310',
    path.join(home, '.local', 'bin'),
  ];
  // Find Python in AppData
  const pyBase = path.join(home, 'AppData', 'Local', 'Programs', 'Python');
  try {
    if (fs.existsSync(pyBase)) {
      for (const d of fs.readdirSync(pyBase)) {
        extraPaths.push(path.join(pyBase, d));
        extraPaths.push(path.join(pyBase, d, 'Scripts'));
      }
    }
  } catch (_) {}

  const currentPath = process.env.PATH || '';
  const newPaths = extraPaths.filter(p => !currentPath.includes(p) && fs.existsSync(p));
  if (newPaths.length > 0) {
    process.env.PATH = newPaths.join(';') + ';' + currentPath;
  }
}

function checkTool(cmd) {
  try {
    const out = execSync(cmd, { stdio: 'pipe', timeout: 8000, windowsHide: true, encoding: 'utf-8',
      env: { ...process.env } });
    return { ok: true, version: out.trim().split('\n')[0].slice(0, 80) };
  } catch { return { ok: false }; }
}

// Mac: also try python3 if python fails
function checkPython() {
  const py = checkTool('python --version');
  if (py.ok) return py;
  if (shared.IS_MAC) return checkTool('python3 --version');
  return py;
}

function checkPythonImport(mod) {
  const r = checkTool(`python -c "import ${mod}; print(${mod}.__version__)"`);
  if (r.ok) return r;
  if (shared.IS_MAC) return checkTool(`python3 -c "import ${mod}; print(${mod}.__version__)"`);
  return r;
}

router.get('/health', (req, res) => {
  const checks = {};
  checks.ffmpeg = checkTool(`${shared.FFMPEG_BIN} -version`).ok;
  checks.python = checkPython().ok;
  checks.whisper = checkPythonImport('faster_whisper').ok;
  checks.claude = checkTool('claude --version').ok;
  checks.ytdlp = checkTool('yt-dlp --version').ok;
  checks.all_good = checks.ffmpeg && checks.python && checks.whisper && checks.claude && checks.ytdlp;
  checks.version = require('../package.json').version;
  res.json(checks);
});

router.get('/setup/check', (req, res) => {
  const deps = {};
  const py = checkPython();
  deps.python = { installed: py.ok, version: py.version || null, required: false,
    description: 'Needed for subtitles & video downloads',
    canAutoInstall: true };
  const cl = checkTool('claude --version');
  deps.claude = { installed: cl.ok, version: cl.version || null, required: true,
    description: 'AI brain that powers all tasks',
    canAutoInstall: true };
  const nd = checkTool('node --version');
  deps.node = { installed: nd.ok, version: nd.version || null, required: true,
    description: 'Runtime engine (needed for Claude CLI)',
    canAutoInstall: false };
  const fw = checkPythonImport('faster_whisper');
  deps.faster_whisper = { installed: fw.ok, version: fw.version || null, required: false,
    description: 'Auto-generates subtitles from speech',
    canAutoInstall: py.ok };
  const yt = checkTool('yt-dlp --version');
  deps.ytdlp = { installed: yt.ok, version: yt.version || null, required: false,
    description: 'Downloads videos from TikTok, YouTube, etc.',
    canAutoInstall: py.ok };
  const ff = checkTool(`${shared.FFMPEG_BIN} -version`);
  deps.ffmpeg = { installed: ff.ok, version: ff.version || null, required: true,
    description: 'Video/audio processing (bundled)', bundled: true };
  const allRequired = deps.claude.installed && deps.ffmpeg.installed;
  const allOptional = deps.faster_whisper.installed && deps.ytdlp.installed;
  deps.platform = shared.IS_WIN ? 'win' : shared.IS_MAC ? 'mac' : 'linux';
  res.json({ deps, allRequired, allOptional, allGood: allRequired && allOptional });
});

// Expanded install endpoint — handles all dependencies
const runCmd = (cmd, opts) => new Promise((resolve, reject) => {
  const { exec: execCb } = require('child_process');
  execCb(cmd, { shell: true, encoding: 'utf-8', timeout: 180 * 1000, windowsHide: true, ...opts },
    (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; err.stdout = stdout; return reject(err); }
      resolve({ stdout, stderr });
    });
});

router.post('/setup/install', express.json(), async (req, res) => {
  const { package: pkg } = req.body;
  const allowed = ['faster-whisper', 'yt-dlp', 'claude-cli', 'python'];
  if (!pkg || !allowed.includes(pkg)) {
    return res.status(400).json({ ok: false, error: `Invalid package. Allowed: ${allowed.join(', ')}` });
  }

  console.log(`[Setup] Installing ${pkg}...`);

  try {
    if (pkg === 'claude-cli') {
      // Install Claude CLI globally via npm
      const { stdout } = await runCmd('npm install -g @anthropic-ai/claude-code');
      console.log(`[Setup] Claude CLI installed`);
      res.json({ ok: true, package: pkg, output: stdout.slice(-500),
        message: 'Claude CLI installed! You still need to run "claude login" in a terminal to authenticate.' });

    } else if (pkg === 'python') {
      // Platform-specific Python install
      if (shared.IS_WIN) {
        // Windows: try winget first
        try {
          const { stdout } = await runCmd('winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements',
            { timeout: 300 * 1000 });
          res.json({ ok: true, package: pkg, output: stdout.slice(-500),
            message: 'Python installed! Restart the app for it to be detected.' });
        } catch (e) {
          res.status(500).json({ ok: false, error: 'Automatic install failed. Please download Python from python.org/downloads',
            details: (e.stderr || e.message).slice(0, 500) });
        }
      } else if (shared.IS_MAC) {
        // Mac: try brew, or xcode command line tools (which includes python3)
        try {
          await runCmd('which brew');
          const { stdout } = await runCmd('brew install python3', { timeout: 300 * 1000 });
          res.json({ ok: true, package: pkg, output: stdout.slice(-500) });
        } catch (_) {
          // No brew — try xcode-select
          try {
            await runCmd('xcode-select --install', { timeout: 10 * 1000 });
            res.json({ ok: true, package: pkg,
              message: 'Installing Xcode Command Line Tools (includes Python). A system dialog should appear — click Install.' });
          } catch (e2) {
            res.status(500).json({ ok: false, error: 'Please install Python from python.org/downloads or install Homebrew first (brew.sh)' });
          }
        }
      } else {
        res.status(400).json({ ok: false, error: 'Use your package manager to install python3' });
      }

    } else {
      // pip packages (faster-whisper, yt-dlp)
      const pipCmd = shared.IS_MAC ? 'python3 -m pip' : 'python -m pip';
      const { stdout } = await runCmd(`${pipCmd} install ${pkg}`);
      console.log(`[Setup] ${pkg} installed successfully`);
      res.json({ ok: true, package: pkg, output: stdout.slice(-500) });
    }
  } catch (err) {
    console.error(`[Setup] Failed to install ${pkg}:`, err.message?.slice(0, 200));
    res.status(500).json({ ok: false, error: `Failed to install ${pkg}`, details: (err.stderr || err.message).slice(0, 500) });
  }
});

router.post('/setup-complete', express.json(), (req, res) => {
  const setupFile = path.join(shared.getAppDataDir(), 'electron', 'setup-done.json');
  try {
    fs.mkdirSync(path.dirname(setupFile), { recursive: true });
    fs.writeFileSync(setupFile, JSON.stringify({ completed_at: new Date().toISOString() }));
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true });
  }
});

router.get('/license-tier', (req, res) => {
  res.json({ tier: shared.getLicenseTier() });
});

module.exports = router;
