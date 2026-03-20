// ════════════════════════════════════════════
// Story Slides — New Flow
// 1. Paste text + pick options → Generate Preview
// 2. Edit slides + live preview → Generate PNGs
// 3. View results + Open Folder
// ════════════════════════════════════════════

let sSlides = [];
let sStyle = null;
let sSelectedSlide = 0;
let sProjectId = null;
let sSourceText = '';
let sExportDir = null;
let sPreviewDebounce = null;

const S_COLOR_PRESETS = [
  { name: 'Purple',  bg: '#0a0a12', pri: '#7B2FF2', sec: '#C084FC', ter: '#E9D5FF' },
  { name: 'Teal',    bg: '#0a1214', pri: '#0D9488', sec: '#5EEAD4', ter: '#CCFBF1' },
  { name: 'Gold',    bg: '#12100a', pri: '#D97706', sec: '#FCD34D', ter: '#FEF3C7' },
  { name: 'Red',     bg: '#120a0a', pri: '#DC2626', sec: '#FCA5A5', ter: '#FEE2E2' },
  { name: 'Blue',    bg: '#0a0c14', pri: '#2563EB', sec: '#60A5FA', ter: '#DBEAFE' },
  { name: 'Pink',    bg: '#120a10', pri: '#DB2777', sec: '#F472B6', ter: '#FCE7F3' },
];

const S_FONTS = [
  'Playfair Display', 'Georgia', 'Merriweather', 'Lora',
  'Inter', 'Poppins', 'Montserrat', 'Raleway', 'Bebas Neue', 'Oswald',
];

const S_SLIDE_LABELS = { hook: 'Hook', pain: 'Pain', shift: 'Shift', proof: 'Proof', cta: 'CTA' };

function sDefaultStyle() {
  return {
    colors: { background: '#0a0a12', primary: '#7B2FF2', secondary: '#C084FC', tertiary: '#E9D5FF', text: '#ffffff' },
    fonts: { headline: 'Playfair Display', body: 'Inter' },
    decorations: { topLine: true, slideIndicator: true, cornerCircles: true, backgroundGlow: true }
  };
}

// ════════════════════════════════════════════
// Init
// ════════════════════════════════════════════

function sInit() {
  // Load saved style from localStorage
  try {
    const saved = localStorage.getItem('story_style');
    if (saved) sStyle = JSON.parse(saved);
  } catch (_) {}
  if (!sStyle) sStyle = sDefaultStyle();

  sShowView('sInputView');
  sRenderColorPresets();
  sRestoreInput();
  sLoadProjects();
}

// ════════════════════════════════════════════
// Project List (save/load)
// ════════════════════════════════════════════

let sProjects = [];

async function sLoadProjects() {
  try {
    const res = await safeFetch('/api/story/projects');
    const data = await res.json();
    sProjects = Array.isArray(data) ? data : [];
    sRenderProjectList();
  } catch (e) {
    sProjects = [];
  }
}

function sRenderProjectList() {
  const el = document.getElementById('sProjectList');
  if (!el) return;
  if (sProjects.length === 0) {
    el.innerHTML = '<div class="s-proj-empty">No saved projects yet. Generate your first story above!</div>';
    return;
  }
  el.innerHTML = sProjects.map(p => {
    const date = new Date(p.updated_at || p.created_at || Date.now()).toLocaleDateString();
    const slides = p.slide_count || 0;
    return `
      <div class="s-proj-card" onclick="sLoadProject('${p.id}')">
        <div class="s-proj-card-del" onclick="event.stopPropagation(); sDeleteProject('${p.id}')" title="Delete">×</div>
        <div class="s-proj-card-name">${escHtml(p.name || 'Untitled')}</div>
        <div class="s-proj-card-meta">${slides} slide${slides !== 1 ? 's' : ''} · ${date}</div>
      </div>`;
  }).join('');
}

async function sLoadProject(id) {
  try {
    const res = await safeFetch(`/api/story/projects/${id}`);
    const data = await res.json();
    if (!data || !data.slides) { showToast('Could not load project', 'error'); return; }
    sSlides = data.slides;
    sStyle = data.style || sDefaultStyle();
    sProjectId = id;
    sSelectedSlide = 0;
    sExportDir = data.export_dir || null;
    sSaveStyle();
    sShowEditorView();
    showToast('Project loaded', 'success');
  } catch (e) {
    showToast('Failed to load project: ' + e.message, 'error');
  }
}

async function sDeleteProject(id) {
  if (!confirm('Delete this story project?')) return;
  try {
    await safeFetch(`/api/story/projects/${id}`, { method: 'DELETE' });
    sProjects = sProjects.filter(p => p.id !== id);
    sRenderProjectList();
    showToast('Project deleted', 'info');
  } catch (e) {
    showToast('Failed to delete: ' + e.message, 'error');
  }
}

function sShowView(id) {
  ['sInputView', 'sEditorView', 'sResultView'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = v === id ? '' : 'none';
  });
}

// ════════════════════════════════════════════
// Step 1: Input View
// ════════════════════════════════════════════

function sRenderColorPresets() {
  const el = document.getElementById('sColorPresets');
  if (!el) return;
  el.innerHTML = S_COLOR_PRESETS.map((p, i) => `
    <div class="s-preset-chip ${sStyle.colors.primary === p.pri ? 'active' : ''}"
         onclick="sApplyColorPreset(${i})" title="${p.name}">
      <span class="s-swatch" style="background:linear-gradient(135deg,${p.pri},${p.sec})"></span>
      <span>${p.name}</span>
    </div>`).join('');
}

function sApplyColorPreset(i) {
  const p = S_COLOR_PRESETS[i];
  sStyle.colors.background = p.bg;
  sStyle.colors.primary = p.pri;
  sStyle.colors.secondary = p.sec;
  sStyle.colors.tertiary = p.ter;
  sSaveStyle();
  sRenderColorPresets();
  if (sProjectId) sRefreshPreview();
}

function sSaveStyle() {
  try { localStorage.setItem('story_style', JSON.stringify(sStyle)); } catch (_) {}
}

function sRestoreInput() {
  const saved = sessionStorage.getItem('story_last_text');
  if (saved) {
    const ta = document.getElementById('sTextInput');
    if (ta) ta.value = saved;
  }
}

async function sGeneratePreview() {
  const ta = document.getElementById('sTextInput');
  const text = ta ? ta.value.trim() : '';
  if (!text) { showToast('Paste some text first', 'warning'); return; }

  const countEl = document.querySelector('.s-count-btn.active');
  const count = countEl ? parseInt(countEl.dataset.count) : 5;

  sessionStorage.setItem('story_last_text', text);
  sSourceText = text;

  const btn = document.getElementById('sGenerateBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  try {
    const res = await safeFetch('/api/story/generate-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, slide_count: count, style: sStyle })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Generation failed');

    sSlides = data.slides;
    sProjectId = data.project_id;
    sSelectedSlide = 0;
    sShowEditorView();
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Generate Preview';
  }
}

function sSetSlideCount(count) {
  document.querySelectorAll('.s-count-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.count) === count));
}

// ════════════════════════════════════════════
// Step 2: Editor View
// ════════════════════════════════════════════

function sShowEditorView() {
  sShowView('sEditorView');
  sRenderSlideList();
  sRenderSlideEditor(0);
  sRenderStylePanel();
  sRefreshPreview();
}

function sRenderSlideList() {
  const el = document.getElementById('sSlideList');
  if (!el) return;
  el.innerHTML = sSlides.map((slide, i) => `
    <div class="s-slide-tab ${i === sSelectedSlide ? 'active' : ''}" onclick="sSelectSlide(${i})">
      <span class="s-slide-num">${i + 1}</span>
      <span class="s-slide-type">${S_SLIDE_LABELS[slide.type] || slide.type}</span>
      <span class="s-slide-preview-text">${sSlidePreviewText(slide)}</span>
    </div>`).join('');
}

function sSlidePreviewText(slide) {
  const text = slide.headline || slide.eyebrow || (slide.pains && slide.pains[0]) || (slide.actions && slide.actions[0]) || slide.big_number || '';
  return escHtml(text.slice(0, 30)) + (text.length > 30 ? '…' : '');
}

function sSelectSlide(i) {
  sSelectedSlide = i;
  sRenderSlideList();
  sRenderSlideEditor(i);
  sRefreshPreview();
}

function sRenderSlideEditor(i) {
  const el = document.getElementById('sSlideFields');
  if (!el || !sSlides[i]) return;
  const slide = sSlides[i];
  let html = `<div class="s-editor-header">
    <span class="s-editor-slide-label">Slide ${i + 1} — ${S_SLIDE_LABELS[slide.type] || slide.type}</span>
    <button class="s-regen-btn" onclick="sRegenSlide(${i})" title="Rewrite with AI">🔄 Rewrite</button>
  </div>`;

  switch (slide.type) {
    case 'hook':
      html += sField('Eyebrow', `sSlides[${i}].eyebrow`, slide.eyebrow || '', 'short label (e.g. REAL TALK)');
      html += sField('Headline', `sSlides[${i}].headline`, slide.headline || '', 'main bold statement');
      html += sField('Subtext', `sSlides[${i}].subtext`, slide.subtext || '', 'supporting line');
      html += sField('Emphasis', `sSlides[${i}].emphasis`, slide.emphasis || '', 'strong ending (optional)');
      break;
    case 'pain':
      html += sField('Headline', `sSlides[${i}].headline`, slide.headline || '');
      html += sList('Pain Points', i, 'pains', slide.pains || []);
      break;
    case 'shift':
      html += sField('Headline', `sSlides[${i}].headline`, slide.headline || '');
      html += sList('Bullet Points', i, 'actions', slide.actions || []);
      break;
    case 'proof':
      html += sField('Big Number', `sSlides[${i}].big_number`, slide.big_number || '');
      html += sField('Label', `sSlides[${i}].label`, slide.label || '');
      html += sField('Context', `sSlides[${i}].context`, slide.context || '');
      break;
    case 'cta':
      html += sList('"No X" Lines', i, 'nos', slide.nos || []);
      html += sField('Price', `sSlides[${i}].price`, slide.price || '');
      html += sField('Button Text', `sSlides[${i}].button_text`, slide.button_text || 'JOIN NOW');
      html += sField('URL', `sSlides[${i}].url`, slide.url || '');
      break;
  }

  // Image upload for any slide
  const hasImg = !!slide.photo;
  const photoPos = slide.photo_pos || 'bottom-center';
  const photoSize = slide.photo_size || 50;
  const photoEffect = slide.photo_effect || 'shadow';

  const posGrid = [
    ['top-left','top-center','top-right'],
    ['center-left','center','center-right'],
    ['bottom-left','bottom-center','bottom-right'],
  ].map(row => row.map(p =>
    `<div class="s-pos-cell ${photoPos === p ? 'active' : ''}" onclick="sSetPhotoPos(${i},'${p}')" title="${p}"></div>`
  ).join('')).join('');

  const effects = ['none','shadow','glow','circle','rounded','fade'];
  const effectChips = effects.map(e =>
    `<button type="button" class="s-effect-chip ${photoEffect === e ? 'active' : ''}" onclick="sSetPhotoEffect(${i},'${e}')">${e}</button>`
  ).join('');

  html += `<div class="s-image-section">
    <div class="s-image-row">
      <span class="s-field-label">Photo (optional)</span>
      <div class="s-image-actions">
        <input type="file" id="sPhotoInput-${i}" accept="image/*" style="display:none" onchange="sUploadPhoto(event,${i})">
        <button type="button" class="s-img-upload-btn" onclick="document.getElementById('sPhotoInput-${i}').click()">
          📷 ${hasImg ? 'Change' : 'Add Photo'}
        </button>
        ${hasImg ? `<button type="button" class="s-img-remove-btn" onclick="sRemovePhoto(${i})">✕ Remove</button>` : ''}
      </div>
    </div>
    ${hasImg ? `
    <div class="s-photo-controls">
      <div class="s-photo-ctrl-row">
        <span class="s-photo-ctrl-label">Position</span>
        <div class="s-pos-grid">${posGrid}</div>
      </div>
      <div class="s-photo-ctrl-row">
        <span class="s-photo-ctrl-label">Size <span id="sPhotoSizeVal-${i}">${photoSize}%</span></span>
        <input type="range" class="s-size-slider" min="20" max="90" value="${photoSize}"
          oninput="sSetPhotoSize(${i},this.value)">
      </div>
      <div class="s-photo-ctrl-row">
        <span class="s-photo-ctrl-label">Effect</span>
        <div class="s-effect-chips">${effectChips}</div>
      </div>
    </div>` : ''}
  </div>`;

  el.innerHTML = html;
}

function sField(label, path, value, placeholder = '') {
  const isLong = value.length > 40 || label === 'Subtext' || label === 'Emphasis';
  const id = 's_field_' + path.replace(/[^a-z0-9]/gi, '_');
  if (isLong) {
    return `<div class="s-field">
      <label class="s-field-label">${label}</label>
      <textarea class="s-field-textarea" id="${id}" placeholder="${placeholder}"
        oninput="sSetField('${path}', this.value)">${escHtml(value)}</textarea>
    </div>`;
  }
  return `<div class="s-field">
    <label class="s-field-label">${label}</label>
    <input type="text" class="s-field-input" id="${id}" value="${escHtml(value)}" placeholder="${placeholder}"
      oninput="sSetField('${path}', this.value)">
  </div>`;
}

function sList(label, slideIdx, field, items) {
  const rows = items.map((item, j) => `
    <div class="s-list-row">
      <input type="text" class="s-field-input" value="${escHtml(item)}"
        oninput="sSetListItem(${slideIdx},'${field}',${j},this.value)">
      <button class="s-list-remove" onclick="sRemoveListItem(${slideIdx},'${field}',${j})">✕</button>
    </div>`).join('');
  return `<div class="s-field">
    <label class="s-field-label">${label}</label>
    ${rows}
    <button class="s-list-add" onclick="sAddListItem(${slideIdx},'${field}')">+ Add</button>
  </div>`;
}

function sSetField(path, value) {
  // path like "sSlides[0].headline"
  const match = path.match(/sSlides\[(\d+)\]\.(.+)/);
  if (!match) return;
  const idx = parseInt(match[1]);
  const key = match[2];
  if (sSlides[idx]) sSlides[idx][key] = value;
  sDebouncedPreview();
}

function sSetListItem(slideIdx, field, itemIdx, value) {
  if (sSlides[slideIdx] && Array.isArray(sSlides[slideIdx][field])) {
    sSlides[slideIdx][field][itemIdx] = value;
    sDebouncedPreview();
  }
}

function sAddListItem(slideIdx, field) {
  if (sSlides[slideIdx]) {
    if (!Array.isArray(sSlides[slideIdx][field])) sSlides[slideIdx][field] = [];
    sSlides[slideIdx][field].push('');
    sRenderSlideEditor(slideIdx);
    sDebouncedPreview();
  }
}

function sRemoveListItem(slideIdx, field, itemIdx) {
  if (sSlides[slideIdx] && Array.isArray(sSlides[slideIdx][field])) {
    sSlides[slideIdx][field].splice(itemIdx, 1);
    sRenderSlideEditor(slideIdx);
    sDebouncedPreview();
  }
}

async function sUploadPhoto(event, slideIdx) {
  const file = event.target.files[0];
  if (!file || !sProjectId) return;
  const fd = new FormData();
  fd.append('photo', file);
  try {
    const res = await safeFetch(`/api/story/projects/${sProjectId}/upload-photo`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.ok) {
      sSlides[slideIdx].photo = data.path;
      // Set defaults if not already set
      if (!sSlides[slideIdx].photo_pos) sSlides[slideIdx].photo_pos = 'bottom-center';
      if (!sSlides[slideIdx].photo_size) sSlides[slideIdx].photo_size = 50;
      if (!sSlides[slideIdx].photo_effect) sSlides[slideIdx].photo_effect = 'shadow';
      sRenderSlideEditor(slideIdx);
      sDebouncedPreview();
    }
  } catch (e) { showToast('Upload failed: ' + e.message, 'error'); }
}

function sRemovePhoto(slideIdx) {
  sSlides[slideIdx].photo = '';
  sRenderSlideEditor(slideIdx);
  sDebouncedPreview();
}

function sSetPhotoPos(slideIdx, pos) {
  sSlides[slideIdx].photo_pos = pos;
  sRenderSlideEditor(slideIdx);
  sDebouncedPreview();
}

function sSetPhotoSize(slideIdx, size) {
  sSlides[slideIdx].photo_size = parseInt(size);
  document.getElementById(`sPhotoSizeVal-${slideIdx}`).textContent = size + '%';
  sDebouncedPreview();
}

function sSetPhotoEffect(slideIdx, effect) {
  sSlides[slideIdx].photo_effect = effect;
  sRenderSlideEditor(slideIdx);
  sDebouncedPreview();
}

function sPrevSlide() {
  if (sSelectedSlide > 0) sSelectSlide(sSelectedSlide - 1);
}

function sNextSlide() {
  if (sSelectedSlide < sSlides.length - 1) sSelectSlide(sSelectedSlide + 1);
}

async function sRegenSlide(slideIdx) {
  const slide = sSlides[slideIdx];
  if (!slide) return;
  const btn = document.querySelector('.s-regen-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Rewriting...'; }
  try {
    const res = await safeFetch('/api/story/regenerate-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sSourceText, slide_type: slide.type })
    });
    const data = await res.json();
    if (data.ok && data.slide) {
      sSlides[slideIdx] = data.slide;
      sRenderSlideList();
      sRenderSlideEditor(slideIdx);
      sRefreshPreview();
      showToast('Slide rewritten!', 'success');
    }
  } catch (e) { showToast('Rewrite failed: ' + e.message, 'error'); }
  finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Rewrite'; }
  }
}

// ════════════════════════════════════════════
// Style Panel
// ════════════════════════════════════════════

function sRenderStylePanel() {
  const el = document.getElementById('sStylePanel');
  if (!el) return;
  const c = sStyle.colors;
  const f = sStyle.fonts;
  const d = sStyle.decorations;

  el.innerHTML = `
    <div class="s-style-section">
      <div class="s-style-label">Colors</div>
      <div class="s-preset-row" id="sColorPresets"></div>
      <div class="s-color-grid">
        ${sColorRow('BG', 'background', c.background)}
        ${sColorRow('Primary', 'primary', c.primary)}
        ${sColorRow('Secondary', 'secondary', c.secondary)}
        ${sColorRow('Text', 'text', c.text)}
      </div>
    </div>
    <div class="s-style-section">
      <div class="s-style-label">Fonts</div>
      <select class="s-select" onchange="sSetStyleProp('fonts.headline',this.value)">
        ${S_FONTS.map(fn => `<option ${f.headline===fn?'selected':''} value="${fn}">${fn}</option>`).join('')}
      </select>
    </div>
    <div class="s-style-section">
      <div class="s-style-label">Decorations</div>
      ${sToggle('Top line', 'decorations.topLine', d.topLine !== false)}
      ${sToggle('Slide indicator', 'decorations.slideIndicator', d.slideIndicator !== false)}
      ${sToggle('Corner circles', 'decorations.cornerCircles', d.cornerCircles !== false)}
      ${sToggle('Background glow', 'decorations.backgroundGlow', d.backgroundGlow !== false)}
    </div>`;

  sRenderColorPresets();
}

function sColorRow(label, key, value) {
  return `<div class="s-color-row">
    <span>${label}</span>
    <input type="color" value="${value}" oninput="sSetStyleColor('${key}',this.value)">
  </div>`;
}

function sToggle(label, path, checked) {
  return `<div class="s-toggle-row">
    <span>${label}</span>
    <label class="st-toggle"><input type="checkbox" ${checked?'checked':''} onchange="sSetStyleProp('${path}',this.checked)"><span class="st-toggle-slider"></span></label>
  </div>`;
}

function sSetStyleColor(key, value) {
  sStyle.colors[key] = value;
  sSaveStyle();
  sDebouncedPreview();
}

function sSetStyleProp(path, value) {
  const parts = path.split('.');
  let obj = sStyle;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  sSaveStyle();
  sDebouncedPreview();
}

// ════════════════════════════════════════════
// Live Preview (iframe)
// ════════════════════════════════════════════

function sDebouncedPreview() {
  clearTimeout(sPreviewDebounce);
  sPreviewDebounce = setTimeout(sRefreshPreview, 300);
}

async function sRefreshPreview() {
  if (!sProjectId) return;
  try {
    await safeFetch(`/api/story/projects/${sProjectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: sSlides, style: sStyle })
    });
  } catch (_) {}

  const iframe = document.getElementById('sPreviewFrame');
  if (!iframe) return;
  // Scale 1080px content into 210px preview (scale = 210/1080 ≈ 0.194)
  // Use position:absolute + transformOrigin '0 0' so it clips correctly inside .s-phone-wrap
  const scale = 210 / 1080;
  iframe.style.position = 'absolute';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '1080px';
  iframe.style.height = '1920px';
  iframe.style.transform = `scale(${scale})`;
  iframe.style.transformOrigin = '0 0';
  iframe.src = `/api/story/projects/${sProjectId}/preview/${sSelectedSlide}?t=${Date.now()}`;

  // Render preview dots
  const dotsEl = document.getElementById('sPreviewDots');
  if (dotsEl) {
    dotsEl.innerHTML = sSlides.map((_, i) =>
      `<div class="s-preview-dot ${i === sSelectedSlide ? 'active' : ''}" onclick="sPreviewSlide(${i})"></div>`
    ).join('');
  }
}

function sPreviewSlide(i) {
  sSelectedSlide = i;
  sRenderSlideList();
  sRenderSlideEditor(i);
  sRefreshPreview();
  // Update dots
  document.querySelectorAll('.s-preview-dot').forEach((d, idx) => d.classList.toggle('active', idx === i));
}

// ════════════════════════════════════════════
// Step 3: Generate PNGs
// ════════════════════════════════════════════

async function sGeneratePNGs() {
  if (!sProjectId || !sSlides.length) return;

  // Save latest state first
  try {
    await safeFetch(`/api/story/projects/${sProjectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: sSlides, style: sStyle })
    });
  } catch (_) {}

  sShowView('sResultView');
  sRenderResultView('generating');

  try {
    const res = await safeFetch(`/api/story/projects/${sProjectId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const data = await res.json();

    if (data.ok && data.pngs && data.pngs.length > 0) {
      sExportDir = data.export_dir;
      sRenderResultView('done', data.pngs);
    } else {
      sRenderResultView('error', [], data.note || 'Export failed');
    }
  } catch (e) {
    sRenderResultView('error', [], e.message);
  }
}

function sRenderResultView(state, pngs = [], message = '') {
  const el = document.getElementById('sResultContent');
  if (!el) return;

  if (state === 'generating') {
    el.innerHTML = `
      <div class="s-generating">
        <div class="s-gen-spinner"></div>
        <div class="s-gen-title">Rendering your slides...</div>
        <div class="s-gen-sub">Launching headless browser, rendering at 1080×1920px</div>
        <div class="s-gen-dots">
          ${sSlides.map((_, i) => `<div class="s-gen-dot" id="sGenDot${i}"></div>`).join('')}
        </div>
      </div>`;
    // Animate dots while waiting
    let dot = 0;
    const dotInterval = setInterval(() => {
      document.querySelectorAll('.s-gen-dot').forEach((d, i) => d.classList.toggle('active', i === dot));
      dot = (dot + 1) % sSlides.length;
    }, 400);
    el._dotInterval = dotInterval;
    return;
  }

  if (el._dotInterval) clearInterval(el._dotInterval);

  if (state === 'error') {
    el.innerHTML = `
      <div class="s-result-error">
        <div class="s-result-error-title">⚠️ Export issue</div>
        <div class="s-result-error-msg">${escHtml(message)}</div>
        <div class="s-result-actions">
          <button class="s-back-btn" onclick="sShowEditorView()">← Back to Editor</button>
        </div>
      </div>`;
    return;
  }

  // Done — reveal slides one by one
  const slideCards = pngs.map((p, i) => `
    <div class="s-result-card" id="sResultCard${i}" style="opacity:0;transform:translateY(16px)">
      <div class="s-result-num">${i + 1}</div>
      <a href="/${p}" target="_blank">
        <img src="/${p}?t=${Date.now()}" class="s-result-thumb" alt="Slide ${i+1}">
      </a>
      <div class="s-result-card-label">${S_SLIDE_LABELS[sSlides[i]?.type] || 'Slide'}</div>
    </div>`).join('');

  el.innerHTML = `
    <div class="s-result-header">
      <div class="s-result-title">✅ ${pngs.length} slides ready</div>
      <div class="s-result-sub">1080×1920px • Ready for FB/IG Stories</div>
    </div>
    <div class="s-result-grid">${slideCards}</div>
    <div class="s-result-actions">
      <button class="s-open-folder-btn" onclick="sOpenFolder()">📁 Open Folder</button>
      <button class="s-back-btn" onclick="sShowEditorView()">← Back to Editor</button>
      <button class="s-restart-btn" onclick="sStartOver()">🔄 New Story</button>
    </div>`;

  // Animate cards in one by one
  pngs.forEach((_, i) => {
    setTimeout(() => {
      const card = document.getElementById(`sResultCard${i}`);
      if (card) { card.style.transition = 'opacity 0.3s ease, transform 0.3s ease'; card.style.opacity = '1'; card.style.transform = 'translateY(0)'; }
    }, i * 150);
  });
}

async function sOpenFolder() {
  if (!sExportDir) return;
  try {
    await safeFetch('/api/story/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: sExportDir })
    });
  } catch (_) {}
}

function sStartOver() {
  sSlides = [];
  sProjectId = null;
  sExportDir = null;
  sSelectedSlide = 0;
  sShowView('sInputView');
  sLoadProjects();
}

// ── Helpers ──
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
