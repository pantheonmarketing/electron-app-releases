const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const shared = require('../lib/shared');
const router = express.Router();

// ──────────────────────────────────────────────
// Giveaway Funnel — Helper Functions
// ──────────────────────────────────────────────

function readProject(id) {
  const file = path.join(shared.GIVEAWAY_PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (_) { return null; }
}

function writeProject(project) {
  project.updated_at = new Date().toISOString();
  const file = path.join(shared.GIVEAWAY_PROJECTS_DIR, `${project.id}.json`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
  return project;
}

function listProjects() {
  if (!fs.existsSync(shared.GIVEAWAY_PROJECTS_DIR)) return [];
  return fs.readdirSync(shared.GIVEAWAY_PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(shared.GIVEAWAY_PROJECTS_DIR, f), 'utf-8')); }
      catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function deleteProject(id) {
  const file = path.join(shared.GIVEAWAY_PROJECTS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  // Delete uploads folder
  const uploadsDir = path.join(shared.UPLOADS_DIR, id);
  if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
}

function defaultConfig() {
  return {
    headline: '',
    subheadline: '',
    subheadlineBold: '',
    badge: 'Free Download',
    ctaButton: 'Get It Free',
    socialProof: '',
    heroImage: '',
    thankYouTitle: "You're In!",
    thankYouText: 'Your free resource is ready. Click below to access it instantly.',
    accessButton: 'Access Now',
    accessUrl: '',
    thankYouVideoUrl: '',
    upsellEnabled: false,
    upsellHeadline: '',
    upsellText: '',
    upsellBullets: [],
    upsellPrice: '$9',
    upsellPeriod: '/month',
    upsellCta: 'Join Now',
    upsellUrl: '',
    upsellDisclaimer: 'Cancel anytime. No contracts. No BS.',
    contactEmail: '',
    emailProvider: 'none', // 'none' | 'convertkit' | 'webhook'
    convertkitApiKey: '',
    convertkitTagId: '',
    webhookUrl: '',
    accentColor: '#7B2FF2',
    accentLight: '#C084FC',
  };
}

function generateVideoEmbed(url) {
  if (!url) return '';
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) {
    return `<div style="margin-top:24px;margin-bottom:8px;border-radius:12px;overflow:hidden;aspect-ratio:16/9;">
      <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="width:100%;height:100%;border:none;" allow="autoplay;encrypted-media" allowfullscreen></iframe>
    </div>`;
  }
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `<div style="margin-top:24px;margin-bottom:8px;border-radius:12px;overflow:hidden;aspect-ratio:16/9;">
      <iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" style="width:100%;height:100%;border:none;" allow="autoplay;fullscreen" allowfullscreen></iframe>
    </div>`;
  }
  // HLS (.m3u8) or direct video (.mp4, .webm)
  if (url.match(/\.(m3u8|mp4|webm)(\?|$)/i)) {
    return `<div style="margin-top:24px;margin-bottom:8px;border-radius:12px;overflow:hidden;">
      <video src="${esc(url)}" controls playsinline style="width:100%;border-radius:12px;background:#000;"></video>
    </div>`;
  }
  // Fallback: assume it's an iframe-embeddable URL
  return `<div style="margin-top:24px;margin-bottom:8px;border-radius:12px;overflow:hidden;aspect-ratio:16/9;">
    <iframe src="${esc(url)}" style="width:100%;height:100%;border:none;" allowfullscreen></iframe>
  </div>`;
}

// ──────────────────────────────────────────────
// Multer for hero image upload
// ──────────────────────────────────────────────
const heroUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(shared.UPLOADS_DIR, req.params.id);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `hero${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(jpg|jpeg|png|webp|gif|jfif)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// ──────────────────────────────────────────────
// CRUD Endpoints
// ──────────────────────────────────────────────

// List all
router.get('/giveaway/projects', (_req, res) => {
  res.json({ ok: true, projects: listProjects() });
});

// Create
router.post('/giveaway/projects', (req, res) => {
  const id = 'gv_' + Date.now();
  const project = {
    id,
    name: req.body.name || 'New Funnel',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: defaultConfig(),
    deploy: { status: 'draft', workerName: '', workerUrl: '', lastDeployed: null },
  };
  writeProject(project);
  res.json({ ok: true, project });
});

// Get single
router.get('/giveaway/projects/:id', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, project });
});

// Update
router.put('/giveaway/projects/:id', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  if (req.body.name !== undefined) project.name = req.body.name;
  if (req.body.config) Object.assign(project.config, req.body.config);
  if (req.body.deploy) Object.assign(project.deploy, req.body.deploy);
  writeProject(project);
  res.json({ ok: true, project });
});

// Delete
router.delete('/giveaway/projects/:id', (req, res) => {
  deleteProject(req.params.id);
  res.json({ ok: true });
});

// Upload hero image
router.post('/giveaway/projects/:id/upload-hero', heroUpload.single('hero'), (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });
  project.config.heroImage = req.file.filename;
  writeProject(project);
  res.json({ ok: true, filename: req.file.filename, path: `/uploads/${req.params.id}/${req.file.filename}` });
});

// ──────────────────────────────────────────────
// Preview — returns rendered HTML for iframe
// ──────────────────────────────────────────────
router.get('/giveaway/projects/:id/preview', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  const page = req.query.page || 'optin'; // 'optin' | 'thankyou'
  const html = page === 'thankyou' ? generateThankYouHTML(project, true) : generateOptInHTML(project, true);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ──────────────────────────────────────────────
// Deploy to Cloudflare Workers
// ──────────────────────────────────────────────
router.get('/giveaway/cf-check', async (_req, res) => {
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!cfToken || !cfAccountId) {
    return res.json({ ok: false, error: 'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID not set in Settings → Env' });
  }
  try {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/subdomain`, {
      headers: { 'Authorization': `Bearer ${cfToken}` }
    });
    const data = await resp.json();
    if (data.success) {
      res.json({ ok: true, subdomain: data.result?.subdomain || '' });
    } else {
      res.json({ ok: false, error: data.errors?.[0]?.message || 'Invalid credentials' });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

router.post('/giveaway/projects/:id/deploy', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!cfToken || !cfAccountId) {
    return res.json({ ok: false, error: 'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID not set in Settings → Env' });
  }

  const workerName = (req.body.workerName || project.deploy.workerName || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!workerName) return res.json({ ok: false, error: 'Worker name is required' });

  try {
    const workerCode = generateWorkerCode(project);

    // Deploy via Cloudflare Workers API (ES modules format)
    const boundary = '----CFBoundary' + Date.now();
    const metadata = JSON.stringify({
      main_module: 'worker.js',
      compatibility_date: '2024-01-01',
    });

    let body = '';
    // Part 1: metadata
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="metadata"; filename="metadata.json"\r\n`;
    body += `Content-Type: application/json\r\n\r\n`;
    body += metadata + '\r\n';
    // Part 2: worker script
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n`;
    body += `Content-Type: application/javascript+module\r\n\r\n`;
    body += workerCode + '\r\n';
    body += `--${boundary}--\r\n`;

    const deployResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/scripts/${workerName}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${cfToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );

    const deployData = await deployResp.json();
    if (!deployData.success) {
      return res.json({ ok: false, error: deployData.errors?.[0]?.message || 'Deploy failed' });
    }

    // Enable workers.dev subdomain route
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/scripts/${workerName}/subdomain`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: true }),
      }
    );

    // Get the subdomain
    const subResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/subdomain`,
      { headers: { 'Authorization': `Bearer ${cfToken}` } }
    );
    const subData = await subResp.json();
    const subdomain = subData.result?.subdomain || '';
    const workerUrl = subdomain ? `https://${workerName}.${subdomain}.workers.dev` : `https://${workerName}.workers.dev`;

    project.deploy = {
      status: 'deployed',
      workerName,
      workerUrl,
      lastDeployed: new Date().toISOString(),
    };
    writeProject(project);

    res.json({ ok: true, url: workerUrl, workerName });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

router.post('/giveaway/projects/:id/undeploy', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!cfToken || !cfAccountId) {
    return res.json({ ok: false, error: 'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID not set' });
  }

  const workerName = project.deploy.workerName;
  if (!workerName) return res.json({ ok: false, error: 'No worker deployed' });

  try {
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/scripts/${workerName}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${cfToken}` } }
    );
    project.deploy = { status: 'draft', workerName: '', workerUrl: '', lastDeployed: null };
    writeProject(project);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ──────────────────────────────────────────────
// HTML / Worker Code Generation
// ──────────────────────────────────────────────

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escJs(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

function sharedCSS(accent, accentLight) {
  const a = accent || '#7B2FF2';
  const al = accentLight || '#C084FC';
  return `
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body { font-family: 'Poppins', system-ui, sans-serif; background: #171726; color: #fff; overflow-x: hidden; }
    .bg-grid { position: fixed; inset: 0; z-index: 0;
      background-image: linear-gradient(rgba(123,47,242,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(123,47,242,0.08) 1px, transparent 1px);
      background-size: 50px 50px; animation: grid-move 8s linear infinite; }
    @keyframes grid-move { to { background-position: 50px 50px; } }
    .bg-grid::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle, transparent 30%, #171726 70%); }
    .page-wrap { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 48px 16px; }
    .card { width: 100%; max-width: 480px; background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 16px; padding: 32px 40px; border: 1px solid rgba(255,255,255,0.1); }
    .card-wide { max-width: 560px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: ${a}26; border: 1px solid ${a}40; border-radius: 999px; padding: 6px 14px; color: ${al}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .text-center { text-align: center; }
    .mb-3 { margin-bottom: 12px; } .mb-4 { margin-bottom: 16px; } .mb-5 { margin-bottom: 20px; } .mb-6 { margin-bottom: 24px; } .mb-7 { margin-bottom: 28px; } .mb-8 { margin-bottom: 32px; }
    h1 { font-size: 26px; font-weight: 700; line-height: 1.25; color: #fff; }
    h2 { font-size: 20px; font-weight: 700; line-height: 1.25; color: #fff; }
    .sub { color: #b8b8d0; font-size: 14px; line-height: 1.7; }
    .sub-bold { color: #fff; font-weight: 500; }
    .input { width: 100%; background: rgba(255,255,255,0.07); color: #fff; font-size: 15px; height: 52px; padding: 0 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); outline: none; font-family: inherit; transition: border-color 0.2s; }
    .input::placeholder { color: #666; }
    .input:focus { border-color: ${a}; box-shadow: 0 0 0 2px ${a}33; }
    .form-group { display: flex; flex-direction: column; gap: 12px; }
    .btn-primary { display: block; width: 100%; font-weight: 700; font-size: 17px; color: #fff; padding: 16px; border-radius: 12px; border: none; cursor: pointer; text-align: center; text-decoration: none; font-family: inherit; background: linear-gradient(to right, ${a}, ${al}); transition: all 0.2s; }
    .btn-primary:hover { filter: brightness(1.1); box-shadow: 0 8px 24px ${a}4D; }
    .btn-primary:active { transform: scale(0.98); }
    .social-proof { color: #666; font-size: 12px; }
    .social-proof strong { color: #b8b8d0; font-weight: 500; }
    .footer-links { display: flex; justify-content: center; gap: 16px; margin-top: 24px; }
    .footer-links a { color: #555; font-size: 11px; text-decoration: none; transition: color 0.2s; }
    .footer-links a:hover { color: ${a}; }
    .footer-links span { color: #333; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 32px 0; }
    .check-circle { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #4ade80, #10b981); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(16,185,129,0.3); }
    .check-circle svg { width: 32px; height: 32px; color: #fff; }
    .bullet-list { display: flex; flex-direction: column; gap: 12px; }
    .bullet-item { display: flex; align-items: flex-start; gap: 12px; }
    .bullet-emoji { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
    .bullet-text { color: #b8b8d0; font-size: 14px; line-height: 1.5; }
    .price { color: #fff; font-size: 36px; font-weight: 700; }
    .price-period { color: #888; font-size: 15px; }
    .muted { color: #888; font-size: 13px; }
    .muted-sm { color: #666; font-size: 12px; }
    .footer-contact { color: #555; font-size: 12px; margin-top: 24px; }
    .footer-contact a { color: ${a}; text-decoration: none; transition: color 0.2s; }
    .footer-contact a:hover { color: ${al}; }
    .error-msg { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171; font-size: 13px; padding: 10px 16px; border-radius: 8px; display: none; }
    .spinner { display: inline-flex; align-items: center; gap: 8px; }
    .spinner svg { animation: spin 1s linear infinite; width: 20px; height: 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (min-width: 768px) { h1 { font-size: 32px; } h2 { font-size: 24px; } .sub { font-size: 15px; } .btn-primary { font-size: 18px; } .card { padding: 40px; } .social-proof { font-size: 13px; } .muted-sm { font-size: 13px; } .price { font-size: 42px; } }
  `;
}

function generateOptInHTML(project, isPreview) {
  const c = project.config;
  const heroSrc = isPreview && c.heroImage
    ? `/uploads/${project.id}/${c.heroImage}`
    : (c.heroImage ? '/hero.jpg' : '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(c.headline || 'Free Download')}</title>
  <style>${sharedCSS(c.accentColor, c.accentLight)}</style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="page-wrap">
    <div style="width:100%;max-width:480px;">
      <div class="card">
        ${heroSrc ? `<div class="text-center mb-6"><img src="${esc(heroSrc)}" alt="${esc(c.headline)}" style="width:100%;max-width:400px;border-radius:12px;box-shadow:0 8px 24px ${c.accentColor || '#7B2FF2'}33;"></div>` : ''}
        ${c.badge ? `<div class="text-center mb-4"><span class="badge">${esc(c.badge)}</span></div>` : ''}
        <h1 class="text-center mb-3">${esc(c.headline)}</h1>
        <p class="sub text-center mb-8">${esc(c.subheadline)}${c.subheadlineBold ? `<span class="sub-bold"> ${esc(c.subheadlineBold)}</span>` : ''}</p>
        <form id="optinForm" class="form-group" onsubmit="return handleSubmit(event)">
          <input type="text" name="name" class="input" placeholder="Your first name">
          <input type="email" name="email" class="input" placeholder="Your email address" required>
          <div class="error-msg" id="errorMsg"></div>
          <button type="submit" class="btn-primary" id="submitBtn">${esc(c.ctaButton || 'Get It Free')} &#10145;</button>
        </form>
        ${c.socialProof ? `<p class="social-proof text-center" style="margin-top:16px;">${esc(c.socialProof)}</p>` : ''}
      </div>
      <div class="footer-links">
        <a href="#privacy">Privacy Policy</a>
        <span>|</span>
        <a href="#terms">Terms of Service</a>
      </div>
    </div>
  </div>
  <script>
    function handleSubmit(e) {
      e.preventDefault();
      var form = e.target;
      var email = form.email.value.trim();
      var name = form.name.value.trim();
      if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        var err = document.getElementById('errorMsg');
        err.textContent = 'Please enter a valid email address.';
        err.style.display = 'block';
        return false;
      }
      var btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" opacity="0.75"/></svg>Sending...</span>';
      ${isPreview ? '// Preview mode — no real submit' : `fetch('/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, email: email }) }).catch(function(){});`}
      ${isPreview ? 'setTimeout(function(){ btn.disabled = false; btn.innerHTML = "' + escJs(c.ctaButton || 'Get It Free') + ' \\u27A1"; }, 1500);' : 'window.location.href = "/thank-you";'}
      return false;
    }
  </script>
</body>
</html>`;
}

function generateThankYouHTML(project, isPreview) {
  const c = project.config;

  let bulletsHTML = '';
  if (c.upsellEnabled && c.upsellBullets && c.upsellBullets.length > 0) {
    bulletsHTML = '<div class="bullet-list mb-7">' + c.upsellBullets.map(b =>
      `<div class="bullet-item"><span class="bullet-emoji">${esc(b.emoji)}</span><span class="bullet-text">${esc(b.text)}</span></div>`
    ).join('') + '</div>';
  }

  let upsellHTML = '';
  if (c.upsellEnabled) {
    upsellHTML = `
      <hr class="divider">
      <div>
        <div class="text-center mb-4"><span class="badge">Next Step</span></div>
        <h2 class="text-center mb-3">${esc(c.upsellHeadline)}</h2>
        <p class="sub text-center mb-6">${esc(c.upsellText)}</p>
        ${bulletsHTML}
        <div class="text-center mb-5">
          ${c.upsellPrice ? `<p class="muted" style="margin-bottom:4px;">For less than a Netflix subscription</p><div style="display:flex;align-items:baseline;justify-content:center;gap:4px;"><span class="price">${esc(c.upsellPrice)}</span><span class="price-period">${esc(c.upsellPeriod)}</span></div>` : ''}
        </div>
        <a href="${esc(c.upsellUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary">${esc(c.upsellCta)} &#10145;</a>
        ${c.upsellDisclaimer ? `<p class="muted-sm text-center" style="margin-top:12px;">${esc(c.upsellDisclaimer)}</p>` : ''}
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(c.thankYouTitle || 'Thank You')}</title>
  <style>${sharedCSS(c.accentColor, c.accentLight)}</style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="page-wrap">
    <div style="width:100%;max-width:560px;">
      <div class="card card-wide">
        <div class="text-center mb-5">
          <div class="check-circle" style="margin:0 auto;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          </div>
        </div>
        <h1 class="text-center mb-3">${esc(c.thankYouTitle)} &#127881;</h1>
        <p class="sub text-center mb-6">${esc(c.thankYouText)}</p>
        <a href="${esc(c.accessUrl)}" class="btn-primary">${esc(c.accessButton)} &#10145;</a>
        <p class="muted text-center" style="margin-top:12px;">Bookmark this page &mdash; you can come back anytime</p>
        ${c.thankYouVideoUrl ? generateVideoEmbed(c.thankYouVideoUrl) : ''}
        ${upsellHTML}
      </div>
      ${c.contactEmail ? `<p class="footer-contact text-center">Questions? Email <a href="mailto:${esc(c.contactEmail)}">${esc(c.contactEmail)}</a></p>` : ''}
    </div>
  </div>
</body>
</html>`;
}

function generateWorkerCode(project) {
  const c = project.config;
  const optInHTML = generateOptInHTML(project, false);
  const thankYouHTML = generateThankYouHTML(project, false);

  // Build hero image base64 if exists
  let heroBase64 = '';
  let heroMime = 'image/jpeg';
  if (c.heroImage) {
    const heroPath = path.join(shared.UPLOADS_DIR, project.id, c.heroImage);
    if (fs.existsSync(heroPath)) {
      heroBase64 = fs.readFileSync(heroPath, 'base64');
      const ext = path.extname(c.heroImage).toLowerCase();
      if (ext === '.png') heroMime = 'image/png';
      else if (ext === '.webp') heroMime = 'image/webp';
      else if (ext === '.gif') heroMime = 'image/gif';
    }
  }

  // Build email subscribe handler
  let subscribeCode = '';
  if (c.emailProvider === 'convertkit' && c.convertkitApiKey && c.convertkitTagId) {
    subscribeCode = `
      // ConvertKit subscriber + tag
      const subData = { email_address: body.email };
      if (body.name) subData.first_name = body.name;
      const createRes = await fetch('https://api.kit.com/v4/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': '${escJs(c.convertkitApiKey)}' },
        body: JSON.stringify(subData),
      });
      const created = await createRes.json();
      const sid = created.subscriber?.id;
      if (sid) {
        await fetch('https://api.kit.com/v4/tags/${escJs(c.convertkitTagId)}/subscribers/' + sid, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': '${escJs(c.convertkitApiKey)}' },
          body: '{}',
        });
      }`;
  } else if (c.emailProvider === 'webhook' && c.webhookUrl) {
    subscribeCode = `
      // Webhook
      await fetch('${escJs(c.webhookUrl)}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name || '', email: body.email, timestamp: new Date().toISOString() }),
      });`;
  }

  return `// Giveaway Funnel Worker — Generated by AI CEO Studio
const OPT_IN_HTML = ${JSON.stringify(optInHTML)};
const THANK_YOU_HTML = ${JSON.stringify(thankYouHTML)};
${heroBase64 ? `const HERO_B64 = "${heroBase64}";\nconst HERO_MIME = "${heroMime}";` : ''}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;

    // POST /subscribe
    if (request.method === 'POST' && p === '/subscribe') {
      try {
        const body = await request.json();
        if (!body.email) return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        ${subscribeCode ? `try { ${subscribeCode} } catch(e) { console.error('Subscribe error:', e); }` : '// No email provider configured'}
        return new Response(null, { status: 302, headers: { 'Location': url.origin + '/thank-you' } });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    ${heroBase64 ? `// Serve hero image
    if (p === '/hero.jpg') {
      const raw = Uint8Array.from(atob(HERO_B64), c => c.charCodeAt(0));
      return new Response(raw, { headers: { 'Content-Type': HERO_MIME, 'Cache-Control': 'public, max-age=31536000' } });
    }` : ''}

    // Thank-you page
    if (p === '/thank-you') {
      return new Response(THANK_YOU_HTML, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // Opt-in page (default)
    return new Response(OPT_IN_HTML, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
};
`;
}

module.exports = router;
