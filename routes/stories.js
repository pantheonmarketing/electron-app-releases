const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const shared = require('../lib/shared');
const router = express.Router();

// ──────────────────────────────────────────────
// Story Helper Functions
// ──────────────────────────────────────────────

function readStoryProject(id) {
  const file = path.join(shared.STORY_PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (_) { return null; }
}

function writeStoryProject(project) {
  project.updated_at = new Date().toISOString();
  const file = path.join(shared.STORY_PROJECTS_DIR, `${project.id}.json`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
  return project;
}

function listStoryProjects() {
  if (!fs.existsSync(shared.STORY_PROJECTS_DIR)) return [];
  return fs.readdirSync(shared.STORY_PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(shared.STORY_PROJECTS_DIR, f), 'utf-8')); }
      catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function deleteStoryProject(id) {
  const file = path.join(shared.STORY_PROJECTS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const uploadDir = path.join(shared.UPLOADS_DIR, id);
  if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
}

function listStoryPresets() {
  if (!fs.existsSync(shared.STORY_PRESETS_DIR)) return [];
  return fs.readdirSync(shared.STORY_PRESETS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(shared.STORY_PRESETS_DIR, f), 'utf-8')); }
      catch (_) { return null; }
    })
    .filter(Boolean);
}

function defaultStoryStyle() {
  return {
    preset_id: 'default-purple',
    colors: {
      background: '#0a0a12',
      primary: '#7B2FF2',
      secondary: '#C084FC',
      tertiary: '#E9D5FF',
      text: '#ffffff'
    },
    fonts: {
      headline: 'Playfair Display',
      body: 'Inter'
    },
    decorations: {
      topLine: true,
      slideIndicator: true,
      cornerCircles: true,
      backgroundGlow: true
    },
    photo: {
      position: 'bottom-center',
      glow: true,
      removeBg: true
    }
  };
}

function defaultSlides() {
  return [
    {
      type: 'hook',
      eyebrow: 'STOP SCROLLING',
      headline: 'I Made $4,200 Last Month',
      subtext: 'Using Only AI Tools',
      emphasis: ''
    },
    {
      type: 'pain',
      headline: 'Sound Familiar?',
      pains: [
        'Spending hours creating content manually',
        'Getting zero engagement on your posts',
        'Watching competitors grow while you\'re stuck'
      ]
    },
    {
      type: 'shift',
      headline: "Here's What Changed",
      actions: [
        'Trained an AI to write in my voice',
        'Automated my entire content pipeline',
        'Went from 0 to 2K followers in 30 days'
      ],
      photo: ''
    },
    {
      type: 'proof',
      big_number: '2,847',
      label: 'New Followers',
      context: 'In Just 30 Days'
    },
    {
      type: 'cta',
      nos: ['No filming yourself', 'No editing skills', 'No expensive tools'],
      price: '$9/mo',
      button_text: 'JOIN NOW',
      url: 'skool.com/ai-influencer'
    }
  ];
}

// ── Photo upload (multer) ──
const storyUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(shared.UPLOADS_DIR, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `photo-${Date.now()}${ext}`);
    }
  }),
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

// ──────────────────────────────────────────────
// Story Projects API
// ──────────────────────────────────────────────

// Sanitize params
router.param('id', (req, res, next, val) => {
  if (!/^story-\d+$/.test(val)) return res.status(400).json({ error: 'Invalid project ID' });
  next();
});
router.param('presetId', (req, res, next, val) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(val)) return res.status(400).json({ error: 'Invalid preset ID' });
  next();
});

// List projects
router.get('/story/projects', (req, res) => {
  const projects = listStoryProjects().map(p => ({
    id: p.id, name: p.name, created_at: p.created_at, updated_at: p.updated_at,
    slide_count: (p.slides || []).length,
    style: p.style,
    is_active: !!p.is_active
  }));
  res.json(projects);
});

// Create project
router.post('/story/projects', (req, res) => {
  const id = 'story-' + Date.now();
  const project = {
    id,
    name: req.body.name || 'Untitled Story',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    slides: defaultSlides(),
    style: defaultStoryStyle()
  };
  writeStoryProject(project);
  res.json({ ok: true, project });
});

// Get project
router.get('/story/projects/:id', (req, res) => {
  const project = readStoryProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// Update project
router.put('/story/projects/:id', (req, res) => {
  let project = readStoryProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const allowed = ['name', 'slides', 'style'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) project[key] = req.body[key];
  }
  writeStoryProject(project);
  res.json({ ok: true, project });
});

// Delete project
router.delete('/story/projects/:id', (req, res) => {
  deleteStoryProject(req.params.id);
  res.json({ ok: true });
});

// Set as active design — skill reads this when generating stories
router.post('/story/projects/:id/set-active', (req, res) => {
  const project = readStoryProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Clear active from all other projects, set on this one
  const all = listStoryProjects();
  for (const p of all) {
    if (p.is_active && p.id !== req.params.id) {
      p.is_active = false;
      writeStoryProject(p);
    }
  }
  project.is_active = true;
  writeStoryProject(project);

  res.json({ ok: true });
});

// Get active design (for the skill to read)
router.get('/story/active-design', (req, res) => {
  const all = listStoryProjects();
  const active = all.find(p => p.is_active);
  if (!active) return res.json({ ok: false, error: 'No active design. Create one in Stories.' });
  res.json({ ok: true, style: active.style, name: active.name });
});

// Upload photo
router.post('/story/projects/:id/upload-photo', storyUpload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const project = readStoryProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const relPath = `uploads/${req.params.id}/${req.file.filename}`;
  res.json({ ok: true, path: relPath });
});

// Export — generate HTML files + screenshot to PNG
router.post('/story/projects/:id/export', async (req, res) => {
  const project = readStoryProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const exportDir = path.join(shared.UPLOADS_DIR, req.params.id, 'export');
  fs.mkdirSync(exportDir, { recursive: true });

  const slides = project.slides || [];
  const style = project.style || defaultStoryStyle();
  const htmlFiles = [];
  const pngFiles = [];

  // Step 1: Generate HTML files
  for (let i = 0; i < slides.length; i++) {
    const html = buildSlideHTML(slides[i], i, slides.length, style, project);
    const filename = `slide-${i + 1}.html`;
    fs.writeFileSync(path.join(exportDir, filename), html);
    htmlFiles.push(`uploads/${req.params.id}/export/${filename}`);
  }

  // Step 2: Screenshot to PNG via Playwright
  let browser = null;
  try {
    const { chromium } = require('playwright-core');

    // Find system Chrome/Edge
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
    ];
    let execPath = null;
    for (const p of chromePaths) {
      try { if (fs.existsSync(p)) { execPath = p; break; } } catch {}
    }

    if (!execPath) {
      console.warn('[StoryExport] No Chrome/Edge found — returning HTML only');
      return res.json({ ok: true, files: htmlFiles, pngs: [], export_dir: exportDir, note: 'HTML exported. No Chrome/Edge found for PNG screenshots.' });
    }

    browser = await chromium.launch({ executablePath: execPath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
    const page = await context.newPage();

    for (let i = 0; i < slides.length; i++) {
      const htmlPath = path.join(exportDir, `slide-${i + 1}.html`);
      const pngPath = path.join(exportDir, `slide-${i + 1}.png`);

      await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`);
      await page.waitForTimeout(2000); // Wait for Google Fonts to load
      await page.screenshot({ path: pngPath, type: 'png' });
      pngFiles.push(`uploads/${req.params.id}/export/slide-${i + 1}.png`);
    }

    await browser.close();
    browser = null;

    console.log(`[StoryExport] Exported ${pngFiles.length} PNGs for project ${req.params.id}`);
    res.json({ ok: true, files: htmlFiles, pngs: pngFiles, export_dir: exportDir });
  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    console.error('[StoryExport] Screenshot failed:', err.message);
    // Still return HTML files even if screenshot fails
    res.json({ ok: true, files: htmlFiles, pngs: [], export_dir: exportDir, note: 'HTML exported. Screenshot failed: ' + err.message });
  }
});

// ──────────────────────────────────────────────
// Story Presets API
// ──────────────────────────────────────────────

router.get('/story/presets', (req, res) => {
  res.json(listStoryPresets());
});

router.post('/story/presets', (req, res) => {
  const id = req.body.id || ('preset-' + Date.now());
  const preset = {
    id,
    name: req.body.name || 'Custom Preset',
    description: req.body.description || '',
    style: req.body.style || defaultStoryStyle()
  };
  const file = path.join(shared.STORY_PRESETS_DIR, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(preset, null, 2));
  res.json({ ok: true, preset });
});

router.delete('/story/presets/:presetId', (req, res) => {
  const file = path.join(shared.STORY_PRESETS_DIR, `${req.params.presetId}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

// ──────────────────────────────────────────────
// HTML Builder (server-side slide generation)
// ──────────────────────────────────────────────

function buildSlideHTML(slide, index, total, style, project) {
  const c = style.colors || {};
  const f = style.fonts || {};
  const d = style.decorations || {};
  const bg = c.background || '#0a0a12';
  const pri = c.primary || '#7B2FF2';
  const sec = c.secondary || '#C084FC';
  const ter = c.tertiary || '#E9D5FF';
  const txt = c.text || '#ffffff';
  const hFont = f.headline || 'Playfair Display';
  const bFont = f.body || 'Inter';

  const topLine = d.topLine !== false ? `<div style="position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,${pri},${sec});"></div>` : '';
  const indicator = d.slideIndicator !== false ? `<div style="position:absolute;top:60px;right:60px;font-family:'${bFont}',sans-serif;font-size:28px;font-weight:700;color:${pri};">${index + 1}/${total}</div>` : '';
  const glow = d.backgroundGlow !== false ? `<div style="position:absolute;top:50%;left:50%;width:800px;height:800px;transform:translate(-50%,-50%);background:radial-gradient(circle,${pri}12 0%,transparent 70%);pointer-events:none;"></div>` : '';
  const circles = d.cornerCircles !== false ? `
    <div style="position:absolute;bottom:120px;right:-40px;width:160px;height:160px;border-radius:50%;border:1px solid ${pri}15;pointer-events:none;"></div>
    <div style="position:absolute;top:200px;left:-60px;width:200px;height:200px;border-radius:50%;border:1px solid ${sec}10;pointer-events:none;"></div>` : '';

  let content = '';
  switch (slide.type) {
    case 'hook':
      content = buildHookSlide(slide, { pri, sec, ter, txt, hFont, bFont });
      break;
    case 'pain':
      content = buildPainSlide(slide, { pri, sec, ter, txt, hFont, bFont });
      break;
    case 'shift':
      content = buildShiftSlide(slide, { pri, sec, ter, txt, hFont, bFont }, project);
      break;
    case 'proof':
      content = buildProofSlide(slide, { pri, sec, ter, txt, hFont, bFont });
      break;
    case 'cta':
      content = buildCtaSlide(slide, { pri, sec, ter, txt, hFont, bFont });
      break;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(hFont)}:wght@400;600;700;800;900&family=${encodeURIComponent(bFont)}:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box;}</style>
</head><body>
<div style="width:1080px;height:1920px;position:relative;overflow:hidden;background:${bg};color:${txt};font-family:'${bFont}',sans-serif;">
  ${topLine}${indicator}${glow}${circles}
  ${content}
</div>
</body></html>`;
}

function buildHookSlide(s, t) {
  return `
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;justify-content:center;padding:80px;">
      ${s.eyebrow ? `<div style="font-family:'${t.bFont}',sans-serif;font-size:32px;font-weight:600;letter-spacing:6px;color:${t.sec};margin-bottom:40px;text-transform:uppercase;">${esc(s.eyebrow)}</div>` : ''}
      <div style="font-family:'${t.hFont}',serif;font-size:96px;font-weight:800;line-height:1.05;letter-spacing:-2px;margin-bottom:30px;">${esc(s.headline || '')}</div>
      ${s.subtext ? `<div style="font-size:42px;font-weight:500;color:${t.txt}cc;line-height:1.3;">${esc(s.subtext)}</div>` : ''}
      ${s.emphasis ? `<div style="font-family:'${t.hFont}',serif;font-size:52px;font-weight:700;color:${t.sec};margin-top:30px;font-style:italic;">${esc(s.emphasis)}</div>` : ''}
    </div>`;
}

function buildPainSlide(s, t) {
  const pains = (s.pains || []).map((p, i) => `
    <div style="position:relative;padding:36px 40px 36px 50px;border-left:4px solid ${t.pri};margin-bottom:24px;">
      <div style="position:absolute;top:-20px;right:20px;font-family:'${t.hFont}',serif;font-size:180px;font-weight:900;color:${t.pri}08;line-height:1;">${i + 1}</div>
      <div style="font-size:38px;font-weight:500;line-height:1.4;color:${t.txt}dd;position:relative;">${esc(p)}</div>
    </div>`).join('');
  return `
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;justify-content:center;padding:80px;">
      <div style="font-family:'${t.hFont}',serif;font-size:72px;font-weight:800;margin-bottom:60px;">${esc(s.headline || 'Sound Familiar?')}</div>
      ${pains}
    </div>`;
}

function buildShiftSlide(s, t, project) {
  const actions = (s.actions || []).map(a => `
    <div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:20px;">
      <div style="width:28px;height:28px;border-radius:50%;background:${t.pri};flex-shrink:0;margin-top:6px;display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;">✓</div>
      <div style="font-size:36px;font-weight:500;color:${t.txt}dd;line-height:1.4;">${esc(a)}</div>
    </div>`).join('');
  const photoPath = s.photo || '';
  const photoHTML = photoPath ? `
    <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:100%;height:700px;overflow:hidden;">
      ${t.pri ? `<div style="position:absolute;bottom:100px;left:50%;transform:translateX(-50%);width:500px;height:500px;border-radius:50%;background:${t.pri}30;filter:blur(80px);"></div>` : ''}
      <img src="/${photoPath}" style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);height:650px;object-fit:contain;mask-image:linear-gradient(to top,black 60%,transparent);-webkit-mask-image:linear-gradient(to top,black 60%,transparent);">
    </div>` : '';
  return `
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;padding:80px;padding-bottom:${photoPath ? '720px' : '80px'};justify-content:center;">
      <div style="font-family:'${t.hFont}',serif;font-size:72px;font-weight:800;margin-bottom:50px;">${esc(s.headline || "Here's What Changed")}</div>
      ${actions}
    </div>
    ${photoHTML}`;
}

function buildProofSlide(s, t) {
  return `
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;text-align:center;">
      <div style="font-family:'${t.hFont}',serif;font-size:220px;font-weight:900;line-height:1;background:linear-gradient(135deg,${t.pri},${t.sec});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${esc(s.big_number || '0')}</div>
      <div style="font-size:52px;font-weight:700;margin-top:20px;letter-spacing:2px;">${esc(s.label || '')}</div>
      <div style="font-size:36px;color:${t.txt}99;margin-top:16px;">${esc(s.context || '')}</div>
    </div>`;
}

function buildCtaSlide(s, t) {
  const nos = (s.nos || []).map(n => `
    <div style="font-size:36px;font-weight:500;color:${t.txt}cc;margin-bottom:16px;">
      <span style="color:${t.pri};margin-right:12px;">✕</span> ${esc(n)}
    </div>`).join('');
  return `
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;justify-content:center;padding:80px;">
      ${nos}
      <div style="width:100%;height:2px;background:linear-gradient(90deg,transparent,${t.pri}40,transparent);margin:40px 0;"></div>
      <div style="text-align:center;">
        ${s.price ? `<div style="font-family:'${t.hFont}',serif;font-size:110px;font-weight:900;background:linear-gradient(135deg,${t.pri},${t.sec});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:30px;">${esc(s.price)}</div>` : ''}
        <div style="display:inline-block;padding:28px 80px;background:linear-gradient(135deg,${t.pri},${t.sec});border-radius:60px;font-size:38px;font-weight:700;color:#fff;letter-spacing:3px;box-shadow:0 8px 40px ${t.pri}50;">${esc(s.button_text || 'JOIN NOW')}</div>
        ${s.url ? `<div style="font-size:28px;color:${t.txt}66;margin-top:20px;">${esc(s.url)}</div>` : ''}
      </div>
    </div>`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = router;
