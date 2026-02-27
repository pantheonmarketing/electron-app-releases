const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { readTasks } = require('../lib/helpers');
const router = express.Router();

function checkTool(cmd) {
  try {
    const out = execSync(cmd, { stdio: 'pipe', timeout: 8000, windowsHide: true, encoding: 'utf-8' });
    return { ok: true, version: out.trim().split('\n')[0].slice(0, 80) };
  } catch { return { ok: false }; }
}

router.get('/health', (req, res) => {
  const checks = {};
  checks.ffmpeg = checkTool(`${shared.FFMPEG_BIN} -version`).ok;
  checks.python = checkTool('python --version').ok;
  checks.whisper = checkTool('python -c "import faster_whisper; print(faster_whisper.__version__)"').ok;
  checks.claude = checkTool('claude --version').ok;
  checks.ytdlp = checkTool('yt-dlp --version').ok;
  checks.all_good = checks.ffmpeg && checks.python && checks.whisper && checks.claude && checks.ytdlp;
  checks.version = require('../package.json').version;
  res.json(checks);
});

router.get('/setup/check', (req, res) => {
  const deps = {};
  const py = checkTool('python --version');
  deps.python = { installed: py.ok, version: py.version || null, required: true,
    description: 'Required for AI transcription',
    installUrl: 'https://www.python.org/downloads/' };
  const cl = checkTool('claude --version');
  deps.claude = { installed: cl.ok, version: cl.version || null, required: true,
    description: 'Required for AI task generation',
    installUrl: 'https://claude.ai/download' };
  const fw = checkTool('python -c "import faster_whisper; print(faster_whisper.__version__)"');
  deps.faster_whisper = { installed: fw.ok, version: fw.version || null, required: false,
    description: 'Fast AI transcription (for Scripter)',
    pipPackage: 'faster-whisper' };
  const yt = checkTool('yt-dlp --version');
  deps.ytdlp = { installed: yt.ok, version: yt.version || null, required: false,
    description: 'Download videos from TikTok, YouTube, etc.',
    pipPackage: 'yt-dlp' };
  const ff = checkTool(`${shared.FFMPEG_BIN} -version`);
  deps.ffmpeg = { installed: ff.ok, version: ff.version || null, required: true,
    description: 'Video/audio processing (bundled)', bundled: true };
  const allRequired = deps.python.installed && deps.claude.installed && deps.ffmpeg.installed;
  const allOptional = deps.faster_whisper.installed && deps.ytdlp.installed;
  res.json({ deps, allRequired, allOptional, allGood: allRequired && allOptional });
});

router.post('/setup/install', express.json(), async (req, res) => {
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
    const { stdout } = await runCmd(`python -m pip install ${pkg}`, {
      shell: true, encoding: 'utf-8', timeout: 120 * 1000, windowsHide: true
    });
    console.log(`[Setup] ${pkg} installed successfully`);
    res.json({ ok: true, package: pkg, output: stdout.slice(-500) });
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
