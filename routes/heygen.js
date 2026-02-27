const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const shared = require('../lib/shared');
const { readTasks, writeTasks, generateId } = require('../lib/helpers');
const router = express.Router();

// ──────────────────────────────────────────────
// HeyGen Helpers
// ──────────────────────────────────────────────

function readHeyGenConfig() {
  try { return JSON.parse(fs.readFileSync(shared.HEYGEN_CONFIG_FILE, 'utf-8')); } catch { return {}; }
}
function writeHeyGenConfig(data) { fs.writeFileSync(shared.HEYGEN_CONFIG_FILE, JSON.stringify(data, null, 2)); }

function listHeyGenProjects() {
  if (!fs.existsSync(shared.HEYGEN_PROJECTS_DIR)) return [];
  const files = fs.readdirSync(shared.HEYGEN_PROJECTS_DIR).filter(f => f.endsWith('.json') && !f.includes('-result'));
  return files.map(f => {
    try {
      const proj = JSON.parse(fs.readFileSync(path.join(shared.HEYGEN_PROJECTS_DIR, f), 'utf-8'));
      // Merge result file if it exists and project isn't already completed
      if (proj.id && proj.status !== 'completed') {
        const resultPath = path.join(shared.HEYGEN_PROJECTS_DIR, proj.id + '-result.json');
        if (fs.existsSync(resultPath)) {
          try {
            const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
            if (result.status === 'completed' && result.videoUrl) {
              proj.status = 'completed';
              proj.videoUrl = result.videoUrl;
              proj.updatedAt = new Date().toISOString();
              // Persist the merge so we don't re-read every time
              fs.writeFileSync(path.join(shared.HEYGEN_PROJECTS_DIR, f), JSON.stringify(proj, null, 2));
            }
          } catch {}
        }
      }
      return proj;
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
}
function readHeyGenProject(id) {
  const p = path.join(shared.HEYGEN_PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function writeHeyGenProject(id, data) {
  fs.writeFileSync(path.join(shared.HEYGEN_PROJECTS_DIR, `${id}.json`), JSON.stringify(data, null, 2));
}
function deleteHeyGenProjectFile(id) {
  const p = path.join(shared.HEYGEN_PROJECTS_DIR, `${id}.json`);
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

// Local copy of defaultReelStyle (also used in reel module)
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

// Local copy of writeReelProject (also used in reel module)
function writeReelProject(project) {
  project.updated_at = new Date().toISOString();
  const file = path.join(shared.REEL_PROJECTS_DIR, `${project.id}.json`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
  return project;
}

// ──────────────────────────────────────────────
// HeyGen API Routes
// ──────────────────────────────────────────────

// Settings
router.get('/heygen/settings', (req, res) => {
  const cfg = readHeyGenConfig();
  res.json({
    hasKey: !!cfg.apiKey,
    keyPreview: cfg.apiKey ? '••••' + cfg.apiKey.slice(-4) : null,
    loginEmail: cfg.loginEmail || '',
    hasPassword: !!cfg.loginPassword
  });
});

router.get('/heygen/credits', async (req, res) => {
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

router.put('/heygen/settings', (req, res) => {
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
router.get('/heygen/avatars', async (req, res) => {
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
router.get('/heygen/voices', async (req, res) => {
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
router.post('/heygen/generate', async (req, res) => {
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
router.get('/heygen/status/:videoId', async (req, res) => {
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
router.get('/heygen/projects', (req, res) => {
  res.json({ projects: listHeyGenProjects() });
});

router.post('/heygen/projects', (req, res) => {
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

router.put('/heygen/projects/:id', (req, res) => {
  const proj = readHeyGenProject(req.params.id);
  if (!proj) return res.status(404).json({ error: 'Project not found' });
  Object.assign(proj, req.body, { updatedAt: new Date().toISOString() });
  writeHeyGenProject(req.params.id, proj);
  res.json({ ok: true, project: proj });
});

router.delete('/heygen/projects/:id', (req, res) => {
  deleteHeyGenProjectFile(req.params.id);
  res.json({ ok: true });
});

// Browser-based generation (free — uses Creator plan via browser automation)
router.post('/heygen/generate-browser', (req, res) => {
  const { projectId } = req.body;
  const proj = readHeyGenProject(projectId);
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  const resultPath = path.join(shared.HEYGEN_PROJECTS_DIR, projectId + '-result.json');
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
    working_dir: shared.BASE_DIR,
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
  const workerScript = path.join(shared.APP_DIR, 'worker.js');

  if (shared.launchWorkerProcess(workerScript, workerId, newId, cleanEnv)) {
    shared.activeWorkers.set(workerId, { startedAt: new Date().toISOString(), taskId: newId });
    console.log(`[Server] Launched HeyGen browser worker for task #${newId} (project ${projectId})`);
    res.json({ ok: true, taskId: newId, projectId });
  } else {
    console.error(`[Server] Failed to launch HeyGen browser worker`);
    res.status(500).json({ ok: false, error: 'Failed to launch browser worker' });
  }
});

router.get('/heygen/browser-result/:projectId', (req, res) => {
  const resultPath = path.join(shared.HEYGEN_PROJECTS_DIR, req.params.projectId + '-result.json');
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
router.post('/heygen/load-to-reels', async (req, res) => {
  const { projectId } = req.body;
  const proj = readHeyGenProject(projectId);
  if (!proj) return res.status(404).json({ error: 'HeyGen project not found' });

  // Get video URL from project or result file
  let videoUrl = proj.videoUrl;
  if (!videoUrl) {
    const resultPath = path.join(shared.HEYGEN_PROJECTS_DIR, projectId + '-result.json');
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
    const dir = path.join(shared.UPLOADS_DIR, reelId);
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
router.post('/heygen/open-in-folder', async (req, res) => {
  const { projectId } = req.body;
  const proj = readHeyGenProject(projectId);
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  let videoUrl = proj.videoUrl;
  if (!videoUrl) {
    const resultPath = path.join(shared.HEYGEN_PROJECTS_DIR, projectId + '-result.json');
    if (fs.existsSync(resultPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        if (result.videoUrl) videoUrl = result.videoUrl;
      } catch {}
    }
  }
  if (!videoUrl) return res.status(400).json({ error: 'No video URL found' });

  try {
    const dir = path.join(shared.HEYGEN_PROJECTS_DIR, 'downloads');
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
    shared.openInFolder(filePath);

    res.json({ ok: true, path: filePath });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
