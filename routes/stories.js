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

    // Use server URL so /uploads/ paths and Google Fonts resolve correctly
    const serverBase = `http://localhost:3456`;

    for (let i = 0; i < slides.length; i++) {
      const pngPath = path.join(exportDir, `slide-${i + 1}.png`);
      await page.goto(`${serverBase}/api/story/projects/${req.params.id}/preview/${i}?t=${Date.now()}`);
      await page.waitForTimeout(2000); // Wait for Google Fonts + images
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

  const photoHTML = buildPhotoHTML(slide, { pri, sec, txt });

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(hFont)}:wght@400;600;700;800;900&family=${encodeURIComponent(bFont)}:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box;}</style>
</head><body>
<div style="width:1080px;height:1920px;position:relative;overflow:hidden;background:${bg};color:${txt};font-family:'${bFont}',sans-serif;">
  ${topLine}${indicator}${glow}${circles}
  ${content}
  ${photoHTML}
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
  return `
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;padding:80px;justify-content:center;">
      <div style="font-family:'${t.hFont}',serif;font-size:72px;font-weight:800;margin-bottom:50px;">${esc(s.headline || "Here's What Changed")}</div>
      ${actions}
    </div>`;
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

function buildPhotoHTML(slide, c) {
  if (!slide.photo) return '';
  const pos = slide.photo_pos || 'bottom-center';
  const size = slide.photo_size || 50;
  const effect = slide.photo_effect || 'shadow';
  const pri = c.pri || '#7B2FF2';

  const posMap = {
    'top-left':     'top:160px;left:80px;',
    'top-center':   'top:160px;left:50%;transform:translateX(-50%);',
    'top-right':    'top:160px;right:80px;',
    'center-left':  'top:50%;left:80px;transform:translateY(-50%);',
    'center':       'top:50%;left:50%;transform:translate(-50%,-50%);',
    'center-right': 'top:50%;right:80px;transform:translateY(-50%);',
    'bottom-left':  'bottom:80px;left:80px;',
    'bottom-center':'bottom:0;left:50%;transform:translateX(-50%);',
    'bottom-right': 'bottom:80px;right:80px;',
  };
  const posStyle = posMap[pos] || posMap['bottom-center'];
  const widthPx = Math.round(1080 * size / 100);
  let baseStyle = `width:${widthPx}px;`;
  let shadow = '', borderRadius = '12px', extra = '';

  switch (effect) {
    case 'shadow':
      shadow = 'box-shadow:0 40px 100px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05);';
      break;
    case 'glow':
      shadow = `box-shadow:0 0 100px ${pri}70,0 40px 100px rgba(0,0,0,0.6),0 0 0 2px ${pri}30;`;
      break;
    case 'circle':
      borderRadius = '50%';
      baseStyle += `height:${widthPx}px;object-fit:cover;`;
      shadow = 'box-shadow:0 20px 60px rgba(0,0,0,0.6);';
      break;
    case 'rounded':
      borderRadius = '40px';
      shadow = 'box-shadow:0 30px 80px rgba(0,0,0,0.7);';
      break;
    case 'fade':
      shadow = 'box-shadow:0 20px 60px rgba(0,0,0,0.5);';
      extra = 'mask-image:linear-gradient(to top,black 50%,transparent 95%);-webkit-mask-image:linear-gradient(to top,black 50%,transparent 95%);';
      break;
    default:
      borderRadius = '8px';
  }

  const src = slide.photo.startsWith('http') ? slide.photo : '/' + slide.photo;
  return `<img src="${src}" style="position:absolute;${posStyle}${baseStyle}border-radius:${borderRadius};object-fit:contain;${shadow}${extra}">`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────────
// AI Content Generation
// ──────────────────────────────────────────────

const TYPE_SEQUENCES = {
  3: ['hook', 'shift', 'cta'],
  4: ['hook', 'pain', 'shift', 'cta'],
  5: ['hook', 'pain', 'shift', 'proof', 'cta'],
  6: ['hook', 'pain', 'pain', 'shift', 'proof', 'cta'],
  7: ['hook', 'pain', 'pain', 'shift', 'proof', 'proof', 'cta'],
};

router.post('/story/generate-content', (req, res) => {
  const { text, slide_count = 5, style } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

  const count = Math.min(Math.max(parseInt(slide_count) || 5, 3), 7);
  const sequence = TYPE_SEQUENCES[count] || TYPE_SEQUENCES[5];

  const prompt = `You are generating content for ${count} Facebook/Instagram Story slides.

SLIDE SEQUENCE: ${sequence.join(' → ')}

SLIDE TYPES (use only fields listed for each type):
- hook: { type:"hook", eyebrow:"SHORT ALL CAPS LABEL", headline:"Bold hook statement", subtext:"Supporting line", emphasis:"" }
- pain: { type:"pain", headline:"Relatable pain headline", pains:["pain 1","pain 2","pain 3"] }
- shift: { type:"shift", headline:"Transformation headline", actions:["bullet 1","bullet 2","bullet 3"] }
- proof: { type:"proof", big_number:"2,847", label:"New Followers", context:"In 30 days" }
- cta: { type:"cta", nos:["No X","No Y","No Z"], price:"$9/mo", button_text:"JOIN NOW", url:"" }

SOURCE TEXT TO BASE THE SLIDES ON:
${text.slice(0, 3000)}

Rules:
- Keep text SHORT and punchy — Story slides, not paragraphs
- Make it feel real and relatable, not corporate
- Use casual language (contractions ok)
- The sequence is FIXED — generate exactly ${count} slides in this order: ${sequence.join(', ')}
- Respond ONLY with valid JSON, no markdown fences, no explanation

JSON format:
{"slides":[...]}`;

  const { execSync } = require('child_process');
  const { shellEscape } = require('../lib/helpers');
  const promptFile = path.join(shared.LOGS_DIR, `story-gen-${Date.now()}.txt`);

  try {
    fs.writeFileSync(promptFile, prompt);
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    const catCmd = process.platform === 'win32' ? 'type' : 'cat';
    const cmd = `${catCmd} ${shellEscape(promptFile)} | claude -p --dangerously-skip-permissions --output-format text --model sonnet --max-turns 1`;

    const output = execSync(cmd, {
      env: cleanEnv, cwd: shared.BASE_DIR, shell: true,
      encoding: 'utf-8', timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });

    let jsonStr = output.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();
    const s = jsonStr.indexOf('{'), e = jsonStr.lastIndexOf('}');
    if (s !== -1 && e !== -1) jsonStr = jsonStr.slice(s, e + 1);

    const parsed = JSON.parse(jsonStr);
    const slides = parsed.slides || [];
    if (!slides.length) return res.status(500).json({ error: 'Claude returned no slides' });

    // Create a project to store these slides
    const id = 'story-' + Date.now();
    const project = {
      id, name: 'Story ' + new Date().toLocaleDateString(),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      slides, style: style || defaultStoryStyle()
    };
    writeStoryProject(project);

    res.json({ ok: true, slides, project_id: id });
  } catch (err) {
    console.error('[StoryGen]', err.message);
    res.status(500).json({ ok: false, error: 'Generation failed: ' + err.message.slice(0, 200) });
  } finally {
    try { fs.unlinkSync(promptFile); } catch (_) {}
  }
});

// Regenerate a single slide
router.post('/story/regenerate-slide', (req, res) => {
  const { text, slide_type, context_slides } = req.body;
  if (!text || !slide_type) return res.status(400).json({ error: 'text and slide_type required' });

  const typeSchemas = {
    hook: '{ type:"hook", eyebrow:"SHORT ALL CAPS LABEL", headline:"Bold hook", subtext:"Supporting line", emphasis:"" }',
    pain: '{ type:"pain", headline:"Pain headline", pains:["pain 1","pain 2","pain 3"] }',
    shift: '{ type:"shift", headline:"Solution headline", actions:["bullet 1","bullet 2","bullet 3"] }',
    proof: '{ type:"proof", big_number:"2,847", label:"New Followers", context:"In 30 days" }',
    cta: '{ type:"cta", nos:["No X","No Y"], price:"$9/mo", button_text:"JOIN NOW", url:"" }',
  };

  const prompt = `Rewrite this Story slide (type: ${slide_type}) based on the source text.
Source: ${text.slice(0, 1000)}
Schema: ${typeSchemas[slide_type] || typeSchemas.hook}
Return ONLY valid JSON for one slide object, no markdown.`;

  const { execSync } = require('child_process');
  const { shellEscape } = require('../lib/helpers');
  const promptFile = path.join(shared.LOGS_DIR, `story-regen-${Date.now()}.txt`);

  try {
    fs.writeFileSync(promptFile, prompt);
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    const catCmd = process.platform === 'win32' ? 'type' : 'cat';
    const cmd = `${catCmd} ${shellEscape(promptFile)} | claude -p --dangerously-skip-permissions --output-format text --model sonnet --max-turns 1`;
    const output = execSync(cmd, {
      env: cleanEnv, cwd: shared.BASE_DIR, shell: true,
      encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    let jsonStr = output.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();
    const s = jsonStr.indexOf('{'), e = jsonStr.lastIndexOf('}');
    if (s !== -1 && e !== -1) jsonStr = jsonStr.slice(s, e + 1);
    const slide = JSON.parse(jsonStr);
    res.json({ ok: true, slide });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message.slice(0, 200) });
  } finally {
    try { fs.unlinkSync(promptFile); } catch (_) {}
  }
});

// Open export folder in system file explorer
router.post('/story/open-folder', (req, res) => {
  const { folder_path } = req.body;
  if (!folder_path) return res.status(400).json({ error: 'folder_path required' });

  const uploadsDir = path.resolve(shared.UPLOADS_DIR);
  const resolved = path.resolve(folder_path);
  if (!resolved.startsWith(uploadsDir)) return res.status(403).json({ error: 'Invalid path' });

  const { exec } = require('child_process');
  const cmd = process.platform === 'win32'
    ? `explorer "${resolved}"`
    : process.platform === 'darwin' ? `open "${resolved}"` : `xdg-open "${resolved}"`;
  exec(cmd);
  res.json({ ok: true });
});

// Preview single slide as HTML (for iframe preview)
router.get('/story/projects/:id/preview/:index', (req, res) => {
  const project = readStoryProject(req.params.id);
  if (!project) return res.status(404).send('Not found');
  const idx = parseInt(req.params.index) || 0;
  const slide = project.slides[idx];
  if (!slide) return res.status(404).send('Slide not found');
  const html = buildSlideHTML(slide, idx, project.slides.length, project.style || defaultStoryStyle(), project);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;
