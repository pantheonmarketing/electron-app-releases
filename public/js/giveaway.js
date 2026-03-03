// ═══ Giveaway Funnel Tool ═══

let gvInitialized = false;
let gvProjects = [];
let gvCurrentProject = null;
let gvPreviewPage = 'optin';
let gvSaveTimer = null;

// ── API helpers ──
const gvApi = {
  async list() { return (await fetch('/api/giveaway/projects')).json(); },
  async create(name) { return (await fetch('/api/giveaway/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).json(); },
  async get(id) { return (await fetch('/api/giveaway/projects/' + id)).json(); },
  async update(id, data) { return (await fetch('/api/giveaway/projects/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(); },
  async del(id) { return (await fetch('/api/giveaway/projects/' + id, { method: 'DELETE' })).json(); },
  async uploadHero(id, file) {
    const fd = new FormData(); fd.append('hero', file);
    return (await fetch('/api/giveaway/projects/' + id + '/upload-hero', { method: 'POST', body: fd })).json();
  },
  async deploy(id, workerName) { return (await fetch('/api/giveaway/projects/' + id + '/deploy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workerName }) })).json(); },
  async undeploy(id) { return (await fetch('/api/giveaway/projects/' + id + '/undeploy', { method: 'POST' })).json(); },
  async cfCheck() { return (await fetch('/api/giveaway/cf-check')).json(); },
};

// ── Init ──
function gvInit() {
  if (gvInitialized) return;
  gvInitialized = true;
  gvLoadList();
}

async function gvLoadList() {
  const data = await gvApi.list();
  if (data.ok) gvProjects = data.projects;
  gvRenderLanding();
}

// ── Landing page (project list) ──
function gvRenderLanding() {
  const view = document.getElementById('giveawayView');
  const landing = document.getElementById('gvLanding');
  const editor = document.getElementById('gvEditor');
  if (landing) landing.style.display = '';
  if (editor) editor.style.display = 'none';

  const list = document.getElementById('gvProjectList');
  if (!list) return;

  if (gvProjects.length === 0) {
    list.innerHTML = '<div class="gv-empty"><div class="gv-empty-icon">🎁</div><div class="gv-empty-text">No giveaway funnels yet. Create one to start collecting leads.</div></div>';
    return;
  }

  list.innerHTML = gvProjects.map(p => {
    const isLive = p.deploy?.status === 'deployed';
    return `
    <div class="gv-project-card" onclick="gvOpenEditor('${p.id}')">
      <div class="gv-card-top">
        <div class="gv-card-name">${gvEsc(p.name)}</div>
        <span class="gv-card-status ${isLive ? 'live' : 'draft'}">${isLive ? 'Live' : 'Draft'}</span>
      </div>
      <div class="gv-card-headline">${gvEsc(p.config?.headline || 'No headline set')}</div>
      ${isLive && p.deploy.workerUrl ? `<div class="gv-card-url">${gvEsc(p.deploy.workerUrl)}</div>` : ''}
      <div class="gv-card-meta">Created ${new Date(p.created_at).toLocaleDateString()}</div>
      <div class="gv-card-actions" onclick="event.stopPropagation()">
        <button onclick="gvOpenEditor('${p.id}')">Edit</button>
        <button onclick="gvDuplicateProject('${p.id}')">Duplicate</button>
        <button class="danger" onclick="gvDeleteProject('${p.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function gvEsc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── Create / Delete / Duplicate ──
async function gvNewProject() {
  const data = await gvApi.create('New Funnel');
  if (data.ok) {
    gvProjects.unshift(data.project);
    gvOpenEditor(data.project.id);
  }
}

async function gvDeleteProject(id) {
  if (!confirm('Delete this funnel? This cannot be undone.')) return;
  await gvApi.del(id);
  gvProjects = gvProjects.filter(p => p.id !== id);
  gvRenderLanding();
  showToast('Funnel deleted', 'success');
}

async function gvDuplicateProject(id) {
  const src = gvProjects.find(p => p.id === id);
  if (!src) return;
  const data = await gvApi.create(src.name + ' (Copy)');
  if (data.ok) {
    await gvApi.update(data.project.id, { config: { ...src.config, heroImage: '' } });
    gvProjects.unshift({ ...data.project, config: { ...src.config, heroImage: '' } });
    gvRenderLanding();
    showToast('Funnel duplicated', 'success');
  }
}

// ── Editor ──
async function gvOpenEditor(id) {
  const data = await gvApi.get(id);
  if (!data.ok) { showToast('Failed to load funnel', 'error'); return; }
  gvCurrentProject = data.project;
  gvPreviewPage = 'optin';

  const landing = document.getElementById('gvLanding');
  const editor = document.getElementById('gvEditor');
  if (landing) landing.style.display = 'none';
  if (editor) editor.style.display = 'flex';

  gvRenderEditor();
}

function gvBackToList() {
  gvCurrentProject = null;
  const landing = document.getElementById('gvLanding');
  const editor = document.getElementById('gvEditor');
  if (landing) landing.style.display = '';
  if (editor) editor.style.display = 'none';
  gvLoadList();
}

function gvRenderEditor() {
  const p = gvCurrentProject;
  if (!p) return;
  const c = p.config;

  // Toolbar
  document.getElementById('gvToolbarName').value = p.name;

  // Left panel
  const left = document.getElementById('gvEditorForm');
  left.innerHTML = `
    <!-- Page 1: Opt-in -->
    <div class="gv-section">
      <div class="gv-section-title">Page 1 — Opt-In</div>
      <div class="gv-field">
        <label>Hero Image</label>
        <div class="gv-hero-zone" id="gvHeroZone" style="position:relative;">
          ${c.heroImage ? `<img src="/uploads/${p.id}/${gvEsc(c.heroImage)}" alt="Hero">` : '<span class="gv-hero-placeholder">Click to upload hero image</span>'}
          <input type="file" id="gvHeroInput" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;" onchange="gvUploadHero(this)">
        </div>
      </div>
      <div class="gv-field">
        <label>Badge Text</label>
        <input type="text" value="${gvEsc(c.badge)}" onchange="gvUpdateConfig('badge', this.value)">
      </div>
      <div class="gv-field">
        <label>Headline</label>
        <input type="text" value="${gvEsc(c.headline)}" onchange="gvUpdateConfig('headline', this.value)">
      </div>
      <div class="gv-field">
        <label>Subheadline</label>
        <input type="text" value="${gvEsc(c.subheadline)}" onchange="gvUpdateConfig('subheadline', this.value)">
      </div>
      <div class="gv-field">
        <label>Subheadline Bold Part</label>
        <input type="text" value="${gvEsc(c.subheadlineBold)}" onchange="gvUpdateConfig('subheadlineBold', this.value)">
      </div>
      <div class="gv-field">
        <label>CTA Button Text</label>
        <input type="text" value="${gvEsc(c.ctaButton)}" onchange="gvUpdateConfig('ctaButton', this.value)">
      </div>
      <div class="gv-field">
        <label>Social Proof</label>
        <input type="text" value="${gvEsc(c.socialProof)}" placeholder="e.g. Downloaded by 2,400+ creators" onchange="gvUpdateConfig('socialProof', this.value)">
      </div>
    </div>

    <!-- Page 2: Thank You -->
    <div class="gv-section">
      <div class="gv-section-title">Page 2 — Thank You</div>
      <div class="gv-field">
        <label>Thank-You Title</label>
        <input type="text" value="${gvEsc(c.thankYouTitle)}" onchange="gvUpdateConfig('thankYouTitle', this.value)">
      </div>
      <div class="gv-field">
        <label>Thank-You Text</label>
        <textarea onchange="gvUpdateConfig('thankYouText', this.value)">${gvEsc(c.thankYouText)}</textarea>
      </div>
      <div class="gv-field">
        <label>Access Button Text</label>
        <input type="text" value="${gvEsc(c.accessButton)}" onchange="gvUpdateConfig('accessButton', this.value)">
      </div>
      <div class="gv-field">
        <label>Access URL (where the freebie lives)</label>
        <input type="text" value="${gvEsc(c.accessUrl)}" placeholder="https://..." onchange="gvUpdateConfig('accessUrl', this.value)">
      </div>
      <div class="gv-field">
        <label>Video on Thank-You Page (optional)</label>
        <input type="text" value="${gvEsc(c.thankYouVideoUrl || '')}" placeholder="YouTube, Vimeo, or direct video URL" onchange="gvUpdateConfig('thankYouVideoUrl', this.value)">
      </div>
    </div>

    <!-- Upsell -->
    <div class="gv-section">
      <div class="gv-section-title">Upsell Section</div>
      <label class="gv-toggle">
        <input type="checkbox" ${c.upsellEnabled ? 'checked' : ''} onchange="gvUpdateConfig('upsellEnabled', this.checked); gvRenderEditor();">
        <span>Enable upsell on thank-you page</span>
      </label>
      ${c.upsellEnabled ? `
      <div class="gv-field">
        <label>Upsell Headline</label>
        <input type="text" value="${gvEsc(c.upsellHeadline)}" onchange="gvUpdateConfig('upsellHeadline', this.value)">
      </div>
      <div class="gv-field">
        <label>Upsell Text</label>
        <textarea onchange="gvUpdateConfig('upsellText', this.value)">${gvEsc(c.upsellText)}</textarea>
      </div>
      <div class="gv-field">
        <label>Bullets</label>
        <div id="gvBulletsList">
          ${(c.upsellBullets || []).map((b, i) => `
            <div class="gv-bullet-row">
              <input class="gv-bullet-emoji" value="${gvEsc(b.emoji)}" maxlength="4" onchange="gvUpdateBullet(${i}, 'emoji', this.value)">
              <input class="gv-bullet-text" value="${gvEsc(b.text)}" onchange="gvUpdateBullet(${i}, 'text', this.value)">
              <button class="gv-bullet-del" onclick="gvRemoveBullet(${i})">×</button>
            </div>
          `).join('')}
        </div>
        <button class="gv-add-bullet" onclick="gvAddBullet()">+ Add bullet</button>
      </div>
      <div class="gv-field-row">
        <div class="gv-field">
          <label>Price</label>
          <input type="text" value="${gvEsc(c.upsellPrice)}" onchange="gvUpdateConfig('upsellPrice', this.value)">
        </div>
        <div class="gv-field">
          <label>Period</label>
          <input type="text" value="${gvEsc(c.upsellPeriod)}" onchange="gvUpdateConfig('upsellPeriod', this.value)">
        </div>
      </div>
      <div class="gv-field">
        <label>CTA Button Text</label>
        <input type="text" value="${gvEsc(c.upsellCta)}" onchange="gvUpdateConfig('upsellCta', this.value)">
      </div>
      <div class="gv-field">
        <label>CTA URL</label>
        <input type="text" value="${gvEsc(c.upsellUrl)}" placeholder="https://..." onchange="gvUpdateConfig('upsellUrl', this.value)">
      </div>
      <div class="gv-field">
        <label>Disclaimer</label>
        <input type="text" value="${gvEsc(c.upsellDisclaimer)}" onchange="gvUpdateConfig('upsellDisclaimer', this.value)">
      </div>
      ` : ''}
    </div>

    <!-- Email Collection -->
    <div class="gv-section">
      <div class="gv-section-title">Email Collection</div>
      <div class="gv-field">
        <label>Provider</label>
        <select onchange="gvUpdateConfig('emailProvider', this.value); gvRenderEditor();">
          <option value="none" ${c.emailProvider === 'none' ? 'selected' : ''}>None (redirect only)</option>
          <option value="convertkit" ${c.emailProvider === 'convertkit' ? 'selected' : ''}>ConvertKit / Kit</option>
          <option value="webhook" ${c.emailProvider === 'webhook' ? 'selected' : ''}>Webhook URL</option>
        </select>
      </div>
      ${c.emailProvider === 'convertkit' ? `
      <div class="gv-field">
        <label>Kit API Key</label>
        <input type="text" value="${gvEsc(c.convertkitApiKey)}" placeholder="Your Kit v4 API key" onchange="gvUpdateConfig('convertkitApiKey', this.value)">
      </div>
      <div class="gv-field">
        <label>Tag ID</label>
        <input type="text" value="${gvEsc(c.convertkitTagId)}" placeholder="e.g. 15920914" onchange="gvUpdateConfig('convertkitTagId', this.value)">
      </div>
      ` : ''}
      ${c.emailProvider === 'webhook' ? `
      <div class="gv-field">
        <label>Webhook URL</label>
        <input type="text" value="${gvEsc(c.webhookUrl)}" placeholder="https://hooks.zapier.com/..." onchange="gvUpdateConfig('webhookUrl', this.value)">
      </div>
      ` : ''}
    </div>

    <!-- Colors -->
    <div class="gv-section">
      <div class="gv-section-title">Colors</div>
      <div class="gv-field">
        <label>Accent Color</label>
        <div class="gv-color-picker">
          <input type="color" value="${c.accentColor || '#7B2FF2'}" onchange="gvUpdateConfig('accentColor', this.value); this.nextElementSibling.value=this.value;">
          <input type="text" value="${c.accentColor || '#7B2FF2'}" onchange="gvUpdateConfig('accentColor', this.value); this.previousElementSibling.value=this.value;">
        </div>
      </div>
      <div class="gv-field">
        <label>Accent Light</label>
        <div class="gv-color-picker">
          <input type="color" value="${c.accentLight || '#C084FC'}" onchange="gvUpdateConfig('accentLight', this.value); this.nextElementSibling.value=this.value;">
          <input type="text" value="${c.accentLight || '#C084FC'}" onchange="gvUpdateConfig('accentLight', this.value); this.previousElementSibling.value=this.value;">
        </div>
      </div>
      <div class="gv-field">
        <label>Contact Email</label>
        <input type="text" value="${gvEsc(c.contactEmail)}" placeholder="you@example.com" onchange="gvUpdateConfig('contactEmail', this.value)">
      </div>
    </div>

    <!-- Deploy -->
    <div class="gv-section">
      <div class="gv-section-title">Deploy to Cloudflare</div>
      <div class="gv-deploy-section">
        <div class="gv-deploy-status">
          <span class="gv-deploy-dot ${p.deploy?.status === 'deployed' ? 'live' : 'draft'}"></span>
          <span style="color:${p.deploy?.status === 'deployed' ? '#4ade80' : '#888'};font-weight:600;">${p.deploy?.status === 'deployed' ? 'Live' : 'Not deployed'}</span>
        </div>
        ${p.deploy?.workerUrl ? `<a href="${gvEsc(p.deploy.workerUrl)}" target="_blank" class="gv-deploy-url">${gvEsc(p.deploy.workerUrl)}</a>` : ''}
        <div class="gv-field" style="margin-bottom:10px;">
          <label>Worker Name</label>
          <input type="text" id="gvWorkerName" value="${gvEsc(p.deploy?.workerName || '')}" placeholder="my-funnel-name (lowercase, hyphens)">
        </div>
        <div style="display:flex;gap:8px;">
          <button class="gv-toolbar-btn primary" onclick="gvDeploy()" id="gvDeployBtn">Deploy</button>
          ${p.deploy?.status === 'deployed' ? `<button class="gv-toolbar-btn" onclick="gvUndeploy()">Take Down</button>` : ''}
        </div>
        ${p.deploy?.lastDeployed ? `<div style="font-size:11px;color:#666;margin-top:8px;">Last deployed: ${new Date(p.deploy.lastDeployed).toLocaleString()}</div>` : ''}
      </div>
    </div>
  `;

  // Refresh preview
  gvRefreshPreview();
}

// ── Config updates ──
function gvUpdateConfig(key, value) {
  if (!gvCurrentProject) return;
  gvCurrentProject.config[key] = value;
  gvScheduleSave();
}

function gvScheduleSave() {
  clearTimeout(gvSaveTimer);
  gvSaveTimer = setTimeout(gvSave, 500);
}

async function gvSave() {
  if (!gvCurrentProject) return;
  await gvApi.update(gvCurrentProject.id, { config: gvCurrentProject.config, name: gvCurrentProject.name });
  gvRefreshPreview();
}

function gvUpdateName() {
  const input = document.getElementById('gvToolbarName');
  if (input && gvCurrentProject) {
    gvCurrentProject.name = input.value;
    gvScheduleSave();
  }
}

// ── Bullets ──
function gvUpdateBullet(index, field, value) {
  if (!gvCurrentProject) return;
  const bullets = gvCurrentProject.config.upsellBullets || [];
  if (bullets[index]) { bullets[index][field] = value; gvScheduleSave(); }
}

function gvAddBullet() {
  if (!gvCurrentProject) return;
  if (!gvCurrentProject.config.upsellBullets) gvCurrentProject.config.upsellBullets = [];
  gvCurrentProject.config.upsellBullets.push({ emoji: '✨', text: '' });
  gvSave().then(() => gvRenderEditor());
}

function gvRemoveBullet(index) {
  if (!gvCurrentProject) return;
  gvCurrentProject.config.upsellBullets.splice(index, 1);
  gvSave().then(() => gvRenderEditor());
}

// ── Hero upload ──
async function gvUploadHero(input) {
  if (!input.files[0] || !gvCurrentProject) return;
  const data = await gvApi.uploadHero(gvCurrentProject.id, input.files[0]);
  if (data.ok) {
    gvCurrentProject.config.heroImage = data.filename;
    gvRenderEditor();
    showToast('Hero image uploaded', 'success');
  } else {
    showToast('Upload failed: ' + (data.error || 'Unknown error'), 'error');
  }
}

// ── Preview ──
function gvRefreshPreview() {
  const iframe = document.getElementById('gvPreviewFrame');
  if (!iframe || !gvCurrentProject) return;
  iframe.src = '/api/giveaway/projects/' + gvCurrentProject.id + '/preview?page=' + gvPreviewPage + '&t=' + Date.now();
}

function gvSwitchPreviewPage(page) {
  gvPreviewPage = page;
  document.querySelectorAll('.gv-preview-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  gvRefreshPreview();
}

// ── Deploy ──
async function gvDeploy() {
  if (!gvCurrentProject) return;
  const nameInput = document.getElementById('gvWorkerName');
  const workerName = (nameInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!workerName) { showToast('Enter a worker name (lowercase, hyphens)', 'error'); return; }

  const btn = document.getElementById('gvDeployBtn');
  btn.disabled = true;
  btn.textContent = 'Deploying...';

  try {
    const data = await gvApi.deploy(gvCurrentProject.id, workerName);
    if (data.ok) {
      gvCurrentProject.deploy = { status: 'deployed', workerName: data.workerName, workerUrl: data.url, lastDeployed: new Date().toISOString() };
      gvRenderEditor();
      showToast('Funnel deployed! ' + data.url, 'success');
    } else {
      showToast('Deploy failed: ' + (data.error || 'Unknown error'), 'error');
      btn.disabled = false;
      btn.textContent = 'Deploy';
    }
  } catch (e) {
    showToast('Deploy error: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Deploy';
  }
}

async function gvUndeploy() {
  if (!gvCurrentProject) return;
  if (!confirm('Remove this funnel from Cloudflare? The URL will stop working.')) return;
  const data = await gvApi.undeploy(gvCurrentProject.id);
  if (data.ok) {
    gvCurrentProject.deploy = { status: 'draft', workerName: '', workerUrl: '', lastDeployed: null };
    gvRenderEditor();
    showToast('Funnel taken down', 'success');
  } else {
    showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
  }
}

// ── Quick Create ──
let gvQcHeroFile = null;

function gvOpenQuickCreate() {
  document.getElementById('gvQcBackdrop').classList.add('active');
  document.getElementById('gvQcModal').classList.add('active');
  // Reset form
  document.getElementById('gvQcTopic').value = '';
  document.getElementById('gvQcEmail').checked = true;
  document.getElementById('gvQcUpsell').checked = true;
  document.getElementById('gvQcVideo').checked = false;
  document.getElementById('gvQcVideoUrl').style.display = 'none';
  document.getElementById('gvQcVideoUrlInput').value = '';
  document.getElementById('gvQcHeroLabel').textContent = 'Click to upload hero image';
  document.getElementById('gvQcHeroInput').value = '';
  gvQcHeroFile = null;
  document.getElementById('gvQcTopic').focus();
}

function gvCloseQuickCreate() {
  document.getElementById('gvQcBackdrop').classList.remove('active');
  document.getElementById('gvQcModal').classList.remove('active');
}

function gvQcHeroSelected(input) {
  if (input.files[0]) {
    gvQcHeroFile = input.files[0];
    document.getElementById('gvQcHeroLabel').textContent = gvQcHeroFile.name;
  }
}

async function gvSubmitQuickCreate() {
  const topic = document.getElementById('gvQcTopic').value.trim();
  if (!topic) { showToast('Please describe the giveaway', 'error'); return; }

  const collectEmail = document.getElementById('gvQcEmail').checked;
  const upsell = document.getElementById('gvQcUpsell').checked;
  const video = document.getElementById('gvQcVideo').checked;
  const videoUrl = document.getElementById('gvQcVideoUrlInput').value.trim();

  const btn = document.getElementById('gvQcSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Creating project...';

  try {
    // 1. Create a blank project first (so we have an ID for hero upload)
    const projData = await gvApi.create(topic.substring(0, 50));
    if (!projData.ok) { showToast('Failed to create project', 'error'); btn.disabled = false; btn.textContent = '\u26A1 Build My Funnel'; return; }
    const projectId = projData.project.id;

    // 2. Upload hero image if provided
    let heroPath = '';
    if (gvQcHeroFile) {
      btn.textContent = 'Uploading image...';
      const uploadData = await gvApi.uploadHero(projectId, gvQcHeroFile);
      if (uploadData.ok) {
        heroPath = `/uploads/${projectId}/${uploadData.filename}`;
      }
    }

    // 3. Build the task prompt
    let prompt = `Build a giveaway funnel about: "${topic}".\n\n`;
    prompt += `Project ID (already created): ${projectId}\n`;
    prompt += `Use PUT /api/giveaway/projects/${projectId} to set the config.\n\n`;
    prompt += `Settings:\n`;
    prompt += `- Collect emails: ${collectEmail ? 'yes' : 'no'}\n`;
    prompt += `- Upsell on thank-you page: ${upsell ? 'yes' : 'no'}\n`;
    prompt += `- Video on thank-you page: ${video ? 'yes' : 'no'}${video && videoUrl ? ' (URL: ' + videoUrl + ')' : ''}\n`;
    if (heroPath) {
      prompt += `- Hero image already uploaded at path: ${heroPath}\n`;
      prompt += `  (heroImage filename is already set on the project — no need to re-upload)\n`;
    }
    prompt += `\nGenerate compelling copy for all fields (headline, subheadline, badge, CTA, social proof, thank-you text, etc.).\n`;
    prompt += `If upsell is enabled, generate upsell headline, 4-5 emoji bullets, price, CTA text.\n`;
    prompt += `If collect emails is disabled, set emailProvider to "none".\n`;
    if (video && videoUrl) {
      prompt += `Set thankYouVideoUrl to: ${videoUrl}\n`;
    }
    prompt += `\nDo NOT deploy — just configure all the copy and settings. The user will deploy manually.`;

    // 4. Create task with giveaway-builder skill
    btn.textContent = 'Starting AI builder...';
    const space = typeof spaces !== 'undefined' ? spaces.find(s => s.id === activeSpaceId) : null;
    const workingDir = (space && space.working_dir) || '';

    const taskResult = await api.createTask({
      task: prompt,
      skill: 'giveaway-builder',
      model: 'sonnet',
      max_turns: 15,
      working_dir: workingDir,
      priority: 8,
    });

    if (!taskResult.ok && !taskResult.id) {
      showToast('Failed to create task', 'error');
      btn.disabled = false;
      btn.textContent = '\u26A1 Build My Funnel';
      return;
    }

    // 5. Auto-run the task
    await api.run(1);

    gvCloseQuickCreate();
    showToast('Building your funnel... check Studio for progress', 'success');

    // Switch to board to watch progress
    if (typeof switchView === 'function') switchView('board');

  } catch (e) {
    showToast('Error: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = '\u26A1 Build My Funnel';
  }
}
