const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const shared = require('../lib/shared');
const router = express.Router();

const ACCOUNTS_FILE = path.join(shared.BASE_DIR, 'scout-accounts.txt');
const YT_CHANNELS_FILE = path.join(shared.BASE_DIR, 'scout-yt-channels.txt');

// ──────────────────────────────────────────────
// Scout — List available scout runs
// ──────────────────────────────────────────────

router.get('/scout/runs', (req, res) => {
  try {
    const dir = shared.RESULTS_DIR;
    if (!fs.existsSync(dir)) return res.json({ ok: true, runs: [] });

    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('scout-') && f.endsWith('-summary.json'));

    const runs = files.map(f => {
      try {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
        const data = JSON.parse(raw);
        // Extract date from filename: scout-custom-list-2026-03-02T09-23-40-summary.json
        const dateMatch = f.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
        const dateStr = dateMatch ? dateMatch[1].replace(/-/g, (m, i) => i > 9 ? ':' : '-') : '';
        const dateObj = dateStr ? new Date(dateStr.replace(/T(\d{2}):(\d{2}):(\d{2})/, 'T$1:$2:$3')) : null;
        // Detect source from posts data
        const posts = data.giveawayPosts || [];
        const hasIG = posts.some(p => !p.source || p.source === 'instagram');
        const hasYT = posts.some(p => p.source === 'youtube');
        const source = hasIG && hasYT ? 'both' : hasYT ? 'youtube' : 'instagram';
        return {
          filename: f,
          date: dateObj ? dateObj.toISOString() : '',
          label: dateObj
            ? `${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ${data.totalAccounts || 0} accounts, ${data.totalPosts || 0} posts`
            : f,
          totalAccounts: data.totalAccounts || 0,
          totalPosts: data.totalPosts || 0,
          totalGiveaways: data.totalGiveaways || 0,
          source,
        };
      } catch (_) { return null; }
    }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));

    res.json({ ok: true, runs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────
// Scout — Get summary for a specific run
// ──────────────────────────────────────────────

router.get('/scout/summary/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ ok: false, error: 'Invalid filename' });
    }
    if (!filename.startsWith('scout-') || !filename.endsWith('-summary.json')) {
      return res.status(400).json({ ok: false, error: 'Invalid scout filename' });
    }

    const file = path.join(shared.RESULTS_DIR, filename);
    if (!fs.existsSync(file)) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }

    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────
// Scout — Image proxy (IG CDN blocks direct browser requests)
// ──────────────────────────────────────────────

const imageCache = new Map(); // url → { buffer, contentType, ts }
const CACHE_TTL = 30 * 60 * 1000; // 30 min

router.get('/scout/img', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end();

  // Only allow Instagram CDN domains
  try {
    const parsed = new URL(url);
    const allowed = ['cdninstagram.com', 'fbcdn.net', 'ytimg.com', 'ggpht.com', 'googleusercontent.com'];
    if (!allowed.some(d => parsed.hostname.includes(d))) {
      return res.status(403).json({ error: 'Only allowed CDN URLs' });
    }
  } catch { return res.status(400).end(); }

  // Check cache
  const cached = imageCache.get(url);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=1800');
    return res.send(cached.buffer);
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!resp.ok) return res.status(resp.status).end();
    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 'image/jpeg';

    // Cache it
    imageCache.set(url, { buffer, contentType, ts: Date.now() });
    // Evict old entries if cache gets big
    if (imageCache.size > 200) {
      const oldest = [...imageCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) imageCache.delete(oldest[0]);
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=1800');
    res.send(buffer);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch image' });
  }
});

// ──────────────────────────────────────────────
// Scout — Read account list
// ──────────────────────────────────────────────

router.get('/scout/accounts', (req, res) => {
  try {
    const fileExists = fs.existsSync(ACCOUNTS_FILE);
    if (!fileExists) {
      if (shared.sendDebugTelemetry) shared.sendDebugTelemetry('scout_load_accounts', {
        file_exists: false, accounts_file: ACCOUNTS_FILE, count: 0,
      });
      return res.json({ ok: true, accounts: [] });
    }
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
    const accounts = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (shared.sendDebugTelemetry) shared.sendDebugTelemetry('scout_load_accounts', {
      file_exists: true, accounts_file: ACCOUNTS_FILE, count: accounts.length,
      first_3: accounts.slice(0, 3).join(', '),
    });
    res.json({ ok: true, accounts });
  } catch (err) {
    if (shared.sendDebugTelemetry) shared.sendDebugTelemetry('scout_load_accounts_error', {
      error: err.message, accounts_file: ACCOUNTS_FILE,
    });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────
// Scout — Save account list
// ──────────────────────────────────────────────

router.put('/scout/accounts', (req, res) => {
  try {
    const { accounts } = req.body;
    if (!Array.isArray(accounts)) return res.status(400).json({ ok: false, error: 'accounts must be an array' });
    const clean = [...new Set(
      accounts.map(a => String(a).trim().toLowerCase()
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
        .replace(/^@/, '')
        .replace(/\/+$/, '')
        .replace(/\?.*$/, '')
      ).filter(a => a && /^[a-zA-Z0-9_.]+$/.test(a))
    )];
    const header = `# Scout accounts — updated ${new Date().toISOString().split('T')[0]}\n# ${clean.length} accounts\n\n`;
    fs.writeFileSync(ACCOUNTS_FILE, header + clean.join('\n') + '\n');
    // Verify the write actually worked
    const verifyExists = fs.existsSync(ACCOUNTS_FILE);
    const verifySize = verifyExists ? fs.statSync(ACCOUNTS_FILE).size : 0;
    if (shared.sendDebugTelemetry) shared.sendDebugTelemetry('scout_save_accounts', {
      input_count: accounts.length, saved_count: clean.length,
      file: ACCOUNTS_FILE, write_verified: verifyExists, file_size: verifySize,
      first_3: clean.slice(0, 3).join(', '),
    });
    res.json({ ok: true, count: clean.length, accounts: clean });
  } catch (err) {
    if (shared.sendDebugTelemetry) shared.sendDebugTelemetry('scout_save_accounts_error', {
      error: err.message, file: ACCOUNTS_FILE,
    });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────
// Scout — Read YouTube channel list
// ──────────────────────────────────────────────

router.get('/scout/yt-channels', (req, res) => {
  try {
    if (!fs.existsSync(YT_CHANNELS_FILE)) {
      if (shared.sendDebugTelemetry) shared.sendDebugTelemetry('scout_load_yt', {
        file_exists: false, file: YT_CHANNELS_FILE, count: 0,
      });
      return res.json({ ok: true, channels: [] });
    }
    const raw = fs.readFileSync(YT_CHANNELS_FILE, 'utf-8');
    const channels = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    res.json({ ok: true, channels });
  } catch (err) {
    if (shared.sendDebugTelemetry) shared.sendDebugTelemetry('scout_load_yt_error', {
      error: err.message, file: YT_CHANNELS_FILE,
    });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────
// Scout — Save YouTube channel list
// ──────────────────────────────────────────────

router.put('/scout/yt-channels', (req, res) => {
  try {
    const { channels } = req.body;
    if (!Array.isArray(channels)) return res.status(400).json({ ok: false, error: 'channels must be an array' });
    const clean = [...new Set(
      channels.map(c => {
        let s = String(c).trim();
        // Normalize: accept @handle, full URL, or channel name
        if (s.startsWith('@')) return s; // keep @handle as-is
        if (s.includes('youtube.com')) return s; // keep full URL as-is
        if (s.includes('youtu.be')) return s;
        // Bare name → @handle
        return '@' + s.replace(/^@/, '');
      }).filter(c => c.length > 1)
    )];
    const header = `# Scout YouTube channels — updated ${new Date().toISOString().split('T')[0]}\n# ${clean.length} channels\n\n`;
    fs.writeFileSync(YT_CHANNELS_FILE, header + clean.join('\n') + '\n');
    if (shared.sendDebugTelemetry) shared.sendDebugTelemetry('scout_save_yt', {
      saved_count: clean.length, file: YT_CHANNELS_FILE,
      write_verified: fs.existsSync(YT_CHANNELS_FILE),
    });
    res.json({ ok: true, count: clean.length, channels: clean });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────
// Scout — Trigger a new scout run
// ──────────────────────────────────────────────

let scoutRunState = { running: false, pid: null, startedAt: null, output: [], exitCode: null, error: null };

router.post('/scout/run', (req, res) => {
  if (scoutRunState.running) return res.status(409).json({ ok: false, error: 'A scout run is already in progress' });

  const mode = req.body.mode || 'full'; // "quick" or "full"
  const source = req.body.source || 'instagram'; // "instagram", "youtube", or "both"
  const contentMode = req.body.contentMode || 'all'; // "giveaway" or "all" (for IG)
  const postsCount = parseInt(req.body.posts) || 10;
  const postsPerAccount = mode === 'quick' ? 3 : postsCount;
  const batchSize = parseInt(req.body.batchSize) || 5;
  // Check user data dir first, then fall back to app bundle dir
  let scriptPath = path.join(shared.BASE_DIR, 'giveaway-scout-apify.cjs');
  if (!fs.existsSync(scriptPath)) scriptPath = path.join(shared.APP_DIR, 'giveaway-scout-apify.cjs');

  if (!fs.existsSync(scriptPath)) return res.status(404).json({ ok: false, error: 'Scout script not found' });
  // Check that at least one accounts file exists for the requested source
  const hasIG = fs.existsSync(ACCOUNTS_FILE);
  const hasYT = fs.existsSync(YT_CHANNELS_FILE);
  if (source === 'instagram' && !hasIG) return res.status(404).json({ ok: false, error: 'No IG accounts file. Add accounts first.' });
  if (source === 'youtube' && !hasYT) return res.status(404).json({ ok: false, error: 'No YouTube channels file. Add channels first.' });
  if (source === 'both' && !hasIG && !hasYT) return res.status(404).json({ ok: false, error: 'No accounts or channels files. Add some first.' });

  // For quick mode, find the latest -posts.json to merge with
  let mergeWithPath = null;
  if (mode === 'quick') {
    const dir = shared.RESULTS_DIR;
    if (fs.existsSync(dir)) {
      const postsFiles = fs.readdirSync(dir)
        .filter(f => f.startsWith('scout-') && f.endsWith('-posts.json'))
        .sort()
        .reverse();
      if (postsFiles.length > 0) mergeWithPath = path.join(dir, postsFiles[0]);
    }
    if (!mergeWithPath) {
      return res.status(400).json({ ok: false, error: 'Quick Scan requires at least one previous full run to merge with.' });
    }
  }

  scoutRunState = { running: true, pid: null, startedAt: new Date().toISOString(), output: [], exitCode: null, error: null };

  const args = [
    scriptPath,
    '--accounts-file', ACCOUNTS_FILE,
    '--posts', String(postsPerAccount),
    '--batch-size', String(batchSize),
    '--source', source,
    '--content-mode', contentMode,
  ];
  if (mergeWithPath) args.push('--merge-with', mergeWithPath);

  const child = spawn('node', args, { cwd: shared.BASE_DIR, env: { ...process.env }, windowsHide: true });

  scoutRunState.pid = child.pid;

  const appendOutput = (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    scoutRunState.output.push(...lines);
    if (scoutRunState.output.length > 100) scoutRunState.output = scoutRunState.output.slice(-100);
  };
  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);
  child.on('close', (code) => { scoutRunState.running = false; scoutRunState.exitCode = code; if (code !== 0) scoutRunState.error = `Process exited with code ${code}`; });
  child.on('error', (err) => { scoutRunState.running = false; scoutRunState.error = err.message; });

  res.json({ ok: true, pid: child.pid, message: 'Scout run started' });
});

// ──────────────────────────────────────────────
// Scout — Check run status
// ──────────────────────────────────────────────

router.get('/scout/run/status', (req, res) => {
  res.json({
    ok: true,
    running: scoutRunState.running,
    startedAt: scoutRunState.startedAt,
    output: scoutRunState.output.slice(-20),
    exitCode: scoutRunState.exitCode,
    error: scoutRunState.error,
  });
});

module.exports = router;
