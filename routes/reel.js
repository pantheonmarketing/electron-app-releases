const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const shared = require('../lib/shared');
const { readTasks, writeTasks, generateId } = require('../lib/helpers');
const router = express.Router();

// Sanitize IDs to prevent path traversal
router.param('id', (req, res, next, id) => {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  next();
});
router.param('projectId', (req, res, next, id) => {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid project ID' });
  next();
});

// ──────────────────────────────────────────────
// Reel Helper Functions
// ──────────────────────────────────────────────

function readReelProject(id) {
  const file = path.join(shared.REEL_PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (_) { return null; }
}

function writeReelProject(project) {
  project.updated_at = new Date().toISOString();
  const file = path.join(shared.REEL_PROJECTS_DIR, `${project.id}.json`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
  return project;
}

function listReelProjects() {
  if (!fs.existsSync(shared.REEL_PROJECTS_DIR)) return [];
  return fs.readdirSync(shared.REEL_PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(shared.REEL_PROJECTS_DIR, f), 'utf-8')); }
      catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function deleteReelProject(id) {
  const file = path.join(shared.REEL_PROJECTS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const uploadDir = path.join(shared.UPLOADS_DIR, id);
  if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
}

function readReelPreset(id) {
  const file = path.join(shared.REEL_PRESETS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (_) { return null; }
}

function writeReelPreset(preset) {
  const file = path.join(shared.REEL_PRESETS_DIR, `${preset.id}.json`);
  fs.writeFileSync(file, JSON.stringify(preset, null, 2));
  return preset;
}

function listReelPresets() {
  if (!fs.existsSync(shared.REEL_PRESETS_DIR)) return [];
  return fs.readdirSync(shared.REEL_PRESETS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(shared.REEL_PRESETS_DIR, f), 'utf-8')); }
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
router.get('/reel/projects', (req, res) => {
  const projects = listReelProjects().map(p => ({
    id: p.id, name: p.name, created_at: p.created_at, updated_at: p.updated_at,
    clip_count: (p.clips || []).length, scene_count: (p.scenes || []).length
  }));
  res.json(projects);
});

// Create project
router.post('/reel/projects', (req, res) => {
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
router.get('/reel/projects/:id', (req, res) => {
  const project = readReelProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// Update project
router.put('/reel/projects/:id', (req, res) => {
  let project = readReelProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  // Merge top-level fields
  const allowed = ['name', 'clips', 'scenes', 'music', 'style', 'output', 'mode', 'presentationMode'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) project[key] = req.body[key];
  }
  writeReelProject(project);
  res.json({ ok: true, project });
});

// Delete project
router.delete('/reel/projects/:id', (req, res) => {
  deleteReelProject(req.params.id);
  res.json({ ok: true });
});

// Upload files to project
router.post('/reel/projects/:projectId/upload', (req, res, next) => {
  shared.reelUpload.array('files', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
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
      else if (/\.(mp3|wav|aac|m4a|ogg)$/i.test(ext)) type = req.query.upload_as === 'clip' ? 'clip' : 'music';

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
});

// Extract audio from video using ffmpeg
router.post('/reel/projects/:projectId/extract-audio', express.json(), (req, res) => {
  const { clip_path } = req.body;
  if (!clip_path) return res.status(400).json({ error: 'clip_path required' });

  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const inputPath = path.resolve(path.join(shared.BASE_DIR, clip_path));
  // Prevent path traversal attacks
  if (!inputPath.startsWith(path.resolve(shared.BASE_DIR))) {
    return res.status(400).json({ error: 'Invalid clip path' });
  }
  if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'Source file not found' });

  const outputName = path.basename(clip_path, path.extname(clip_path)) + '-audio.aac';
  const outputDir = path.join(shared.UPLOADS_DIR, req.params.projectId);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, outputName);
  const relPath = `uploads/${req.params.projectId}/${outputName}`;

  try {
    execSync(`${shared.FFMPEG_BIN} -i "${inputPath}" -vn -acodec aac -b:a 192k -y "${outputPath}"`, {
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
router.post('/reel/projects/:projectId/whisper', (req, res) => {
  const { clip_id } = req.body;
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const clip = project.clips.find(c => c.id === clip_id);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });

  const filePath = path.join(shared.BASE_DIR, clip.path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Clip file missing' });

  // Check cache
  const hash = getFileHash(filePath);
  const cacheFile = path.join(shared.WHISPER_CACHE_DIR, `${hash}.json`);
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    clip.whisper = cached;
    writeReelProject(project);
    return res.json({ ok: true, status: 'cached', result: cached });
  }

  // Start whisper process
  const jobId = 'wh-' + Date.now();
  const outputDir = path.join(shared.WHISPER_CACHE_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  const args = [filePath, '--model', 'small', '--language', 'en',
    '--word_timestamps', 'True', '--output_format', 'json', '--output_dir', outputDir];

  const proc = spawn('whisper', args, { windowsHide: true, shell: true });
  shared.whisperJobs.set(jobId, { status: 'processing', clip_id, project_id: req.params.projectId, progress: 0, proc });

  // Catch spawn errors (e.g. whisper not installed)
  proc.on('error', (err) => {
    const job = shared.whisperJobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = err.code === 'ENOENT' ? 'Whisper is not installed. Run Setup to install it.' : err.message;
    }
  });

  let stderrBuf = '';
  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split('\n');
    for (const line of lines) {
      const match = line.match(/(\d+)%\|/);
      if (match) {
        const job = shared.whisperJobs.get(jobId);
        if (job) job.progress = parseInt(match[1]);
      }
    }
  });

  proc.on('close', (code) => {
    const job = shared.whisperJobs.get(jobId);
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

router.get('/reel/whisper-status/:jobId', (req, res) => {
  const job = shared.whisperJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const response = { status: job.status, progress: job.progress };
  if (job.status === 'done') response.result = job.result;
  if (job.status === 'error') response.error = job.error;
  res.json(response);
});

// Generate scenes from Whisper data
router.post('/reel/projects/:projectId/generate-scenes', (req, res) => {
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

  // Move trailing lone numbers (e.g. "2.", "3.") to the start of the next scene
  // Whisper often groups list numbers with the end of the previous sentence
  for (let i = 0; i < scenes.length - 1; i++) {
    const s = scenes[i];
    const words = s.words || [];
    if (words.length < 2) continue;
    const lastWord = words[words.length - 1];
    // Match standalone numbers like "1.", "2.", "10." etc at end of scene
    if (/^\d{1,3}\.$/.test((lastWord.word || '').trim())) {
      const moved = words.pop();
      s.text = words.map(w => w.word).join(' ');
      s.end = words[words.length - 1].end + 0.15;
      const next = scenes[i + 1];
      next.words = [moved, ...(next.words || [])];
      next.text = next.words.map(w => w.word).join(' ');
      next.start = moved.start;
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
router.post('/reel/projects/:projectId/generate-image', (req, res) => {
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
  const uploadsDir = path.join(shared.BASE_DIR, 'uploads', req.params.projectId);
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const outputPath = path.join(uploadsDir, filename);

  // Call SkillBoss image generation (execFileSync to prevent injection)
  const { execFileSync: execFileSyncLocal } = require('child_process');
  try {
    execFileSyncLocal('node', [apiHub, 'image', '--prompt', prompt, '--size', '1024*1024', '--output', outputPath], {
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
router.get('/reel/image-search', async (req, res) => {
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
router.post('/reel/projects/:projectId/download-image', async (req, res) => {
  const { url, filename } = req.body;
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());

    const dir = path.join(shared.UPLOADS_DIR, req.params.projectId);
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
router.get('/reel/presets', (req, res) => {
  let presets = listReelPresets();
  // Ensure default preset exists
  if (!presets.find(p => p.id === 'default-purple')) {
    const def = { id: 'default-purple', name: 'Purple Premium', description: 'Default dark purple theme', style: defaultReelStyle() };
    writeReelPreset(def);
    presets.unshift(def);
  }
  res.json(presets);
});

router.post('/reel/presets', (req, res) => {
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

router.delete('/reel/presets/:id', (req, res) => {
  if (req.params.id === 'default-purple') return res.status(400).json({ error: 'Cannot delete default preset' });
  const file = path.join(shared.REEL_PRESETS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

// Browse for folder (native dialog — cross-platform)
router.post('/reel/browse-folder', (req, res) => {
  if (shared.IS_WIN) {
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
    if (shared.IS_MAC) {
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
router.post('/reel/projects/:projectId/render', (req, res) => {
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
    const srcPath = path.join(shared.BASE_DIR, clip.path);
    if (!fs.existsSync(srcPath)) continue;
    const destName = clip.storedName || path.basename(clip.path);
    const destPath = path.join(configDir, destName);
    try { fs.copyFileSync(srcPath, destPath); } catch (_) {}
    mediaMap[clip.path] = destName;
  }
  // Also copy B-roll videos from scenes
  for (const scene of (project.scenes || [])) {
    for (const brollPath of (scene.broll || [])) {
      const srcPath = path.join(shared.BASE_DIR, brollPath);
      if (!fs.existsSync(srcPath)) continue;
      const destName = path.basename(brollPath);
      try { fs.copyFileSync(srcPath, path.join(configDir, destName)); } catch (_) {}
      mediaMap[brollPath] = destName;
    }
  }
  // Also copy music
  if (project.music && project.music.path) {
    const srcPath = path.join(shared.BASE_DIR, project.music.path);
    if (fs.existsSync(srcPath)) {
      const destName = path.basename(project.music.path);
      try { fs.copyFileSync(srcPath, path.join(configDir, destName)); } catch (_) {}
      mediaMap[project.music.path] = destName;
    }
  }
  // Also copy MFX background image
  if (project.style?.mfxBackground?.type === 'image' && project.style.mfxBackground.value) {
    const srcPath = path.join(shared.BASE_DIR, project.style.mfxBackground.value);
    if (fs.existsSync(srcPath)) {
      const destName = path.basename(project.style.mfxBackground.value);
      try { fs.copyFileSync(srcPath, path.join(configDir, destName)); } catch (_) {}
      mediaMap[project.style.mfxBackground.value] = destName;
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
    `  ${i+1}. "${s.text}" (${s.start?.toFixed(1)}s-${s.end?.toFixed(1)}s) [${s.display_mode || 'subtitles'}]${s.display_mode === 'mfx' && s.mfx_type && s.mfx_type !== 'words' ? ` [mfx_type: ${s.mfx_type}]` : ''}${s.display_mode === 'mfx' && s.mfx_has_bg ? ' [mfx_has_bg: true]' : ''}${s.zoom_effect && s.zoom_effect !== 'none' ? ` [zoom: ${s.zoom_effect}]` : ''}${s.images?.length > 1 ? ` [${s.images.length} images - slideshow]` : s.images?.length ? ' [has image]' : ''}${s.images?.length && (s.img_span || 1) > 1 ? ` [img_span: ${s.img_span} scenes]` : ''}${s.images?.length && s.img_position && s.img_position !== 'top' ? ` [img_position: ${s.img_position}]` : ''}${s.images?.length && s.img_border && s.img_border !== 'none' ? ` [img_border: ${s.img_border}]` : ''}${s.broll?.length ? ` [has B-roll video${s.broll_span > 1 ? `, spans ${s.broll_span} scenes` : ''}${s.broll_muted === false ? ', audio ON' : ', muted'}]` : ''}${s.display_mode === 'mfx' && s.mfx_preset && s.mfx_preset !== 'none' ? ` [mfx: ${s.mfx_preset}]` : ''}${s.display_mode === 'mfx' && s.mfx_instructions ? ` [instructions: ${s.mfx_instructions}]` : ''}`
  ).join('\n');

  // Presentation mode + MFX background
  const presentationMode = project.presentationMode || false;
  const mfxBg = project.style?.mfxBackground || { type: 'video' };

  const prompt = `Build and render a Remotion FB Story video from the config file.

CONFIG FILE: public/reel-data/config.json (read this file for full scene data, whisper words, and settings)
MEDIA FILES: public/reel-data/ (video clips, images, music are copied here)
MEDIA MAP: public/reel-data/media-map.json (maps original paths to filenames in reel-data/)
${presentationMode ? `
PRESENTATION MODE: ON — This is a presentation/explainer video.
All scenes use motion graphics. Text IS the primary visual.
Each scene should have dynamic kinetic typography with engaging animations.
${mfxBg.type === 'video' ? `MFX BACKGROUND: video — The uploaded video clip plays FULL-SCREEN as the background layer behind all motion graphics text.
- Render the video with <OffthreadVideo> filling the entire frame (100% width, 100% height, objectFit cover).
- Then overlay all text animations, kinetic typography, and motion graphics ON TOP of the video.
- The video is a visual backdrop — the animated text is still the primary content the viewer reads.
- Do NOT hide or skip the video. It must be visible behind the text at all times.` : `No talking head — the text and animations tell the story.`}
` : ''}${mfxBg.type !== 'video' ? `
MFX BACKGROUND: ${mfxBg.type} ${mfxBg.type === 'color' ? mfxBg.value : (mfxBg.type === 'image' ? path.basename(mfxBg.value || '') : '')}
- ${mfxBg.type === 'color' ? `Use <AbsoluteFill style={{background: '${mfxBg.value}'}}> as the background behind all text/motion graphics (instead of video).` : ''}
- ${mfxBg.type === 'image' ? `Use <Img src={staticFile('reel-data/${path.basename(mfxBg.value || '')}')} style={{width:'100%',height:'100%',objectFit:'cover'}} /> as the background behind all text/motion graphics (instead of video).` : ''}
` : ''}
SUMMARY (${sceneCount} scenes):
${sceneSummary}

STYLE:
- Colors: primary=${colors.primary}, secondary=${colors.secondary}, text=${colors.text}, bg=${colors.background}
- Heading: ${style.font?.family || 'Playfair Display'} ${style.font?.size || 48}px weight ${style.font?.weight || 700}
- Subtitle: ${sub.family || 'Inter'} ${sub.size || 32}px, position=${sub.position || 'bottom'}, shadow=${sub.shadow !== false}, maxWords=${sub.maxWords || 6}
- Subtitle animation preset: ${style.subtitleAnimation?.preset || 'classic'}${style.subtitleAnimation?.preset === 'plain' ? ' — PLAIN STYLE: standard TV/movie subtitles. Group words into chunks (max ${sub.maxWords||6} words). The ENTIRE chunk appears together at once — no word-by-word timing at all. Show the chunk for its full duration (first word start → last word end), then swap to the next chunk instantly. Simple fade-in (opacity 0→1 over 3-4 frames) on the whole group. No per-word animation whatsoever.' : style.subtitleAnimation?.preset === 'snap' ? ' — SNAP STYLE: words must appear INSTANTLY with zero transition/fade. Each word goes from opacity 0 to opacity 1 in a single frame (use steps(1) or instant opacity toggle). No easing, no movement, no blur. Pure hard cut.' : ''}
- Highlight word: ${style.subtitleAnimation?.highlightEnabled === false ? 'DISABLED — do NOT highlight the active/current word. All words must be identical in size, color, and style.' : `ENABLED — highlight the currently-speaking word in color ${style.subtitleAnimation?.highlightColor || colors.primary || '#7B2FF2'}. CRITICAL: the highlighted word must be EXACTLY the same font-size as all other words — do NOT scale it, do NOT make it larger or smaller. Only change the color (and optionally font-weight to bold). Never use fontSize, transform, or scale on the highlighted word span.`}
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
- MFX (Motion Graphics): Create premium motion graphics for this scene. You have FULL creative freedom to build rich visual compositions — not just text. Think like a professional motion graphics designer.
  PREMIUM VISUAL ELEMENTS you can and should create (especially when mfx_has_bg is true):
  - Animated SVG icons or shapes inline in JSX (circles, hexagons, lines, arrows, custom paths) with glowing borders, pulsing rings, fill animations
  - Icon badge rows: glowing circular containers with SVG icons inside, staggered fade/scale animations (like a feature list or step sequence)
  - Stat cards: bold number + label in a glass-morphism card with subtle border glow
  - Step indicators: numbered circles connected by animated lines
  - Geometric accent elements: corner decorations, animated underlines, light streaks, scan lines
  - Particle fields, floating orbs, grid overlays, radial light bursts as background texture
  - Lower-third bars: colored pill/rectangle sliding in with text
  - ALL elements must be built with pure React inline styles + SVG — no external icon libraries. Draw icons as SVG paths directly.
  If custom instructions are provided, follow them precisely. If a preset is set, use that style. If neither, use the scene text as a guide to what kind of graphic would make sense (e.g. "6 steps" → animated icon row of 6 items, "results" → stat cards, "how it works" → numbered steps with connecting line).
  CRITICAL MFX LAYOUT RULE: Words MUST flow horizontally left-to-right and wrap naturally like a sentence. ALWAYS use display:flex, flexWrap:wrap, justifyContent:center, gap:'0 12px', rowGap:'10px' on the word container. Each word span must be display:inline-block. NEVER use flexDirection:column, NEVER put each word in its own block-level div — this causes ugly vertical stacking with one word per line.
  MFX TYPE — each MFX scene may have a mfx_type field:
  - "words" (default): Animated kinetic text only — words animate in over the video background.
  - "words_fx": Animated text PLUS rich visual elements (icons, shapes, particles, geometric accents) layered with the text. Both text and visuals must be prominent and in sync.
  - "fx_only": Full visual composition — NO spoken text rendered. Create a visually stunning scene using icons, shapes, particles, stats, step diagrams, or abstract motion. This is a pure visual moment.
  MFX BACKGROUND — if a scene has mfx_has_bg: true:
  - The background must be a SOLID OPAQUE layer that COMPLETELY COVERS the video. The viewer should see ZERO video behind it.
  - NEVER use rgba() with alpha < 1. NEVER use opacity < 1 on the background. The background must be fully opaque solid color or gradient.
  - WRONG: style={{background: 'rgba(6,14,20,0.8)'}} or style={{opacity: 0.85}}
  - RIGHT: style={{background: 'radial-gradient(ellipse at center, #0d2535 0%, #060e14 100%)'}}
  - CRITICAL ARCHITECTURE FOR SEAMLESS BACK-TO-BACK SCENES: Do NOT put the background inside each scene's individual Sequence. Instead, find groups of consecutive scenes that ALL have mfx_has_bg:true, and render ONE single background Sequence that spans the entire group (from the first scene's startFrame to the last scene's endFrame). Then render each scene's text/effects content in their own individual Sequences on top. This way the background is ONE continuous unbroken layer — it never stops and restarts between scenes, so there is zero flash of the video between consecutive MFX+BG scenes.
  Example structure for 3 consecutive mfx_has_bg scenes (scenes 5,6,7):
    {/* One background covering all three */}
    <Sequence from={scene5start} durationInFrames={scene5dur + scene6dur + scene7dur}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, #0d2535 0%, #060e14 100%)'}} />
    </Sequence>
    {/* Each scene's content in its own Sequence on top */}
    <Sequence from={scene5start} durationInFrames={scene5dur}><Scene5Content /></Sequence>
    <Sequence from={scene6start} durationInFrames={scene6dur}><Scene6Content /></Sequence>
    <Sequence from={scene7start} durationInFrames={scene7dur}><Scene7Content /></Sequence>
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
- B-ROLL: If a scene has a broll array (scenes[i].broll), use the B-roll video INSTEAD of the main video for that scene's duration. Use <OffthreadVideo> with the B-roll file from reel-data/. If broll_muted is true (default), mute the B-roll video. If broll_muted is false, include the B-roll audio.
- ZOOM EFFECTS: If a scene has a zoom field, apply it to the video/background layer using a CSS transform on the video container:
  - "snap-in": Scale snaps from 1.4 → 1.0 in the first 8 frames using spring({damping:12, stiffness:500, mass:0.5}). It's a hard punch-in that quickly settles. Apply as: transform: \`scale(\${1.4 - 0.4 * snapProgress})\`
  - "snap-out": Scale snaps from 1.0 → 1.4 in the first 8 frames — punches away from the subject. spring({damping:12, stiffness:500, mass:0.5}) going from 0→1 mapped to scale 1.0→1.4
  - "slow-in": Slow cinematic drift — scale goes from 1.0 to 1.08 linearly over the full scene duration using interpolate(frame-sceneStartFrame, [0, durationInFrames], [1, 1.08])
  Apply the zoom transform to the outermost video wrapper div (not the subtitle layer). Use transformOrigin: 'center center' and overflow: 'hidden' on the parent.
- B-ROLL SPANNING: If a scene has broll_span > 1, continue using this B-roll for the next N scenes (e.g. broll_span=3 means this scene + next 2). Seek the B-roll video to the accumulated time offset for each subsequent scene so it plays continuously across all spanned scenes.
- IMAGE SPANNING: If a scene has img_span > 1, keep showing that scene's image(s) for the next N scenes (e.g. img_span=3 means this scene + next 2). Wrap the image in a single <Sequence> that covers the full spanned duration, not just the scene it belongs to. The spanned scenes do NOT need their own image — they inherit it.

INSTRUCTIONS:
1. Read public/reel-data/config.json for the full project data (scenes with word-level timestamps)
2. Read public/reel-data/media-map.json to know which media files are available
3. ALWAYS write the Remotion component completely from scratch on every render — never patch or reuse any existing TSX/TSX file. Delete any existing src/MyVideo.tsx or src/Video.tsx before writing. The config.json is the single source of truth.
4. For 'subtitles' scenes: word-synced subtitles from scenes[].words, positioned at bottom over video. Show max ${sub.maxWords || 6} words at a time (group words into chunks of ${sub.maxWords || 6}).
5. For 'mfx' scenes: animated text presentation of the scene's words (follow any instructions/preset if provided)
6. For 'none' scenes: NO text at all — just video and image (if any). Skip all subtitles and motion graphics for that scene.
7. For scenes with images: apply per-scene img_position and img_border CSS (see above). Use object-fit: ${video.imageFit || 'contain'}.
8. For scenes with B-roll: use the B-roll video for that scene instead of the main video clip
9. CRITICAL: Only show an image during its scene's time range. Never persist a previous scene's image.
10. Apply spring(${JSON.stringify({damping: anim.damping || 18, stiffness: anim.stiffness || 120, mass: anim.mass || 0.7})}) animations
11. Add background music with <Audio> at volume ${project.music?.volume || 0.12}
12. Render: npx remotion render src/index.ts MainComp out/${(project.name || 'reel').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'reel'}.mp4 --codec h264 --crf ${project.output.crf || 18} --concurrency=4 --hardware-acceleration=if-possible`;

  const tasks = readTasks();
  const id = generateId(tasks);
  const newTask = {
    id,
    task: prompt,
    skill: 'fb-story-video',
    status: 'pending',
    priority: 1,
    model: 'sonnet',
    max_turns: 80,
    context: [],
    extra_context: [],
    working_dir: working_dir || null,
    space_id: space_id || 'general',
    timeout_mins: 60,  // video renders need more time than default 30
    worker: null, started_at: null, completed_at: null, result_file: null, error: null, archived: false
  };
  tasks.push(newTask);
  writeTasks(tasks);

  res.json({ ok: true, task_id: id, config_path: configPath });
});

// Preview in Remotion Studio — writes config + media, spawns studio
router.post('/reel/projects/:projectId/preview-studio', (req, res) => {
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { working_dir } = req.body;
  if (!working_dir) return res.status(400).json({ error: 'No working_dir provided' });

  // 1. Write config file to the Remotion project's public/ directory
  const configDir = path.join(working_dir, 'public', 'reel-data');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(project, null, 2));

  // 2. Copy media files (video clips, images, music) to Remotion public/reel-data/
  const mediaMap = {};
  for (const clip of (project.clips || [])) {
    if (!clip.path) continue;
    const srcPath = path.join(shared.BASE_DIR, clip.path);
    if (!fs.existsSync(srcPath)) continue;
    const destName = clip.storedName || path.basename(clip.path);
    const destPath = path.join(configDir, destName);
    try { fs.copyFileSync(srcPath, destPath); } catch (_) {}
    mediaMap[clip.path] = destName;
  }
  for (const scene of (project.scenes || [])) {
    // Copy scene images
    for (const imgPath of (scene.images || [])) {
      const srcPath = path.join(shared.BASE_DIR, imgPath);
      if (!fs.existsSync(srcPath)) continue;
      const destName = path.basename(imgPath);
      try { fs.copyFileSync(srcPath, path.join(configDir, destName)); } catch (_) {}
      mediaMap[imgPath] = destName;
    }
    // Copy B-roll videos
    for (const brollPath of (scene.broll || [])) {
      const srcPath = path.join(shared.BASE_DIR, brollPath);
      if (!fs.existsSync(srcPath)) continue;
      const destName = path.basename(brollPath);
      try { fs.copyFileSync(srcPath, path.join(configDir, destName)); } catch (_) {}
      mediaMap[brollPath] = destName;
    }
  }
  if (project.music && project.music.path) {
    const srcPath = path.join(shared.BASE_DIR, project.music.path);
    if (fs.existsSync(srcPath)) {
      const destName = path.basename(project.music.path);
      try { fs.copyFileSync(srcPath, path.join(configDir, destName)); } catch (_) {}
      mediaMap[project.music.path] = destName;
    }
  }
  fs.writeFileSync(path.join(configDir, 'media-map.json'), JSON.stringify(mediaMap, null, 2));

  // 3. Kill any existing Remotion Studio, then spawn fresh
  try {
    const { execSync } = require('child_process');
    // Kill any node process running remotion studio on port 3000
    if (process.platform === 'win32') {
      // Find PID using port 3000 and kill it
      try {
        const netstat = execSync('netstat -ano | findstr :3000 | findstr LISTENING', { encoding: 'utf8', timeout: 3000 });
        const pids = [...new Set(netstat.trim().split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
        for (const pid of pids) {
          try { execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 }); } catch (_) {}
        }
      } catch (_) { /* no process on port 3000 */ }
    } else {
      try { execSync("lsof -ti:3000 | xargs kill -9", { timeout: 3000 }); } catch (_) {}
    }
  } catch (_) { /* ignore kill errors */ }

  // Small delay to let port release
  setTimeout(() => {
    const child = spawn('npx', ['remotion', 'studio', 'src/index.ts'], {
      cwd: working_dir,
      detached: true,
      stdio: 'ignore',
      shell: true
    });
    child.unref();
    console.log(`[ReelMaster] Remotion Studio launched for project ${project.id} in ${working_dir}`);
  }, 500);

  res.json({ ok: true, message: 'Remotion Studio launching on localhost:3000', config_path: configPath });
});

// ── One-click Remotion project setup ──
router.post('/reel/setup-remotion', async (req, res) => {
  const remotionDir = path.join(shared.BASE_DIR, 'remotion-project');
  const srcDir = path.join(remotionDir, 'src');
  const publicDir = path.join(remotionDir, 'public');

  // If already set up, just return the path
  if (fs.existsSync(path.join(remotionDir, 'package.json')) && fs.existsSync(path.join(srcDir, 'index.ts'))) {
    return res.json({ ok: true, path: remotionDir, message: 'Remotion project already set up' });
  }

  try {
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

    // package.json
    fs.writeFileSync(path.join(remotionDir, 'package.json'), JSON.stringify({
      name: "aiceo-remotion",
      version: "1.0.0",
      scripts: {
        studio: "remotion studio src/index.ts",
        render: "remotion render src/index.ts MainComp out/video.mp4"
      },
      dependencies: {
        "@remotion/cli": "^4.0.0",
        "@remotion/player": "^4.0.0",
        "remotion": "^4.0.0",
        "react": "^18.0.0",
        "react-dom": "^18.0.0"
      },
      devDependencies: {
        "typescript": "^5.0.0",
        "@types/react": "^18.0.0"
      }
    }, null, 2));

    // tsconfig.json
    fs.writeFileSync(path.join(remotionDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: "ES2018",
        module: "commonjs",
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      },
      include: ["src/**/*"]
    }, null, 2));

    // src/index.ts — Composition entry point
    fs.writeFileSync(path.join(srcDir, 'index.ts'), `import {registerRoot} from 'remotion';
import {RemotionRoot} from './Root';

registerRoot(RemotionRoot);
`);

    // src/Root.tsx — Root component with composition
    fs.writeFileSync(path.join(srcDir, 'Root.tsx'), `import React from 'react';
import {Composition} from 'remotion';
import {MainComp} from './MainComp';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComp"
        component={MainComp}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
`);

    // src/MainComp.tsx — Main component that reads config
    fs.writeFileSync(path.join(srcDir, 'MainComp.tsx'), `import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';

export const MainComp: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sec = (frame / fps).toFixed(1);

  return (
    <AbsoluteFill style={{
      backgroundColor: '#0a0a14',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        fontSize: 48,
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #7B2FF2, #C084FC)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textAlign: 'center',
      }}>
        AI CEO Remotion
      </div>
      <div style={{color: '#888', fontSize: 24, marginTop: 20}}>
        Frame {frame} | {sec}s
      </div>
      <div style={{color: '#555', fontSize: 16, marginTop: 40, maxWidth: 600, textAlign: 'center', lineHeight: 1.6}}>
        This is the starter template. When you render from Reel Master,
        it will generate the full video components here automatically.
      </div>
    </AbsoluteFill>
  );
};
`);

    // Install dependencies
    console.log('[ReelMaster] Installing Remotion dependencies...');
    const { execSync } = require('child_process');
    execSync('npm install', {
      cwd: remotionDir,
      shell: true,
      timeout: 3 * 60 * 1000,
      windowsHide: true,
      stdio: 'pipe'
    });

    console.log('[ReelMaster] Remotion project set up at:', remotionDir);
    res.json({ ok: true, path: remotionDir, message: 'Remotion project created and dependencies installed' });
  } catch (err) {
    console.error('[ReelMaster] Remotion setup failed:', err.message);
    res.status(500).json({ ok: false, error: 'Setup failed: ' + err.message });
  }
});

// ── AI Chat Editor ──────────────────────────────────────────────────────────

function callClaudeChat(promptText) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const proc = spawn('claude', ['-p', '--output-format', 'text', '--dangerously-skip-permissions'], {
      shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', () => out.trim() ? resolve(out.trim()) : reject(new Error(err || 'No output')));
    proc.on('error', reject);
    proc.stdin.write(promptText);
    proc.stdin.end();
    setTimeout(() => { try { proc.kill(); } catch(_) {} reject(new Error('timeout')); }, 90000);
  });
}

router.post('/reel/projects/:projectId/chat', async (req, res) => {
  const project = readReelProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { message, history = [], imageBase64, imageMime, imageFilename } = req.body;
  if (!message && !imageBase64) return res.status(400).json({ error: 'message or image required' });

  // Save attached image to uploads dir if provided
  let savedImagePath = null;
  if (imageBase64) {
    try {
      const ext = (imageMime || 'image/jpeg').split('/')[1]?.replace('jpeg','jpg') || 'jpg';
      const uploadDir = path.join(shared.UPLOADS_DIR, req.params.projectId);
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const fname = `chat-${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(uploadDir, fname), Buffer.from(imageBase64, 'base64'));
      savedImagePath = `uploads/${req.params.projectId}/${fname}`;
    } catch (e) {
      console.error('[ReelChat] image save error:', e.message);
    }
  }

  const style = project.style || {};
  const sceneSummary = (project.scenes || []).map((s, i) =>
    `  Scene ${i+1} (idx ${i}): "${s.text?.substring(0,70)}${(s.text||'').length>70?'...':''}" [${s.display_mode||'subtitles'}]${s.mfx_type&&s.mfx_type!=='words'?` [mfx_type:${s.mfx_type}]`:''}${s.mfx_instructions?` [instructions:"${s.mfx_instructions.substring(0,40)}"]`:''}${s.mfx_has_bg?' [has_bg]':''}${s.images?.length?` [${s.images.length} image(s)${s.img_span>1?`, span:${s.img_span}`:''}]`:''}${s.broll?.length?' [broll]':''}${s.text_overlay?` [overlay:"${s.text_overlay}"]`:''}`
  ).join('\n');

  const historyText = history.slice(-8).map(h => `${h.role==='user'?'User':'Assistant'}: ${h.content}`).join('\n');

  const imageContext = savedImagePath
    ? `\nUSER ATTACHED IMAGE: ${savedImagePath} — You can add this image to any scene using the scene_add_image operation. Acknowledge the image was received.\n`
    : '';

  const prompt = `You are an AI video editor assistant for AI CEO Studio Reel Master. Users edit short-form video reels (TikTok/IG/YouTube style).

CURRENT PROJECT: "${project.name || 'Untitled'}"
Mode: ${project.mode||'full'} | Subtitle preset: ${style.subtitleAnimation?.preset||'classic'} | Primary color: ${style.colors?.primary||'#7B2FF2'} | Secondary: ${style.colors?.secondary||'#C084FC'}
Music: ${project.music?project.music.filename+' @ vol '+project.music.volume:'none'} | Presentation mode: ${project.presentationMode||false}
Scenes (${(project.scenes||[]).length} total):
${sceneSummary||'  No scenes yet'}

${imageContext}${historyText?`CONVERSATION HISTORY:\n${historyText}\n`:''}
User: ${message || '(attached an image)'}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "reply": "Brief friendly message explaining what you changed or answering the question",
  "operations": [
    // Available operations (use idx=0 for scene 1, idx=1 for scene 2, etc.):
    // { "op": "scene_add_image", "idx": N, "value": "uploads/..." }  — add image to scene (use path from USER ATTACHED IMAGE)
    // { "op": "scene_mode", "idx": N, "value": "subtitles"|"mfx"|"none" }
    // { "op": "scene_mfx_type", "idx": N, "value": "words"|"words_fx"|"fx_only" }
    // { "op": "scene_mfx_instructions", "idx": N, "value": "string" }
    // { "op": "scene_mfx_has_bg", "idx": N, "value": true|false }
    // { "op": "scene_mfx_preset", "idx": N, "value": "none"|"geometric-lines"|"corners"|"lower-third"|"particles"|"spotlight"|"bokeh"|"progress" }
    // { "op": "scene_text", "idx": N, "value": "string" }
    // { "op": "scene_text_overlay", "idx": N, "value": "string" }
    // { "op": "scene_img_position", "idx": N, "value": "top"|"center"|"bottom"|"full" }
    // { "op": "scene_img_border", "idx": N, "value": "none"|"rounded"|"shadow"|"frame"|"glow" }
    // { "op": "scene_img_span", "idx": N, "value": number }
    // { "op": "subtitle_preset", "value": "snap"|"classic"|"karaoke"|"wordpop"|"typewriter"|"glowsweep"|"bouncein"|"scaleburst"|"fadeflow"|"slidein"|"neonpulse"|"wave"|"cinematic"|"riseglow" }
    // { "op": "highlight_color", "value": "#hexcolor" }
    // { "op": "highlight_enabled", "value": true|false }
    // { "op": "primary_color", "value": "#hexcolor" }
    // { "op": "secondary_color", "value": "#hexcolor" }
    // { "op": "text_color", "value": "#hexcolor" }
    // { "op": "music_volume", "value": 0.0-1.0 }
    // { "op": "mode", "value": "full"|"split"|"youtube" }
    // { "op": "presentation_mode", "value": true|false }
    // If no changes needed, return empty array []
  ]
}`;

  try {
    const raw = await callClaudeChat(prompt);
    const clean = raw.replace(/^```json?\n?/,'').replace(/\n?```$/,'').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { parsed = { reply: raw, operations: [] }; }

    const ops = parsed.operations || [];
    for (const op of ops) {
      const scene = project.scenes?.[op.idx];
      switch (op.op) {
        case 'scene_add_image':
          if (scene) {
            if (!scene.images) scene.images = [];
            scene.images.push(op.value);
          }
          break;
        case 'scene_mode':            if (scene) scene.display_mode = op.value; break;
        case 'scene_mfx_type':        if (scene) scene.mfx_type = op.value; break;
        case 'scene_mfx_instructions':if (scene) scene.mfx_instructions = op.value; break;
        case 'scene_mfx_has_bg':      if (scene) scene.mfx_has_bg = op.value; break;
        case 'scene_mfx_preset':      if (scene) scene.mfx_preset = op.value; break;
        case 'scene_text':            if (scene) scene.text = op.value; break;
        case 'scene_text_overlay':    if (scene) scene.text_overlay = op.value; break;
        case 'scene_img_position':    if (scene) scene.img_position = op.value; break;
        case 'scene_img_border':      if (scene) scene.img_border = op.value; break;
        case 'scene_img_span':        if (scene) scene.img_span = op.value; break;
        case 'subtitle_preset':
          if (!style.subtitleAnimation) style.subtitleAnimation = {};
          style.subtitleAnimation.preset = op.value;
          project.style = style; break;
        case 'highlight_color':
          if (!style.subtitleAnimation) style.subtitleAnimation = {};
          style.subtitleAnimation.highlightColor = op.value;
          project.style = style; break;
        case 'highlight_enabled':
          if (!style.subtitleAnimation) style.subtitleAnimation = {};
          style.subtitleAnimation.highlightEnabled = op.value;
          project.style = style; break;
        case 'primary_color':
          if (!style.colors) style.colors = {};
          style.colors.primary = op.value; project.style = style; break;
        case 'secondary_color':
          if (!style.colors) style.colors = {};
          style.colors.secondary = op.value; project.style = style; break;
        case 'text_color':
          if (!style.colors) style.colors = {};
          style.colors.text = op.value; project.style = style; break;
        case 'music_volume':  if (project.music) project.music.volume = op.value; break;
        case 'mode':          project.mode = op.value; break;
        case 'presentation_mode': project.presentationMode = op.value; break;
      }
    }
    if (ops.length) writeReelProject(project);

    res.json({ ok: true, reply: parsed.reply || 'Done.', operations: ops, project });
  } catch (e) {
    console.error('[ReelChat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
