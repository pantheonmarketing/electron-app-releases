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

// Also fix PATH for Windows — npm global, Python, Git, etc.
if (shared.IS_WIN) {
  const home = require('os').homedir();
  const extraPaths = [
    path.join(home, 'AppData', 'Roaming', 'npm'),       // npm -g
    path.join(home, 'AppData', 'Local', 'Programs', 'Python'),
    'C:\\Python312', 'C:\\Python311', 'C:\\Python310',
    path.join(home, '.local', 'bin'),
    'C:\\Program Files\\Git\\cmd',                        // Git
    'C:\\Program Files\\Git\\bin',
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

  // Set CLAUDE_CODE_GIT_BASH_PATH so Claude CLI finds bash
  const bashExe = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (!process.env.CLAUDE_CODE_GIT_BASH_PATH && fs.existsSync(bashExe)) {
    process.env.CLAUDE_CODE_GIT_BASH_PATH = bashExe;
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
  // Try importing the module — also try without __version__ as some packages don't have it
  let r = checkTool(`python -c "import ${mod}; print(${mod}.__version__)"`);
  if (!r.ok) r = checkTool(`python -c "import ${mod}; print('installed')"`);
  if (r.ok) return r;
  if (shared.IS_MAC) {
    r = checkTool(`python3 -c "import ${mod}; print(${mod}.__version__)"`);
    if (!r.ok) r = checkTool(`python3 -c "import ${mod}; print('installed')"`);
  }
  return r;
}

function checkClaudeAuth() {
  try {
    const out = execSync('claude auth status', {
      stdio: 'pipe', timeout: 8000, windowsHide: true, encoding: 'utf-8',
      env: { ...process.env }
    });
    const parsed = JSON.parse(out.trim());
    return { loggedIn: !!parsed.loggedIn, email: parsed.email || null };
  } catch (_) { return { loggedIn: false, email: null }; }
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
  const nd = checkTool('node --version');
  deps.node = { installed: nd.ok, version: nd.version || null, required: true,
    description: 'Runtime engine (needed for Claude CLI)',
    canAutoInstall: true };
  const gt = checkTool('git --version');
  deps.git = { installed: gt.ok, version: gt.version || null, required: true,
    description: 'Needed by Claude CLI on Windows (provides git-bash)',
    canAutoInstall: true };
  // Claude needs both Node (for npm install) and Git (for git-bash runtime)
  const cl = checkTool('claude --version');
  const auth = cl.ok ? checkClaudeAuth() : { loggedIn: false, email: null };
  deps.claude = { installed: cl.ok, version: cl.version || null, required: true,
    description: 'AI brain that powers all tasks',
    canAutoInstall: nd.ok && gt.ok, loggedIn: auth.loggedIn, email: auth.email };
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

// ── Remote setup logging ──
// Fire-and-forget: log every install attempt to Vercel/Neon so we can debug student issues
const SETUP_LOG_URL = 'https://www.aicreatorworkshop.com/api/setup-log';
let _logMeta = null; // cached machine info, populated on first call

function getLogMeta() {
  if (_logMeta) return _logMeta;
  const os = require('os');
  _logMeta = {
    computer_name: os.hostname(),
    os_info: `${os.platform()} ${os.release()} (${os.arch()})`,
    app_version: require('../package.json').version,
  };
  // Try to read license key from stored file (Electron saves to %APPDATA%\AI CEO\)
  try {
    const candidates = [
      path.join(shared.getAppDataDir(), 'AI CEO', 'license.json'),
      path.join(shared.getAppDataDir(), 'electron', 'license.json'),
    ];
    for (const licFile of candidates) {
      if (fs.existsSync(licFile)) {
        const lic = JSON.parse(fs.readFileSync(licFile, 'utf-8'));
        if (lic.key) { _logMeta.license_key = lic.key; break; }
      }
    }
  } catch (_) {}
  return _logMeta;
}

function sendSetupLog(pkg, success, output, error) {
  const meta = getLogMeta();
  const body = { ...meta, package: pkg, success, output: (output || '').slice(0, 4000), error: (error || '').slice(0, 4000) };
  // Fire and forget — never block the response
  const https = require('https');
  const data = JSON.stringify(body);
  const url = new URL(SETUP_LOG_URL);
  const req = https.request({
    hostname: url.hostname, port: 443, path: url.pathname,
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, () => {});
  req.on('error', () => {}); // swallow errors
  req.write(data);
  req.end();
}

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
  const allowed = ['faster-whisper', 'yt-dlp', 'claude-cli', 'python', 'claude-login', 'node', 'git'];
  if (!pkg || !allowed.includes(pkg)) {
    return res.status(400).json({ ok: false, error: `Invalid package. Allowed: ${allowed.join(', ')}` });
  }

  console.log(`[Setup] Installing ${pkg}...`);

  // Helper: respond + log in one call
  const succeed = (data) => { sendSetupLog(pkg, true, data.output || data.message || '', ''); res.json(data); };
  const fail = (status, data) => { sendSetupLog(pkg, false, '', data.error + (data.details ? ' | ' + data.details : '')); res.status(status).json(data); };

  try {
    if (pkg === 'node') {
      // Install Node.js via direct download
      if (shared.IS_WIN) {
        try {
          const nodeUrl = 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi';
          const psCmd = `powershell -Command "` +
            `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ` +
            `Write-Host 'Downloading Node.js...'; ` +
            `Invoke-WebRequest -Uri '${nodeUrl}' -OutFile $env:TEMP\\node-install.msi -UseBasicParsing; ` +
            `Write-Host 'Installing Node.js...'; ` +
            `Start-Process msiexec.exe -ArgumentList '/i', $env:TEMP\\node-install.msi, '/quiet', '/norestart' -Wait; ` +
            `Write-Host 'Done'"`;
          await runCmd(psCmd, { timeout: 300 * 1000 });
          const newNodePath = 'C:\\Program Files\\nodejs';
          if (!process.env.PATH.includes(newNodePath)) {
            process.env.PATH = newNodePath + ';' + process.env.PATH;
          }
          console.log(`[Setup] Node.js installed`);
          succeed({ ok: true, package: pkg, message: 'Node.js installed! Click Re-check to update the list.' });
        } catch (e) {
          fail(500, { ok: false, error: 'Failed to install Node.js automatically.', details: (e.stderr || e.message).slice(0, 500) });
        }
      } else if (shared.IS_MAC) {
        // Try Homebrew first, then fall back to direct .pkg download
        let installed = false;
        try {
          await runCmd('which brew');
          const { stdout } = await runCmd('brew install node', { timeout: 300 * 1000 });
          installed = true;
          succeed({ ok: true, package: pkg, output: stdout.slice(-500) });
        } catch (_) {}

        if (!installed) {
          // Direct download of Node.js .pkg installer (works without Homebrew)
          try {
            const nodeVer = 'v22.14.0';
            const nodeUrl = `https://nodejs.org/dist/${nodeVer}/node-${nodeVer}.pkg`; // universal .pkg
            console.log(`[Setup] Downloading Node.js .pkg for Mac...`);

            await runCmd(`curl -fsSL "${nodeUrl}" -o /tmp/node-install.pkg`, { timeout: 120 * 1000 });
            console.log('[Setup] Installing Node.js .pkg...');
            // installer requires sudo — use osascript to prompt for admin password
            await runCmd(
              `osascript -e 'do shell script "installer -pkg /tmp/node-install.pkg -target /" with administrator privileges'`,
              { timeout: 120 * 1000 }
            );

            // Add to PATH for this process
            const nodePaths = ['/usr/local/bin', '/opt/homebrew/bin'];
            for (const p of nodePaths) {
              if (!process.env.PATH.includes(p)) process.env.PATH = p + ':' + process.env.PATH;
            }
            console.log(`[Setup] Node.js installed via .pkg`);
            succeed({ ok: true, package: pkg, message: 'Node.js installed! Click Re-check to update the list.' });
          } catch (e) {
            fail(500, { ok: false, error: 'Failed to install Node.js. A system dialog may have appeared asking for your password — please approve it and try again.',
              details: (e.stderr || e.message || '').slice(0, 500) });
          }
        }
      } else {
        fail(400, { ok: false, error: 'Use your package manager to install nodejs' });
      }

    } else if (pkg === 'git') {
      // Install Git for Windows (needed by Claude CLI for git-bash)
      if (shared.IS_WIN) {
        try {
          const gitUrl = 'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe';
          const psCmd = `powershell -Command "` +
            `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ` +
            `Write-Host 'Downloading Git for Windows...'; ` +
            `Invoke-WebRequest -Uri '${gitUrl}' -OutFile $env:TEMP\\git-install.exe -UseBasicParsing; ` +
            `Write-Host 'Installing Git...'; ` +
            `Start-Process $env:TEMP\\git-install.exe -ArgumentList '/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-' -Wait; ` +
            `Write-Host 'Done'"`;
          await runCmd(psCmd, { timeout: 300 * 1000 });
          // Add Git to PATH and set CLAUDE_CODE_GIT_BASH_PATH
          const gitPaths = ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\Git\\bin'];
          for (const p of gitPaths) {
            if (!process.env.PATH.includes(p)) process.env.PATH = p + ';' + process.env.PATH;
          }
          const bashExe = 'C:\\Program Files\\Git\\bin\\bash.exe';
          if (fs.existsSync(bashExe)) {
            process.env.CLAUDE_CODE_GIT_BASH_PATH = bashExe;
          }
          console.log(`[Setup] Git installed`);
          succeed({ ok: true, package: pkg, message: 'Git installed! Click Re-check to update the list.' });
        } catch (e) {
          fail(500, { ok: false, error: 'Failed to install Git automatically.', details: (e.stderr || e.message).slice(0, 500) });
        }
      } else if (shared.IS_MAC) {
        try {
          await runCmd('xcode-select --install', { timeout: 10 * 1000 });
          succeed({ ok: true, package: pkg, message: 'Installing Xcode Command Line Tools (includes Git). A system dialog should appear.' });
        } catch (_) {
          fail(500, { ok: false, error: 'Please install Git via Homebrew: brew install git' });
        }
      } else {
        fail(400, { ok: false, error: 'Use your package manager to install git' });
      }

    } else if (pkg === 'claude-login') {
      // First check if already logged in (maybe user logged in manually)
      const preAuth = checkClaudeAuth();
      if (preAuth.loggedIn) {
        console.log(`[Setup] Claude already logged in: ${preAuth.email}`);
        succeed({ ok: true, package: pkg, email: preAuth.email, message: `Already logged in as ${preAuth.email}` });
        return;
      }

      // Spawn a detached CMD window for login — don't block the HTTP response
      const { spawn } = require('child_process');
      if (shared.IS_WIN) {
        // Ensure CLAUDE_CODE_GIT_BASH_PATH is set for the spawned process
        const bashExe = 'C:\\Program Files\\Git\\bin\\bash.exe';
        if (fs.existsSync(bashExe) && !process.env.CLAUDE_CODE_GIT_BASH_PATH) {
          process.env.CLAUDE_CODE_GIT_BASH_PATH = bashExe;
        }
        // Open a CMD window that stays open (/k) so the user can see what's happening
        const child = spawn('cmd.exe', ['/c', 'start', 'cmd', '/k',
          'echo. && echo   Complete the login in your browser... && echo. && claude auth login && echo. && echo   Login complete! You can close this window. && echo   Then click Re-check in the setup page.'],
          { detached: true, stdio: 'ignore', windowsHide: false, env: { ...process.env } });
        child.unref();
      } else if (shared.IS_MAC) {
        try {
          const { execSync: es } = require('child_process');
          es('osascript -e \'tell application "Terminal" to do script "claude auth login"\'', { timeout: 5000 });
        } catch (_) {}
      } else {
        // Linux — try opening in a terminal emulator
        const child = spawn('x-terminal-emulator', ['-e', 'claude auth login'],
          { detached: true, stdio: 'ignore' });
        child.unref();
      }

      // Wait a few seconds then check — user might have a cached session
      await new Promise(r => setTimeout(r, 3000));
      const auth = checkClaudeAuth();
      if (auth.loggedIn) {
        console.log(`[Setup] Claude login successful: ${auth.email}`);
        succeed({ ok: true, package: pkg, email: auth.email, message: `Logged in as ${auth.email}` });
      } else {
        // Not an error — the login window is open, user just needs to complete it
        sendSetupLog(pkg, false, '', 'Login window opened but not yet completed');
        res.json({ ok: true, package: pkg, pending: true,
          message: 'A login window opened — complete the login in your browser, then click Re-check here.' });
      }

    } else if (pkg === 'claude-cli') {
      const npmCheck = checkTool('npm --version');
      if (!npmCheck.ok) {
        return fail(400, { ok: false, error: 'Node.js must be installed first (it provides npm). Install Node.js above, then retry.' });
      }
      const { stdout } = await runCmd('npm install -g @anthropic-ai/claude-code');
      const npmGlobalBin = path.join(require('os').homedir(), 'AppData', 'Roaming', 'npm');
      if (shared.IS_WIN && !process.env.PATH.includes(npmGlobalBin)) {
        process.env.PATH = npmGlobalBin + ';' + process.env.PATH;
      }
      if (shared.IS_MAC) {
        try {
          const prefix = execSync('npm prefix -g', { encoding: 'utf-8', timeout: 5000 }).trim();
          const macBin = path.join(prefix, 'bin');
          if (!process.env.PATH.includes(macBin)) process.env.PATH = macBin + ':' + process.env.PATH;
        } catch (_) {}
      }
      console.log(`[Setup] Claude CLI installed`);
      succeed({ ok: true, package: pkg, output: stdout.slice(-500), message: 'Claude CLI installed! Now click Login to connect your account.' });

    } else if (pkg === 'python') {
      if (shared.IS_WIN) {
        try {
          const { stdout } = await runCmd('winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements',
            { timeout: 300 * 1000 });
          const homeW = require('os').homedir();
          const pyPathsW = [
            'C:\\Program Files\\Python312', 'C:\\Program Files\\Python312\\Scripts',
            path.join(homeW, 'AppData', 'Local', 'Programs', 'Python', 'Python312'),
            path.join(homeW, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts'),
          ];
          for (const p of pyPathsW) {
            if (fs.existsSync(p) && !process.env.PATH.includes(p)) process.env.PATH = p + ';' + process.env.PATH;
          }
          succeed({ ok: true, package: pkg, output: stdout.slice(-500), message: 'Python installed! Click Re-check to update.' });
        } catch (e) {
          console.log('[Setup] winget failed, trying direct Python download...');
          try {
            const pyUrl = 'https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe';
            const psCmd = `powershell -Command "` +
              `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ` +
              `Write-Host 'Downloading Python...'; ` +
              `Invoke-WebRequest -Uri '${pyUrl}' -OutFile $env:TEMP\\python-install.exe -UseBasicParsing; ` +
              `Write-Host 'Installing Python...'; ` +
              `Start-Process $env:TEMP\\python-install.exe -ArgumentList '/quiet', 'InstallAllUsers=1', 'PrependPath=1' -Wait; ` +
              `Write-Host 'Done'"`;
            await runCmd(psCmd, { timeout: 300 * 1000 });
            const home = require('os').homedir();
            const pyPaths = [
              'C:\\Program Files\\Python312', 'C:\\Program Files\\Python312\\Scripts',
              path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312'),
              path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts'),
            ];
            for (const p of pyPaths) {
              if (fs.existsSync(p) && !process.env.PATH.includes(p)) process.env.PATH = p + ';' + process.env.PATH;
            }
            console.log(`[Setup] Python installed via direct download`);
            succeed({ ok: true, package: pkg, message: 'Python installed! Click Re-check to update.' });
          } catch (e2) {
            fail(500, { ok: false, error: 'Automatic install failed. Please download Python from python.org/downloads', details: (e2.stderr || e2.message).slice(0, 500) });
          }
        }
      } else if (shared.IS_MAC) {
        try {
          await runCmd('which brew');
          const { stdout } = await runCmd('brew install python3', { timeout: 300 * 1000 });
          succeed({ ok: true, package: pkg, output: stdout.slice(-500) });
        } catch (_) {
          try {
            await runCmd('xcode-select --install', { timeout: 10 * 1000 });
            succeed({ ok: true, package: pkg, message: 'Installing Xcode Command Line Tools (includes Python). A system dialog should appear — click Install.' });
          } catch (e2) {
            fail(500, { ok: false, error: 'Please install Python from python.org/downloads or install Homebrew first (brew.sh)' });
          }
        }
      } else {
        fail(400, { ok: false, error: 'Use your package manager to install python3' });
      }

    } else {
      // pip packages (faster-whisper, yt-dlp)

      // faster-whisper needs Visual C++ Redistributable for ctranslate2.dll on Windows
      if (pkg === 'faster-whisper' && shared.IS_WIN) {
        // Check if VC++ Redist is already installed (look for vcruntime140.dll in System32)
        const vcDll = 'C:\\Windows\\System32\\vcruntime140.dll';
        if (!fs.existsSync(vcDll)) {
          console.log('[Setup] Installing Visual C++ Redistributable (needed by faster-whisper)...');
          try {
            const vcUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
            const psCmd = `powershell -Command "` +
              `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ` +
              `Write-Host 'Downloading Visual C++ Redistributable...'; ` +
              `Invoke-WebRequest -Uri '${vcUrl}' -OutFile $env:TEMP\\vc_redist.x64.exe -UseBasicParsing; ` +
              `Write-Host 'Installing...'; ` +
              `Start-Process $env:TEMP\\vc_redist.x64.exe -ArgumentList '/quiet', '/norestart' -Wait; ` +
              `Write-Host 'Done'"`;
            await runCmd(psCmd, { timeout: 120 * 1000 });
            console.log('[Setup] Visual C++ Redistributable installed');
          } catch (vcErr) {
            console.log('[Setup] VC++ Redist install failed:', vcErr.message?.slice(0, 200));
            sendSetupLog('vc-redist', false, '', (vcErr.stderr || vcErr.message).slice(0, 2000));
          }
        }
      }

      const pipCmd = shared.IS_MAC ? 'python3 -m pip' : 'python -m pip';
      const { stdout, stderr } = await runCmd(`${pipCmd} install ${pkg}`, { timeout: 300 * 1000 });
      console.log(`[Setup] ${pkg} pip install finished`);

      // Verify the install actually worked by importing
      // On Mac, python3 is the command — try it first to avoid false failures
      const modName = pkg === 'faster-whisper' ? 'faster_whisper' : pkg.replace(/-/g, '_');
      let verify;
      if (shared.IS_MAC) {
        verify = checkTool(`python3 -c "import ${modName}; print('OK')"`);
        if (!verify.ok) verify = checkTool(`python -c "import ${modName}; print('OK')"`);
      } else {
        verify = checkTool(`python -c "import ${modName}; print('OK')"`);
      }

      if (verify.ok) {
        succeed({ ok: true, package: pkg, output: stdout.slice(-500) });
      } else {
        // pip said OK but import fails — capture the actual error for remote logging
        const pyCmd = shared.IS_MAC ? 'python3' : 'python';
        let importErr = '';
        try {
          execSync(`${pyCmd} -c "import ${modName}"`, { encoding: 'utf-8', timeout: 8000, windowsHide: true });
        } catch (ie) {
          importErr = (ie.stderr || ie.message || '').slice(0, 2000);
        }
        const pipOut = (stdout + '\n' + (stderr || '')).slice(-1500);
        sendSetupLog(pkg, false, pipOut, `import ${modName} failed: ${importErr}`);
        fail(500, { ok: false,
          error: `${pkg} was installed by pip but failed to load. This usually means a system library is missing.`,
          details: importErr.slice(0, 500) });
      }
    }
  } catch (err) {
    console.error(`[Setup] Failed to install ${pkg}:`, err.message?.slice(0, 200));
    fail(500, { ok: false, error: `Failed to install ${pkg}`, details: (err.stderr || err.message).slice(0, 500) });
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
