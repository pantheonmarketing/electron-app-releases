/**
 * heygen.js — HeyGen Video Creator
 *
 * Creates AI avatar videos using the HeyGen API.
 * 3-step workflow: Avatar & Voice → Script → Generate & Preview
 */

// ── State ──
let hgProjects = [];
let hgCurrentProject = null;
let hgCurrentStep = 'avatar';
let hgAvatars = [];
let hgVoices = [];
let hgFilteredVoices = [];
let hgInitialized = false;
let hgPollingInterval = null;
let hgBrowserPollingInterval = null;
let hgHasKey = false;
let hgUseBrowser = true; // default to free browser mode
let hgVisibleCount = 10; // pagination: how many completed projects to show

// ── API Layer ──
const hgApi = {
  async getSettings() { return (await safeFetch('/api/heygen/settings')).json(); },
  async saveSettings(apiKey) { return (await safeFetch('/api/heygen/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) })).json(); },
  async getAvatars() { return (await safeFetch('/api/heygen/avatars')).json(); },
  async getVoices() { return (await safeFetch('/api/heygen/voices')).json(); },
  async generate(payload) { return (await safeFetch('/api/heygen/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(); },
  async getStatus(videoId) { return (await safeFetch(`/api/heygen/status/${videoId}`)).json(); },
  async listProjects() { return (await safeFetch('/api/heygen/projects')).json(); },
  async createProject(data) { return (await safeFetch('/api/heygen/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(); },
  async updateProject(id, data) { return (await safeFetch(`/api/heygen/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(); },
  async deleteProject(id) { return (await safeFetch(`/api/heygen/projects/${id}`, { method: 'DELETE' })).json(); },
  async getCredits() { return (await safeFetch('/api/heygen/credits')).json(); },
  async generateBrowser(projectId) {
    return (await safeFetch('/api/heygen/generate-browser', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ projectId })
    })).json();
  },
  async getBrowserResult(projectId) {
    return (await safeFetch(`/api/heygen/browser-result/${projectId}`)).json();
  },
  async loadToReels(projectId) {
    return (await safeFetch('/api/heygen/load-to-reels', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ projectId })
    })).json();
  },
  async openInFolder(projectId) {
    return (await safeFetch('/api/heygen/open-in-folder', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ projectId })
    })).json();
  },
};

// ── Init ──
async function hgInit() {
  if (hgInitialized) {
    hgRenderProjectList();
    return;
  }
  hgInitialized = true;

  try {
    const settings = await hgApi.getSettings();
    hgHasKey = settings.hasKey;
  } catch { hgHasKey = false; }

  if (!hgHasKey) {
    document.getElementById('hgSetupBanner').style.display = 'flex';
    document.getElementById('hgLanding').style.display = 'none';
  } else {
    document.getElementById('hgSetupBanner').style.display = 'none';
    document.getElementById('hgLanding').style.display = '';
    await hgLoadProjectList();
    hgLoadCredits();
  }
}

async function hgLoadCredits() {
  const el = document.getElementById('hgCreditsDisplay');
  if (!el) return;
  try {
    const resp = await hgApi.getCredits();
    if (resp.credits !== undefined) {
      el.textContent = `${resp.credits} credits left`;
      el.style.display = '';
      el.className = 'hg-credits-badge' + (resp.credits <= 5 ? ' low' : '');
    }
  } catch { el.style.display = 'none'; }
}

// ── Projects ──
async function hgLoadProjectList() {
  try {
    const resp = await hgApi.listProjects();
    hgProjects = resp.projects || [];
  } catch { hgProjects = []; }
  hgVisibleCount = 10;
  hgRenderProjectList();
}

function hgRenderProjectList() {
  const list = document.getElementById('hgProjectList');
  const empty = document.getElementById('hgEmptyState');
  const loadMoreWrap = document.getElementById('hgLoadMoreWrap');
  if (!list) return;

  // Filter to only completed projects with a video URL
  const completed = hgProjects.filter(p => p.status === 'completed' && p.videoUrl);

  if (completed.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    if (loadMoreWrap) loadMoreWrap.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';

  const visible = completed.slice(0, hgVisibleCount);
  const hasMore = completed.length > hgVisibleCount;

  list.innerHTML = visible.map(p => {
    // Use video URL for thumbnail via video element, or avatarThumb as fallback
    const thumbSrc = p.avatarThumb || p.thumbnailUrl;
    const thumbHtml = p.videoUrl
      ? `<video src="${escHtml(p.videoUrl)}" preload="metadata" muted style="width:100%;height:100%;object-fit:cover;border-radius:8px;"></video>`
      : thumbSrc
        ? `<img src="${escHtml(thumbSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
        : `<span class="hg-no-thumb"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#444;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></span>`;

    const dim = p.dimension ? `${p.dimension.width}x${p.dimension.height}` : '';
    const dateStr = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '';

    return `
    <div class="hg-project-card" onclick="hgOpenProject('${p.id}')">
      <div class="hg-project-card-thumb">${thumbHtml}</div>
      <div class="hg-project-card-name">${escHtml(p.name)}</div>
      <div class="hg-project-card-meta">
        <span class="hg-project-card-status completed">completed</span>
        ${p.avatarName ? `<span>${escHtml(p.avatarName)}</span>` : ''}
        ${dim ? `<span>${dim}</span>` : ''}
        ${dateStr ? `<span>${dateStr}</span>` : ''}
      </div>
      <div class="hg-project-card-btns">
        <button class="hg-btn-load-reels" onclick="event.stopPropagation();hgLoadInReels('${p.id}')" title="Load in Reel Master">Load in Reels</button>
        <button class="hg-btn-open-folder" onclick="event.stopPropagation();hgOpenInFolder('${p.id}')" title="Open in folder">Open Folder</button>
        <button class="hg-project-card-btn" onclick="event.stopPropagation();hgDeleteProject('${p.id}')" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('');

  if (loadMoreWrap) {
    loadMoreWrap.style.display = hasMore ? '' : 'none';
    const remaining = completed.length - hgVisibleCount;
    const btn = loadMoreWrap.querySelector('button');
    if (btn) btn.textContent = `Load More (${remaining} remaining)`;
  }
}

function hgLoadMore() {
  hgVisibleCount += 10;
  hgRenderProjectList();
}

async function hgLoadInReels(projectId) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }
  try {
    const resp = await hgApi.loadToReels(projectId);
    if (resp.ok) {
      showToast(`Video loaded into Reel Master: "${resp.reelName}"`, 'success');
      switchView('reelmaster');
      // Open the new reel project if rmOpenProject exists
      if (typeof rmOpenProject === 'function' && resp.reelId) {
        setTimeout(() => rmOpenProject(resp.reelId), 500);
      }
    } else {
      showToast('Failed: ' + (resp.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Failed to load in Reels: ' + e.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Load in Reels'; }
}

async function hgOpenInFolder(projectId) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Opening...'; }
  try {
    const resp = await hgApi.openInFolder(projectId);
    if (resp.ok) {
      showToast('Opened in file explorer', 'success');
    } else {
      showToast('Failed: ' + (resp.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Failed to open folder: ' + e.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Open Folder'; }
}

function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function hgNewProject() {
  try {
    const resp = await hgApi.createProject({ name: 'Untitled Video' });
    if (resp.project) {
      hgCurrentProject = resp.project;
      hgShowStudio();
      hgLoadAvatars();
      hgLoadVoices();
    }
  } catch (e) {
    showToast('Failed to create project: ' + e.message, 'error');
  }
}

async function hgOpenProject(id) {
  const proj = hgProjects.find(p => p.id === id);
  if (!proj) return;
  hgCurrentProject = proj;
  hgShowStudio();
  hgLoadAvatars();
  hgLoadVoices();

  // Restore state
  document.getElementById('hgProjectName').value = proj.name || '';
  document.getElementById('hgScriptInput').value = proj.script || '';
  hgUpdateCharCount();

  // Restore dimension
  if (proj.dimension) {
    document.querySelectorAll('.hg-dim-btn').forEach(btn => {
      btn.classList.toggle('active',
        parseInt(btn.dataset.w) === proj.dimension.width &&
        parseInt(btn.dataset.h) === proj.dimension.height);
    });
  }

  // If video exists, jump to generate step
  if (proj.videoUrl && proj.status === 'completed') {
    hgGoStep('generate');
    hgShowVideo(proj.videoUrl);
  } else if (proj.videoId && (proj.status === 'pending' || proj.status === 'processing')) {
    hgGoStep('generate');
    hgStartPolling(proj.videoId);
  } else if (proj.taskId && (proj.status === 'browser-pending' || proj.status === 'browser-running')) {
    hgGoStep('generate');
    hgStartBrowserPolling(proj.taskId, proj.id);
  }
}

async function hgDeleteProject(id) {
  if (!confirm('Delete this video project?')) return;
  try {
    await hgApi.deleteProject(id);
    hgProjects = hgProjects.filter(p => p.id !== id);
    hgRenderProjectList();
    showToast('Project deleted', 'success');
  } catch (e) {
    showToast('Failed to delete: ' + e.message, 'error');
  }
}

// ── Studio ──
function hgShowStudio() {
  document.getElementById('hgLanding').style.display = 'none';
  document.getElementById('hgSetupBanner').style.display = 'none';
  document.getElementById('hgStudio').style.display = 'flex';
  document.getElementById('hgProjectName').value = hgCurrentProject?.name || '';
  hgGoStep('avatar');
}

function hgBackToList() {
  hgStopPolling();
  hgStopBrowserPolling();
  document.getElementById('hgStudio').style.display = 'none';
  document.getElementById('hgLanding').style.display = '';
  hgCurrentProject = null;
  hgCurrentStep = 'avatar';
  hgLoadProjectList();
}

async function hgSaveProject() {
  if (!hgCurrentProject) return;
  const name = document.getElementById('hgProjectName').value.trim();
  if (name) hgCurrentProject.name = name;
  hgCurrentProject.script = document.getElementById('hgScriptInput').value;
  try {
    await hgApi.updateProject(hgCurrentProject.id, hgCurrentProject);
  } catch {}
}

// ── Steps ──
function hgGoStep(step) {
  hgCurrentStep = step;
  // Update step indicators
  const steps = ['avatar', 'script', 'generate'];
  const currentIdx = steps.indexOf(step);
  document.querySelectorAll('.hg-step').forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i === currentIdx) el.classList.add('active');
    else if (i < currentIdx) el.classList.add('completed');
  });
  // Switch panels
  document.querySelectorAll('.hg-panel').forEach(p => p.classList.remove('hg-panel-active'));
  const panelMap = { avatar: 'hgPanelAvatar', script: 'hgPanelScript', generate: 'hgPanelGenerate' };
  const panel = document.getElementById(panelMap[step]);
  if (panel) panel.classList.add('hg-panel-active');

  // Build summary when entering generate step
  if (step === 'generate') {
    hgBuildSummary();
    hgLoadCookies();
    // Show/hide cookies box based on current mode
    const cookiesBox = document.getElementById('hgCookiesBox');
    if (cookiesBox) cookiesBox.style.display = hgUseBrowser ? '' : 'none';
  }
  // Save on step change
  hgSaveProject();
}

// ── Avatars ──
async function hgLoadAvatars() {
  const grid = document.getElementById('hgAvatarGrid');
  grid.innerHTML = '<div class="hg-loading">Loading avatars...</div>';
  try {
    const resp = await hgApi.getAvatars();
    if (resp.error) throw new Error(resp.error);
    // Normalize talking_photos to same shape as avatars
    const talkingPhotos = (resp.data?.talking_photos || []).map(tp => ({
      avatar_id: tp.talking_photo_id,
      avatar_name: tp.talking_photo_name,
      preview_image_url: tp.preview_image_url,
      _type: 'talking_photo'
    }));
    const avatars = (resp.data?.avatars || []).map(a => ({ ...a, _type: 'avatar' }));
    // Put talking photos (custom) first, then regular avatars
    hgAvatars = [...talkingPhotos, ...avatars];
    hgRenderAvatars(hgAvatars);
  } catch (e) {
    grid.innerHTML = `<div class="hg-loading" style="color:#F87171;">Failed to load avatars: ${escHtml(e.message)}</div>`;
  }
}

function hgRenderAvatars(avatars) {
  const grid = document.getElementById('hgAvatarGrid');
  if (avatars.length === 0) {
    grid.innerHTML = '<div class="hg-loading">No avatars found</div>';
    return;
  }
  grid.innerHTML = avatars.slice(0, 80).map(a => `
    <div class="hg-avatar-card ${hgCurrentProject?.avatarId === a.avatar_id ? 'selected' : ''}"
         onclick="hgSelectAvatar('${a.avatar_id}', '${escHtml(a.avatar_name)}', '${escHtml(a.preview_image_url || '')}', '${a._type || 'avatar'}')"
         title="${escHtml(a.avatar_name)}">
      ${a.preview_image_url ? `<img src="${a.preview_image_url}" alt="${escHtml(a.avatar_name)}" loading="lazy">` : `<div style="height:100px;display:flex;align-items:center;justify-content:center;color:#444;font-size:24px;">👤</div>`}
      <div class="hg-avatar-card-name">${escHtml(a.avatar_name)}</div>
      <div class="hg-avatar-check">✓</div>
    </div>
  `).join('');
}

function hgFilterAvatars() {
  const q = (document.getElementById('hgAvatarSearch').value || '').toLowerCase();
  if (!q) return hgRenderAvatars(hgAvatars);
  hgRenderAvatars(hgAvatars.filter(a => (a.avatar_name || '').toLowerCase().includes(q)));
}

function hgSelectAvatar(id, name, thumb, avatarType) {
  if (!hgCurrentProject) return;
  hgCurrentProject.avatarId = id;
  hgCurrentProject.avatarName = name;
  hgCurrentProject.avatarType = avatarType || 'avatar';
  hgCurrentProject.avatarThumb = thumb;
  // Update UI
  document.querySelectorAll('.hg-avatar-card').forEach(card => {
    card.classList.toggle('selected', card.querySelector('img')?.src === thumb || card.getAttribute('onclick')?.includes(id));
  });
  // Re-render to ensure correct selection
  hgRenderAvatars(document.getElementById('hgAvatarSearch').value ? hgAvatars.filter(a => (a.avatar_name || '').toLowerCase().includes(document.getElementById('hgAvatarSearch').value.toLowerCase())) : hgAvatars);
  hgSaveProject();
}

// ── Voices ──
async function hgLoadVoices() {
  const select = document.getElementById('hgVoiceSelect');
  select.innerHTML = '<option value="">Loading voices...</option>';
  try {
    const resp = await hgApi.getVoices();
    if (resp.error) throw new Error(resp.error);
    hgVoices = resp.data?.voices || [];
    hgFilteredVoices = hgVoices;
    hgRenderVoiceOptions(hgVoices);
  } catch (e) {
    select.innerHTML = `<option value="">Failed to load voices</option>`;
  }
}

function hgRenderVoiceOptions(voices) {
  const select = document.getElementById('hgVoiceSelect');
  select.innerHTML = '<option value="">Select a voice...</option>';
  // Separate custom/imported voices: ElevenLabs (preview_audio contains "eleven") or imported (language "unknown")
  const isMyVoice = v => (v.preview_audio || '').toLowerCase().includes('eleven') || v.language === 'unknown';
  const myVoices = voices.filter(isMyVoice);
  const otherVoices = voices.filter(v => !isMyVoice(v));
  // My Voices group first
  if (myVoices.length > 0) {
    const elGroup = document.createElement('optgroup');
    elGroup.label = 'My Voices';
    myVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voice_id;
      opt.textContent = `${v.name} (${v.gender || ''})`;
      opt.dataset.previewAudio = v.preview_audio || '';
      opt.dataset.gender = v.gender || '';
      opt.dataset.name = v.name || '';
      if (hgCurrentProject?.voiceId === v.voice_id) opt.selected = true;
      elGroup.appendChild(opt);
    });
    select.appendChild(elGroup);
  }
  // Group remaining by language
  const groups = {};
  otherVoices.forEach(v => {
    const lang = v.language || 'Other';
    if (!groups[lang]) groups[lang] = [];
    groups[lang].push(v);
  });
  // English first, then alphabetical
  const sortedLangs = Object.keys(groups).sort((a, b) => {
    if (a.startsWith('English')) return -1;
    if (b.startsWith('English')) return 1;
    return a.localeCompare(b);
  });
  sortedLangs.forEach(lang => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = lang;
    groups[lang].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voice_id;
      opt.textContent = `${v.name} (${v.gender || ''})`;
      opt.dataset.previewAudio = v.preview_audio || '';
      opt.dataset.gender = v.gender || '';
      opt.dataset.name = v.name || '';
      if (hgCurrentProject?.voiceId === v.voice_id) opt.selected = true;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  });
}

function hgFilterVoices() {
  const q = (document.getElementById('hgVoiceSearch').value || '').toLowerCase();
  if (!q) return hgRenderVoiceOptions(hgVoices);
  hgRenderVoiceOptions(hgVoices.filter(v =>
    (v.name || '').toLowerCase().includes(q) ||
    (v.language || '').toLowerCase().includes(q)
  ));
}

function hgSelectVoice() {
  if (!hgCurrentProject) return;
  const select = document.getElementById('hgVoiceSelect');
  const opt = select.options[select.selectedIndex];
  if (!opt || !opt.value) return;
  hgCurrentProject.voiceId = opt.value;
  hgCurrentProject.voiceName = opt.dataset.name || opt.textContent;
  // Update preview button
  const previewBtn = document.getElementById('hgVoicePreviewBtn');
  previewBtn.disabled = !opt.dataset.previewAudio;
  // Show voice info
  const info = document.getElementById('hgVoiceInfo');
  info.textContent = opt.dataset.gender ? `${opt.dataset.gender}` : '';
  hgSaveProject();
}

function hgPreviewVoice() {
  const select = document.getElementById('hgVoiceSelect');
  const opt = select.options[select.selectedIndex];
  if (!opt || !opt.dataset.previewAudio) return;
  const audio = document.getElementById('hgVoiceAudio');
  audio.src = opt.dataset.previewAudio;
  audio.play().catch(() => {});
}

// ── Dimensions ──
function hgSetDimension(btn) {
  document.querySelectorAll('.hg-dim-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (hgCurrentProject) {
    hgCurrentProject.dimension = {
      width: parseInt(btn.dataset.w),
      height: parseInt(btn.dataset.h)
    };
    hgSaveProject();
  }
}

// ── Script Loader (from Scripter history) ──
function hgToggleScriptLoader() {
  const dd = document.getElementById('hgScriptLoaderDropdown');
  if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }

  // Read scripter history from localStorage
  let scripts = [];
  try { scripts = JSON.parse(localStorage.getItem('scrHistory') || '[]'); } catch {}

  if (scripts.length === 0) {
    dd.innerHTML = '<div class="hg-sl-empty">No saved scripts yet. Generate one in the Scripter tab.</div>';
  } else {
    dd.innerHTML = scripts.slice(0, 15).map((s, i) => `
      <div class="hg-sl-item" onclick="hgLoadSavedScript(${i})">
        <span class="hg-sl-acr">${s.acr || '?'}</span>
        <span class="hg-sl-topic">${(s.topic || 'Untitled').slice(0, 50)}</span>
      </div>
    `).join('');
  }
  dd.style.display = 'block';

  // Close on outside click
  setTimeout(() => {
    const close = (e) => { if (!dd.contains(e.target) && e.target.id !== 'hgLoadScriptBtn') { dd.style.display = 'none'; document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 0);
}

function hgLoadSavedScript(idx) {
  let scripts = [];
  try { scripts = JSON.parse(localStorage.getItem('scrHistory') || '[]'); } catch {}
  const item = scripts[idx];
  if (!item || !item.script) return;

  // Clean the script: strip labels, pick Hook 1, remove dividers
  const lines = item.script.split('\n');
  const clean = [];
  let pickedHook = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t === '---' || t === '```') continue;
    if (/^FRAMEWORK:/i.test(t)) continue;
    if (/^HOOK\s*\d+:/i.test(t)) {
      if (!pickedHook) { clean.push(t.replace(/^HOOK\s*\d+:\s*/i, '')); pickedHook = true; }
      continue;
    }
    clean.push(t.replace(/^(?:CTA|[A-Z][A-Z &]+(?:\([^)]*\))?):\s*/g, ''));
  }

  const input = document.getElementById('hgScriptInput');
  input.value = clean.filter(Boolean).join('\n\n');
  hgUpdateCharCount();
  document.getElementById('hgScriptLoaderDropdown').style.display = 'none';
  showToast(`Loaded "${item.acr}" script`, 'success');
}

// ── Script ──
function hgUpdateCharCount() {
  const input = document.getElementById('hgScriptInput');
  const count = document.getElementById('hgCharCount');
  const est = document.getElementById('hgEstDuration');
  const len = (input.value || '').length;
  count.textContent = `${len.toLocaleString()} / 5,000`;
  count.style.color = len > 5000 ? '#F87171' : '#666';
  // Rough estimate: ~150 words per minute, ~5 chars per word
  const words = (input.value || '').split(/\s+/).filter(Boolean).length;
  const mins = Math.ceil(words / 150);
  est.textContent = `~${mins} min`;
}

// ── Summary ──
function hgBuildSummary() {
  const el = document.getElementById('hgSummary');
  if (!hgCurrentProject) return;
  const p = hgCurrentProject;
  const dim = p.dimension || { width: 1920, height: 1080 };
  const ratio = dim.width > dim.height ? '16:9' : dim.width < dim.height ? '9:16' : '1:1';
  const scriptPreview = (p.script || '').substring(0, 200) + ((p.script || '').length > 200 ? '...' : '');

  el.innerHTML = `
    <div class="hg-summary-title">Video Summary</div>
    <div class="hg-summary-row">
      <span class="hg-summary-label">Avatar</span>
      <span class="hg-summary-value" style="display:flex;align-items:center;gap:8px;">
        ${p.avatarThumb ? `<img class="hg-summary-avatar" src="${p.avatarThumb}">` : ''}
        ${escHtml(p.avatarName || 'Not selected')}
      </span>
    </div>
    <div class="hg-summary-row">
      <span class="hg-summary-label">Voice</span>
      <span class="hg-summary-value">${escHtml(p.voiceName || 'Not selected')}</span>
    </div>
    <div class="hg-summary-row">
      <span class="hg-summary-label">Resolution</span>
      <span class="hg-summary-value">${dim.width}×${dim.height} (${ratio})</span>
    </div>
    <div class="hg-summary-row">
      <span class="hg-summary-label">Script</span>
      <span class="hg-summary-value">
        <div class="hg-summary-script">${escHtml(scriptPreview) || '<em style="color:#666;">No script written</em>'}</div>
      </span>
    </div>
  `;
}

// ── Mode Toggle ──
function hgSetGenMode(mode) {
  hgUseBrowser = mode === 'browser';
  document.querySelectorAll('.hg-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  // Show/hide cookies box
  const cookiesBox = document.getElementById('hgCookiesBox');
  if (cookiesBox) cookiesBox.style.display = mode === 'browser' ? '' : 'none';
}

// ── Cookies ──
function hgLoadCookies() {
  const input = document.getElementById('hgCookiesInput');
  const status = document.getElementById('hgCookiesStatus');
  if (!input || !hgCurrentProject) return;
  // Load from project
  input.value = hgCurrentProject.cookies || '';
  hgUpdateCookiesStatus();
  // Auto-save on change
  input.onblur = () => {
    if (hgCurrentProject) {
      hgCurrentProject.cookies = input.value.trim();
      hgUpdateCookiesStatus();
      hgSaveProject();
    }
  };
}

function hgUpdateCookiesStatus() {
  const status = document.getElementById('hgCookiesStatus');
  const input = document.getElementById('hgCookiesInput');
  if (!status || !input) return;
  const val = (input.value || '').trim();
  if (val) {
    status.textContent = 'Saved';
    status.className = 'hg-cookies-status saved';
  } else {
    status.textContent = 'Not set';
    status.className = 'hg-cookies-status empty';
  }
}

// ── Generate ──
async function hgGenerate() {
  if (!hgCurrentProject) return;
  const p = hgCurrentProject;

  // Validate
  if (!p.avatarId) { showToast('Please select an avatar first', 'error'); hgGoStep('avatar'); return; }
  if (!p.voiceId) { showToast('Please select a voice first', 'error'); hgGoStep('avatar'); return; }
  if (!p.script || p.script.trim().length < 5) { showToast('Please write a script first', 'error'); hgGoStep('script'); return; }
  if (p.script.length > 5000) { showToast('Script exceeds 5,000 character limit', 'error'); hgGoStep('script'); return; }

  // Save first
  await hgSaveProject();

  // Show progress
  document.getElementById('hgProgress').style.display = 'flex';
  document.getElementById('hgVideoContainer').style.display = 'none';
  document.getElementById('hgGenerateBtn').disabled = true;
  document.getElementById('hgGenerateBtn2').disabled = true;

  if (hgUseBrowser) {
    // Browser mode — free via Creator plan
    // Save cookies to project first
    const cookiesInput = document.getElementById('hgCookiesInput');
    if (cookiesInput) {
      p.cookies = cookiesInput.value.trim();
      await hgSaveProject();
    }
    document.getElementById('hgProgressText').textContent = 'Browser agent starting...';
    document.getElementById('hgProgressSub').textContent = 'Creating task for browser automation';
    try {
      const resp = await hgApi.generateBrowser(p.id);
      if (resp.error) throw new Error(resp.error);
      if (!resp.taskId) throw new Error('No task ID returned');

      p.taskId = resp.taskId;
      p.status = 'browser-pending';
      showToast('Browser generation started!', 'success');
      hgStartBrowserPolling(resp.taskId, p.id);
    } catch (e) {
      document.getElementById('hgProgress').style.display = 'none';
      document.getElementById('hgGenerateBtn').disabled = false;
      document.getElementById('hgGenerateBtn2').disabled = false;
      showToast('Browser generation failed: ' + e.message, 'error');
    }
  } else {
    // API mode — uses credits
    document.getElementById('hgProgressText').textContent = 'Submitting to HeyGen...';
    document.getElementById('hgProgressSub').textContent = 'This may take several minutes';
    try {
      const resp = await hgApi.generate({
        projectId: p.id,
        avatarId: p.avatarId,
        avatarType: p.avatarType || 'avatar',
        voiceId: p.voiceId,
        script: p.script,
        dimension: p.dimension || { width: 1920, height: 1080 },
        title: p.name || 'Untitled Video'
      });

      if (resp.error) throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error));

      const videoId = resp.videoId;
      if (!videoId) throw new Error('No video ID returned');

      p.videoId = videoId;
      p.status = 'pending';
      showToast('Video generation started!', 'success');
      hgStartPolling(videoId);
    } catch (e) {
      document.getElementById('hgProgress').style.display = 'none';
      document.getElementById('hgGenerateBtn').disabled = false;
      document.getElementById('hgGenerateBtn2').disabled = false;
      showToast('Generation failed: ' + e.message, 'error');
    }
  }
}

// ── Polling ──
function hgStartPolling(videoId) {
  document.getElementById('hgProgress').style.display = 'flex';
  document.getElementById('hgVideoContainer').style.display = 'none';
  document.getElementById('hgProgressText').textContent = 'Processing your video...';
  document.getElementById('hgGenerateBtn').disabled = true;
  document.getElementById('hgGenerateBtn2').disabled = true;

  hgStopPolling();
  let pollCount = 0;
  hgPollingInterval = setInterval(async () => {
    pollCount++;
    try {
      const resp = await hgApi.getStatus(videoId);
      const data = resp.data || resp;
      const status = data.status;

      if (status === 'completed') {
        hgStopPolling();
        if (hgCurrentProject) {
          hgCurrentProject.status = 'completed';
          hgCurrentProject.videoUrl = data.video_url;
          hgCurrentProject.thumbnailUrl = data.thumbnail_url;
          hgCurrentProject.duration = data.duration;
          hgSaveProject();
        }
        document.getElementById('hgProgress').style.display = 'none';
        document.getElementById('hgGenerateBtn').disabled = false;
        document.getElementById('hgGenerateBtn2').disabled = false;
        hgShowVideo(data.video_url);
        showToast('Video ready!', 'success');
      } else if (status === 'failed') {
        hgStopPolling();
        if (hgCurrentProject) {
          hgCurrentProject.status = 'failed';
          hgSaveProject();
        }
        document.getElementById('hgProgress').style.display = 'none';
        document.getElementById('hgGenerateBtn').disabled = false;
        document.getElementById('hgGenerateBtn2').disabled = false;
        const errDetail = data.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : 'Unknown error';
        showToast('Video generation failed: ' + errDetail, 'error');
      } else {
        // Still processing
        const elapsed = pollCount * 10;
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        document.getElementById('hgProgressText').textContent = status === 'processing' ? 'Rendering your video...' : 'Waiting in queue...';
        document.getElementById('hgProgressSub').textContent = `Elapsed: ${mins}m ${secs}s`;
        if (hgCurrentProject && hgCurrentProject.status !== status) {
          hgCurrentProject.status = status;
          hgSaveProject();
        }
      }
    } catch (e) {
      // Network error, keep trying
      document.getElementById('hgProgressSub').textContent = 'Checking status...';
    }
  }, 10000); // Poll every 10 seconds
}

function hgStopPolling() {
  if (hgPollingInterval) {
    clearInterval(hgPollingInterval);
    hgPollingInterval = null;
  }
}

// ── Browser Polling ──
function hgStartBrowserPolling(taskId, projectId) {
  document.getElementById('hgProgress').style.display = 'flex';
  document.getElementById('hgVideoContainer').style.display = 'none';
  document.getElementById('hgProgressText').textContent = 'Browser agent working...';
  document.getElementById('hgProgressSub').textContent = 'Automating HeyGen in Chrome';
  document.getElementById('hgGenerateBtn').disabled = true;
  document.getElementById('hgGenerateBtn2').disabled = true;

  hgStopBrowserPolling();
  let pollCount = 0;
  hgBrowserPollingInterval = setInterval(async () => {
    pollCount++;
    const elapsed = pollCount * 5;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    try {
      // Check result file first
      const result = await hgApi.getBrowserResult(projectId);
      if (result.found) {
        hgStopBrowserPolling();
        if (result.status === 'completed' && result.videoUrl) {
          if (hgCurrentProject) {
            hgCurrentProject.status = 'completed';
            hgCurrentProject.videoUrl = result.videoUrl;
            hgSaveProject();
          }
          document.getElementById('hgProgress').style.display = 'none';
          document.getElementById('hgGenerateBtn').disabled = false;
          document.getElementById('hgGenerateBtn2').disabled = false;
          hgShowVideo(result.videoUrl);
          showToast('Video ready! (Browser mode)', 'success');
        } else {
          // Failed result
          if (hgCurrentProject) {
            hgCurrentProject.status = 'failed';
            hgSaveProject();
          }
          document.getElementById('hgProgress').style.display = 'none';
          document.getElementById('hgGenerateBtn').disabled = false;
          document.getElementById('hgGenerateBtn2').disabled = false;
          showToast('Browser generation failed: ' + (result.error || 'Unknown error'), 'error');
        }
        return;
      }

      // Check task status via live endpoint
      try {
        const live = await (await safeFetch(`/api/tasks/${taskId}/live`)).json();
        if (live.detail) {
          document.getElementById('hgProgressText').textContent = 'Browser agent working...';
          document.getElementById('hgProgressSub').textContent = `${live.detail} (${mins}m ${secs}s)`;
        } else {
          document.getElementById('hgProgressSub').textContent = `Elapsed: ${mins}m ${secs}s`;
        }
      } catch {
        document.getElementById('hgProgressSub').textContent = `Elapsed: ${mins}m ${secs}s`;
      }

      // Check if task is done/failed in tasks list
      try {
        const tasksResp = await (await safeFetch('/api/tasks')).json();
        const task = (tasksResp || []).find(t => t.id === taskId);
        if (task && (task.status === 'done' || task.status === 'failed')) {
          // Task finished but no result file yet — wait a bit more, then give up
          if (pollCount > 3 && !result.found) {
            hgStopBrowserPolling();
            if (task.status === 'failed') {
              if (hgCurrentProject) { hgCurrentProject.status = 'failed'; hgSaveProject(); }
              document.getElementById('hgProgress').style.display = 'none';
              document.getElementById('hgGenerateBtn').disabled = false;
              document.getElementById('hgGenerateBtn2').disabled = false;
              showToast('Browser task failed. Check task logs for details.', 'error');
            }
          }
        }
      } catch {}

    } catch (e) {
      document.getElementById('hgProgressSub').textContent = `Checking... (${mins}m ${secs}s)`;
    }
  }, 5000); // Poll every 5 seconds
}

function hgStopBrowserPolling() {
  if (hgBrowserPollingInterval) {
    clearInterval(hgBrowserPollingInterval);
    hgBrowserPollingInterval = null;
  }
}

// ── Video Display ──
function hgShowVideo(url) {
  if (!url) return;
  const container = document.getElementById('hgVideoContainer');
  const player = document.getElementById('hgVideoPlayer');
  const downloadBtn = document.getElementById('hgDownloadBtn');

  container.style.display = '';
  player.src = url;
  downloadBtn.href = url;
  downloadBtn.download = (hgCurrentProject?.name || 'video') + '.mp4';
}

// ── Send to Reel Master ──
function hgSendToReelMaster() {
  if (!hgCurrentProject?.videoUrl) {
    showToast('No video to send', 'error');
    return;
  }
  // Copy URL to clipboard and switch to Reel Master
  navigator.clipboard.writeText(hgCurrentProject.videoUrl).catch(() => {});
  showToast('Video URL copied! Create a new Reel and paste the URL to import.', 'info');
  switchView('reelmaster');
}

// ── Settings ──
function hgOpenSettings() {
  const modal = document.getElementById('hgSettingsModal');
  modal.classList.add('active');
  // Load current settings
  hgApi.getSettings().then(s => {
    if (s.keyPreview) {
      document.getElementById('hgApiKeyInput').placeholder = `Current: ${s.keyPreview}`;
    }
    if (s.loginEmail) {
      document.getElementById('hgLoginEmail').value = s.loginEmail;
    }
    if (s.hasPassword) {
      document.getElementById('hgLoginPassword').placeholder = 'Password saved (enter new to change)';
    }
  }).catch(() => {});
  document.getElementById('hgSettingsStatus').style.display = 'none';
}

function hgToggleKeyVisibility() {
  const input = document.getElementById('hgApiKeyInput');
  const btn = document.getElementById('hgToggleKeyBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

async function hgSaveSettings() {
  const key = document.getElementById('hgApiKeyInput').value.trim();
  if (!key) {
    showToast('Please enter an API key', 'error');
    return;
  }
  const loginEmail = document.getElementById('hgLoginEmail').value.trim();
  const loginPassword = document.getElementById('hgLoginPassword').value;
  try {
    const payload = { apiKey: key };
    if (loginEmail) payload.loginEmail = loginEmail;
    if (loginPassword) payload.loginPassword = loginPassword;
    await safeFetch('/api/heygen/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    hgHasKey = true;
    document.getElementById('hgSettingsModal').classList.remove('active');
    showToast('API key saved!', 'success');
    // Refresh the view
    document.getElementById('hgSetupBanner').style.display = 'none';
    document.getElementById('hgLanding').style.display = '';
    hgLoadProjectList();
  } catch (e) {
    showToast('Failed to save: ' + e.message, 'error');
  }
}

async function hgTestConnection() {
  const key = document.getElementById('hgApiKeyInput').value.trim();
  const status = document.getElementById('hgSettingsStatus');
  const btn = document.getElementById('hgTestBtn');

  if (!key) {
    showToast('Enter an API key first', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testing...';
  status.style.display = 'block';
  status.style.color = '#888';
  status.textContent = 'Connecting to HeyGen...';

  try {
    // Temporarily save the key to test it
    await hgApi.saveSettings(key);
    const resp = await hgApi.getAvatars();
    if (resp.error) throw new Error(resp.error);
    const count = resp.data?.avatars?.length || 0;
    status.style.color = '#4ADE80';
    status.textContent = `✓ Connected! Found ${count} avatars.`;
    hgHasKey = true;
  } catch (e) {
    status.style.color = '#F87171';
    status.textContent = `✕ Failed: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
}
