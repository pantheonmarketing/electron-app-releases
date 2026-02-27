// ════════════════════════════════════════════
// Story Brand Designer
// Design how your story slides look. The AI skill
// uses this design when you create story tasks.
// ════════════════════════════════════════════

let stDesigns = [];
let stCurrentDesign = null;
let stPresets = [];
let stPreviewSlide = 0;
let stInitialized = false;
let stSaveTimer = null;
let stAutoSlideTimer = null;

// ── Quick color presets (built-in) ──
const ST_COLOR_PRESETS = [
  { name: 'Purple',  bg: '#0a0a12', pri: '#7B2FF2', sec: '#C084FC', ter: '#E9D5FF' },
  { name: 'Teal',    bg: '#0a1214', pri: '#0D9488', sec: '#5EEAD4', ter: '#CCFBF1' },
  { name: 'Gold',    bg: '#12100a', pri: '#D97706', sec: '#FCD34D', ter: '#FEF3C7' },
  { name: 'Red',     bg: '#120a0a', pri: '#DC2626', sec: '#FCA5A5', ter: '#FEE2E2' },
  { name: 'Blue',    bg: '#0a0c14', pri: '#2563EB', sec: '#60A5FA', ter: '#DBEAFE' },
  { name: 'Pink',    bg: '#120a10', pri: '#DB2777', sec: '#F472B6', ter: '#FCE7F3' },
];

const ST_FONTS = [
  'Playfair Display', 'Georgia', 'Merriweather', 'Lora',
  'Inter', 'Poppins', 'Montserrat', 'Raleway', 'Roboto', 'Oswald', 'Lato', 'Bebas Neue'
];

// Sample slides for preview — shows how the design looks
const ST_SAMPLE_SLIDES = [
  { type: 'hook', eyebrow: 'STOP SCROLLING', headline: 'I Made $4,200 Last Month', subtext: 'Using Only AI Tools', emphasis: '' },
  { type: 'pain', headline: 'Sound Familiar?', pains: ['Spending hours creating content manually', 'Getting zero engagement on your posts', 'Watching competitors grow while you\'re stuck'] },
  { type: 'shift', headline: "Here's What Changed", actions: ['Trained an AI to write in my voice', 'Automated my entire content pipeline', 'Went from 0 to 2K followers in 30 days'], photo: '' },
  { type: 'proof', big_number: '2,847', label: 'New Followers', context: 'In Just 30 Days' },
  { type: 'cta', nos: ['No filming yourself', 'No editing skills', 'No expensive tools'], price: '$9/mo', button_text: 'JOIN NOW', url: 'skool.com/ai-influencer' },
];

const ST_SLIDE_NAMES = ['Hook', 'Pain', 'Shift', 'Proof', 'CTA'];

// ── API ──
const stApi = {
  async listDesigns() { return (await safeFetch('/api/story/projects')).json(); },
  async createDesign(d) { return (await safeFetch('/api/story/projects', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d||{}) })).json(); },
  async getDesign(id) { return (await safeFetch(`/api/story/projects/${id}`)).json(); },
  async updateDesign(id, d) { return (await safeFetch(`/api/story/projects/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
  async deleteDesign(id) { return (await safeFetch(`/api/story/projects/${id}`, { method:'DELETE' })).json(); },
  async exportDesign(id) { return (await safeFetch(`/api/story/projects/${id}/export`, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })).json(); },
  async listPresets() { return (await safeFetch('/api/story/presets')).json(); },
  async createPreset(d) { return (await safeFetch('/api/story/presets', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
  async deletePreset(id) { return (await safeFetch(`/api/story/presets/${id}`, { method:'DELETE' })).json(); },
};

// ════════════════════════════════════════════
// Init & Design List
// ════════════════════════════════════════════

async function stInit() {
  if (!stInitialized) stInitialized = true;
  stLoadDesignList();
}

async function stLoadDesignList() {
  try { stDesigns = await stApi.listDesigns(); }
  catch (_) { stDesigns = []; }
  stRenderDesignList();
}

function stRenderDesignList() {
  const el = document.getElementById('stProjectList');
  if (!el) return;
  if (stDesigns.length === 0) {
    el.innerHTML = `
      <div class="st-empty">
        <div class="st-empty-icon">🎨</div>
        <div class="st-empty-text">No story designs yet</div>
        <div class="st-empty-sub">Create a brand design for your story slides.<br>Then just tell AI "make story slides about X" and it uses your design.</div>
        <button class="btn btn-primary" onclick="stNewDesign()" style="margin-top:16px;">+ New Design</button>
      </div>`;
    return;
  }
  el.innerHTML = stDesigns.map(p => {
    const c = p.style?.colors || {};
    const pri = c.primary || '#7B2FF2';
    const sec = c.secondary || '#C084FC';
    const bg = c.background || '#0a0a12';
    const date = new Date(p.updated_at).toLocaleDateString();
    const isActive = p.is_active;
    return `
      <div class="st-project-card ${isActive ? 'st-card-active' : ''}" onclick="stOpenDesign('${p.id}')">
        <div class="st-project-preview" style="background:${bg};">
          <div class="st-project-preview-line" style="background:linear-gradient(90deg,${pri},${sec});"></div>
          <div class="st-project-preview-text" style="color:${c.text || '#fff'};">
            <div style="font-size:11px;color:${sec};font-weight:600;letter-spacing:1px;margin-bottom:4px;">STORY</div>
            <div style="font-size:16px;font-weight:700;">Aa</div>
          </div>
          <div class="st-project-preview-dots">
            <span style="background:${pri};"></span><span style="background:${sec};"></span><span style="background:${c.tertiary || '#E9D5FF'};"></span>
          </div>
        </div>
        <div class="st-project-info">
          <div class="st-project-name">${esc(p.name)} ${isActive ? '<span style="color:#4ade80;font-size:11px;margin-left:6px;">● Active</span>' : ''}</div>
          <div class="st-project-meta">${date}</div>
        </div>
        <button class="st-project-delete" onclick="event.stopPropagation(); stDeleteDesign('${p.id}')" title="Delete">&times;</button>
      </div>`;
  }).join('');
}

async function stNewDesign() {
  try {
    const res = await stApi.createDesign({ name: 'My Brand' });
    if (res.ok) {
      stCurrentDesign = res.project;
      stShowDesigner();
    }
  } catch (e) {
    showToast('Failed to create design: ' + e.message, 'error');
  }
}

async function stOpenDesign(id) {
  try {
    stCurrentDesign = await stApi.getDesign(id);
    stShowDesigner();
  } catch (e) {
    showToast('Failed to open design: ' + e.message, 'error');
  }
}

async function stDeleteDesign(id) {
  if (!confirm('Delete this story design?')) return;
  try {
    await stApi.deleteDesign(id);
    stDesigns = stDesigns.filter(p => p.id !== id);
    stRenderDesignList();
    showToast('Design deleted', 'info');
  } catch (_) {}
}

// ════════════════════════════════════════════
// Designer View
// ════════════════════════════════════════════

function stShowDesigner() {
  document.getElementById('stLanding').style.display = 'none';
  document.getElementById('stStudio').style.display = 'flex';
  document.getElementById('stProjectName').value = stCurrentDesign.name || '';

  // Hide step indicators — single page now
  const stepsEl = document.getElementById('stSteps');
  if (stepsEl) stepsEl.style.display = 'none';
  const progressEl = document.getElementById('stStepProgress');
  if (progressEl) progressEl.textContent = 'Design your story brand';

  stLoadPresets();
  stRenderDesigner();
  stStartAutoSlide();
}

function stBackToList() {
  stSaveDesign();
  stStopAutoSlide();
  document.getElementById('stStudio').style.display = 'none';
  document.getElementById('stLanding').style.display = '';
  stCurrentDesign = null;
  stLoadDesignList();
}

function stStartAutoSlide() {
  stStopAutoSlide();
  stAutoSlideTimer = setInterval(() => {
    stPreviewSlide = (stPreviewSlide + 1) % 5;
    stRenderLivePreview();
  }, 3000);
}

function stStopAutoSlide() {
  if (stAutoSlideTimer) { clearInterval(stAutoSlideTimer); stAutoSlideTimer = null; }
}

// ════════════════════════════════════════════
// Save (debounced)
// ════════════════════════════════════════════

function stSaveDesign() {
  if (!stCurrentDesign) return;
  stCurrentDesign.name = document.getElementById('stProjectName')?.value || 'My Brand';
  clearTimeout(stSaveTimer);
  stSaveTimer = setTimeout(async () => {
    try {
      await stApi.updateDesign(stCurrentDesign.id, {
        name: stCurrentDesign.name,
        slides: ST_SAMPLE_SLIDES,
        style: stCurrentDesign.style
      });
    } catch (_) {}
  }, 400);
}

async function stSaveDesignNow() {
  if (!stCurrentDesign) return;
  stCurrentDesign.name = document.getElementById('stProjectName')?.value || 'My Brand';
  await stApi.updateDesign(stCurrentDesign.id, {
    name: stCurrentDesign.name,
    slides: ST_SAMPLE_SLIDES,
    style: stCurrentDesign.style
  });
}

// ════════════════════════════════════════════
// Main Designer Renderer
// ════════════════════════════════════════════

function stRenderDesigner() {
  // Use the Brand panel for everything
  const panel = document.getElementById('stPanelBrand');
  if (!panel) return;

  // Hide other panels, show this one
  document.querySelectorAll('.st-panel').forEach(p => p.classList.remove('st-panel-active'));
  panel.classList.add('st-panel-active');

  const style = stCurrentDesign.style || {};
  const c = style.colors || {};
  const f = style.fonts || {};
  const d = style.decorations || {};

  panel.innerHTML = `
    <div class="st-customize-with-preview">
      <div class="st-controls">
        <!-- Preset bar -->
        <div class="st-section">
          <h4 class="st-section-title">Color Presets</h4>
          <div class="st-preset-picker">
            ${ST_COLOR_PRESETS.map(p => `
              <div class="st-preset-chip ${c.primary === p.pri ? 'active' : ''}" onclick="stApplyColorPreset('${p.bg}','${p.pri}','${p.sec}','${p.ter}')">
                <span class="st-swatch" style="background:linear-gradient(135deg,${p.pri},${p.sec});"></span> ${p.name}
              </div>`).join('')}
          </div>
          <div class="st-preset-saved" id="stSavedPresets"></div>
        </div>

        <!-- Colors -->
        <div class="st-section">
          <h4 class="st-section-title">Colors</h4>
          ${stColorRow('Background', 'colors.background', c.background || '#0a0a12')}
          ${stColorRow('Primary', 'colors.primary', c.primary || '#7B2FF2')}
          ${stColorRow('Secondary', 'colors.secondary', c.secondary || '#C084FC')}
          ${stColorRow('Accent', 'colors.tertiary', c.tertiary || '#E9D5FF')}
          ${stColorRow('Text', 'colors.text', c.text || '#ffffff')}
        </div>

        <!-- Fonts -->
        <div class="st-section">
          <h4 class="st-section-title">Fonts</h4>
          <div class="st-row">
            <span class="st-row-label">Headlines</span>
            <select class="st-select" onchange="stUpdateStyle('fonts.headline', this.value)">
              ${ST_FONTS.map(fn => `<option value="${fn}" ${f.headline === fn ? 'selected' : ''}>${fn}</option>`).join('')}
            </select>
          </div>
          <div class="st-row">
            <span class="st-row-label">Body Text</span>
            <select class="st-select" onchange="stUpdateStyle('fonts.body', this.value)">
              ${ST_FONTS.map(fn => `<option value="${fn}" ${f.body === fn ? 'selected' : ''}>${fn}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Decorations -->
        <div class="st-section">
          <h4 class="st-section-title">Decorations</h4>
          ${stToggleRow('Top gradient line', 'decorations.topLine', d.topLine !== false)}
          ${stToggleRow('Slide indicator (1/5)', 'decorations.slideIndicator', d.slideIndicator !== false)}
          ${stToggleRow('Corner circles', 'decorations.cornerCircles', d.cornerCircles !== false)}
          ${stToggleRow('Background glow', 'decorations.backgroundGlow', d.backgroundGlow !== false)}
        </div>

        <!-- Actions -->
        <div class="st-section" style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="stSetAsActive()" style="width:100%;">✨ Set as Active Design</button>
          <button class="btn btn-ghost btn-sm" onclick="stSaveAsPreset()" style="width:100%;">💾 Save as Preset</button>
          <button class="btn btn-ghost btn-sm" onclick="stTestExport()" style="width:100%;">📤 Test Export (Sample PNGs)</button>
        </div>
      </div>

      <!-- Live preview -->
      <div class="st-preview-side st-preview-side-large">
        <div class="st-preview-slide-label" id="stSlideLabel">${ST_SLIDE_NAMES[stPreviewSlide]} — Slide ${stPreviewSlide + 1}/5</div>
        <div class="st-live-phone st-live-phone-large" id="stLivePhone"></div>
        <div class="st-preview-dots" id="stPreviewDots"></div>
        <div class="st-preview-hint">Sample content — AI generates real content when you create a task</div>
      </div>
    </div>`;

  stRenderSavedPresets();
  stRenderLivePreview();
}

// ════════════════════════════════════════════
// Controls
// ════════════════════════════════════════════

function stColorRow(label, path, value) {
  return `
    <div class="st-row">
      <span class="st-row-label">${label}</span>
      <div class="st-row-value">
        <input type="color" class="st-color-swatch" value="${value}" oninput="stUpdateStyle('${path}', this.value); this.nextElementSibling.value = this.value">
        <input type="text" class="st-color-input" value="${value}" onchange="stUpdateStyle('${path}', this.value); this.previousElementSibling.value = this.value">
      </div>
    </div>`;
}

function stToggleRow(label, path, checked) {
  return `
    <div class="st-row">
      <span class="st-row-label">${label}</span>
      <label class="st-toggle">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="stUpdateStyle('${path}', this.checked)">
        <span class="st-toggle-slider"></span>
      </label>
    </div>`;
}

function stUpdateStyle(path, value) {
  if (!stCurrentDesign) return;
  if (!stCurrentDesign.style) stCurrentDesign.style = {};
  const parts = path.split('.');
  let obj = stCurrentDesign.style;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  stSaveDesign();
  clearTimeout(stUpdateStyle._timer);
  stUpdateStyle._timer = setTimeout(stRenderLivePreview, 100);
}

// ════════════════════════════════════════════
// Presets
// ════════════════════════════════════════════

async function stLoadPresets() {
  try { stPresets = await stApi.listPresets(); }
  catch (_) { stPresets = []; }
}

function stRenderSavedPresets() {
  const el = document.getElementById('stSavedPresets');
  if (!el || stPresets.length === 0) return;
  el.innerHTML = stPresets.map(p => {
    const pri = p.style?.colors?.primary || '#7B2FF2';
    const sec = p.style?.colors?.secondary || '#C084FC';
    return `
      <div class="st-preset-chip" onclick="stApplyPreset('${p.id}')">
        <span class="st-swatch" style="background:linear-gradient(135deg,${pri},${sec});"></span> ${esc(p.name)}
        ${p.id !== 'default-purple' ? `<span class="st-preset-delete" onclick="event.stopPropagation(); stDeletePreset('${p.id}')">&times;</span>` : ''}
      </div>`;
  }).join('');
}

function stApplyColorPreset(bg, pri, sec, ter) {
  stUpdateStyle('colors.background', bg);
  stUpdateStyle('colors.primary', pri);
  stUpdateStyle('colors.secondary', sec);
  stUpdateStyle('colors.tertiary', ter);
  stRenderDesigner();
}

async function stApplyPreset(id) {
  const preset = stPresets.find(p => p.id === id);
  if (preset && preset.style) {
    stCurrentDesign.style = JSON.parse(JSON.stringify(preset.style));
    stSaveDesign();
    stRenderDesigner();
  }
}

async function stSaveAsPreset() {
  const name = prompt('Preset name:');
  if (!name) return;
  try {
    const res = await stApi.createPreset({
      name,
      style: JSON.parse(JSON.stringify(stCurrentDesign.style))
    });
    if (res.ok) {
      stPresets.push(res.preset);
      stRenderSavedPresets();
      showToast('Preset saved!', 'success');
    }
  } catch (_) {}
}

async function stDeletePreset(id) {
  try {
    await stApi.deletePreset(id);
    stPresets = stPresets.filter(p => p.id !== id);
    stRenderSavedPresets();
  } catch (_) {}
}

// ════════════════════════════════════════════
// Set as Active Design
// ════════════════════════════════════════════

async function stSetAsActive() {
  if (!stCurrentDesign) return;
  try {
    await stSaveDesignNow();
    await safeFetch(`/api/story/projects/${stCurrentDesign.id}/set-active`, { method: 'POST' });
    showToast('Design set as active! AI will use this design for new story tasks.', 'success');
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════
// Test Export (Sample PNGs)
// ════════════════════════════════════════════

async function stTestExport() {
  if (!stCurrentDesign) return;
  try {
    showToast('Generating sample PNGs with your design...', 'info');
    await stSaveDesignNow();
    const res = await stApi.exportDesign(stCurrentDesign.id);
    if (res.ok && res.pngs && res.pngs.length > 0) {
      showToast(`${res.pngs.length} sample PNGs exported!`, 'success');
      // Show thumbnails below the preview
      const previewSide = document.querySelector('.st-preview-side-large');
      let exportDiv = document.getElementById('stExportResults');
      if (!exportDiv) {
        exportDiv = document.createElement('div');
        exportDiv.id = 'stExportResults';
        exportDiv.className = 'st-export-results';
        previewSide.appendChild(exportDiv);
      }
      exportDiv.innerHTML = `
        <div style="font-size:11px;color:#4ade80;margin-bottom:6px;">Sample PNGs:</div>
        <div class="st-export-preview">
          ${res.pngs.map((f, i) => `<a href="/${f}" target="_blank"><img src="/${f}?t=${Date.now()}" style="height:80px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);"></a>`).join('')}
        </div>`;
    } else {
      showToast(res.note || 'HTML exported (no Chrome for PNGs)', 'warning');
    }
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════
// Live Preview Engine
// ════════════════════════════════════════════

function stRenderLivePreview() {
  const phoneEl = document.getElementById('stLivePhone');
  const dotsEl = document.getElementById('stPreviewDots');
  const labelEl = document.getElementById('stSlideLabel');
  if (!phoneEl || !stCurrentDesign) return;

  const style = stCurrentDesign.style || {};
  const slide = ST_SAMPLE_SLIDES[stPreviewSlide] || ST_SAMPLE_SLIDES[0];
  const html = stBuildSlidePreview(slide, stPreviewSlide, 5, style);

  phoneEl.innerHTML = `<div class="st-phone-inner">${html}</div>`;

  if (labelEl) labelEl.textContent = `${ST_SLIDE_NAMES[stPreviewSlide]} — Slide ${stPreviewSlide + 1}/5`;

  if (dotsEl) {
    dotsEl.innerHTML = ST_SAMPLE_SLIDES.map((_, i) =>
      `<span class="st-dot ${i === stPreviewSlide ? 'active' : ''}" onclick="stPreviewSlide=${i}; stStopAutoSlide(); stRenderLivePreview();"></span>`
    ).join('');
  }
}

function stBuildSlidePreview(slide, index, total, style) {
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

  const topLine = d.topLine !== false ? `<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${pri},${sec});"></div>` : '';
  const indicator = d.slideIndicator !== false ? `<div style="position:absolute;top:12px;right:12px;font-family:'${bFont}',sans-serif;font-size:7px;font-weight:700;color:${pri};">${index + 1}/${total}</div>` : '';
  const glow = d.backgroundGlow !== false ? `<div style="position:absolute;top:50%;left:50%;width:70%;height:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,${pri}15 0%,transparent 70%);pointer-events:none;"></div>` : '';
  const circles = d.cornerCircles !== false ? `
    <div style="position:absolute;bottom:25px;right:-8px;width:32px;height:32px;border-radius:50%;border:1px solid ${pri}20;pointer-events:none;"></div>` : '';

  let content = '';
  switch (slide.type) {
    case 'hook':
      content = `
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:16px;">
          ${slide.eyebrow ? `<div style="font-family:'${bFont}',sans-serif;font-size:6px;font-weight:600;letter-spacing:1.5px;color:${sec};margin-bottom:8px;text-transform:uppercase;">${esc(slide.eyebrow)}</div>` : ''}
          <div style="font-family:'${hFont}',serif;font-size:18px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;margin-bottom:6px;">${esc(slide.headline || '')}</div>
          ${slide.subtext ? `<div style="font-size:8px;font-weight:500;color:${txt}cc;line-height:1.3;">${esc(slide.subtext)}</div>` : ''}
          ${slide.emphasis ? `<div style="font-family:'${hFont}',serif;font-size:10px;font-weight:700;color:${sec};margin-top:6px;font-style:italic;">${esc(slide.emphasis)}</div>` : ''}
        </div>`;
      break;
    case 'pain':
      const pains = (slide.pains || []).slice(0, 3).map(p => `
        <div style="padding:6px 8px 6px 10px;border-left:2px solid ${pri};margin-bottom:5px;position:relative;">
          <div style="font-size:7px;font-weight:500;color:${txt}dd;line-height:1.3;">${esc(p)}</div>
        </div>`).join('');
      content = `
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:16px;">
          <div style="font-family:'${hFont}',serif;font-size:14px;font-weight:800;margin-bottom:12px;">${esc(slide.headline || '')}</div>
          ${pains}
        </div>`;
      break;
    case 'shift':
      const actions = (slide.actions || []).slice(0, 3).map(a => `
        <div style="display:flex;align-items:flex-start;gap:4px;margin-bottom:4px;">
          <div style="width:6px;height:6px;border-radius:50%;background:${pri};flex-shrink:0;margin-top:2px;"></div>
          <div style="font-size:7px;font-weight:500;color:${txt}dd;line-height:1.3;">${esc(a)}</div>
        </div>`).join('');
      content = `
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:16px;justify-content:center;">
          <div style="font-family:'${hFont}',serif;font-size:14px;font-weight:800;margin-bottom:10px;">${esc(slide.headline || '')}</div>
          ${actions}
        </div>`;
      break;
    case 'proof':
      content = `
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:16px;">
          <div style="font-family:'${hFont}',serif;font-size:42px;font-weight:900;line-height:1;background:linear-gradient(135deg,${pri},${sec});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${esc(slide.big_number || '0')}</div>
          <div style="font-size:10px;font-weight:700;margin-top:4px;letter-spacing:0.5px;">${esc(slide.label || '')}</div>
          <div style="font-size:7px;color:${txt}99;margin-top:3px;">${esc(slide.context || '')}</div>
        </div>`;
      break;
    case 'cta':
      const nos = (slide.nos || []).slice(0, 3).map(n => `
        <div style="font-size:7px;font-weight:500;color:${txt}cc;margin-bottom:3px;">
          <span style="color:${pri};margin-right:3px;">✕</span> ${esc(n)}
        </div>`).join('');
      content = `
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:16px;">
          ${nos}
          <div style="width:100%;height:1px;background:linear-gradient(90deg,transparent,${pri}40,transparent);margin:8px 0;"></div>
          <div style="text-align:center;">
            ${slide.price ? `<div style="font-family:'${hFont}',serif;font-size:22px;font-weight:900;background:linear-gradient(135deg,${pri},${sec});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px;">${esc(slide.price)}</div>` : ''}
            <div style="display:inline-block;padding:5px 16px;background:linear-gradient(135deg,${pri},${sec});border-radius:12px;font-size:7px;font-weight:700;color:#fff;letter-spacing:0.5px;">${esc(slide.button_text || 'JOIN NOW')}</div>
            ${slide.url ? `<div style="font-size:5px;color:${txt}66;margin-top:4px;">${esc(slide.url)}</div>` : ''}
          </div>
        </div>`;
      break;
  }

  return `
    <div style="width:100%;height:100%;position:relative;overflow:hidden;background:${bg};color:${txt};font-family:'${bFont}',sans-serif;border-radius:8px;">
      ${topLine}${indicator}${glow}${circles}
      ${content}
    </div>`;
}

// ── Helpers ──
// Uses global esc() from board.js (escHtml)
