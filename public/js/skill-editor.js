/**
 * skill-editor.js — Skill management hub with categorized list,
 * search, filters, requirement status, AI chat, version history, highlights.
 */

let seSkills = [];
let seSelectedSkill = null;
let seSkillContent = null;
let seShowingContent = false;
let seHighlights = null;
let seVersions = null;
let seShowVersions = false;
let seChatSessionId = null;
let seChatEventSource = null;
let seActiveFilter = 'all';
let seCollapsedCategories = {};

const SE_CATEGORY_ORDER = [
  { key: 'content',       label: 'Content Creation', icon: '\u270d\ufe0f' },
  { key: 'video',         label: 'Video Production', icon: '\ud83c\udfac' },
  { key: 'social',        label: 'Social Media',     icon: '\ud83d\udcf1' },
  { key: 'monitoring',    label: 'Monitoring',        icon: '\ud83d\udcca' },
  { key: 'communication', label: 'Communication',     icon: '\ud83d\udce7' },
  { key: 'web',           label: 'Web & Courses',     icon: '\ud83c\udf10' },
  { key: 'ai-tools',      label: 'AI Tools',          icon: '\ud83e\udd16' },
];

async function openSkillEditor() {
  const overlay = document.getElementById('skillEditorOverlay');
  overlay.classList.add('active');
  seSelectedSkill = null;
  seSkillContent = null;
  seShowingContent = false;
  seHighlights = null;
  seVersions = null;
  seShowVersions = false;
  seActiveFilter = 'all';
  seCloseChatSession();
  const searchInput = document.getElementById('seSearchInput');
  if (searchInput) searchInput.value = '';
  // Reset filter tabs
  document.querySelectorAll('.se-filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
  await seLoadSkills();
}

function closeSkillEditor() {
  document.getElementById('skillEditorOverlay').classList.remove('active');
  seCloseChatSession();
}

function seCloseChatSession() {
  if (seChatEventSource) { seChatEventSource.close(); seChatEventSource = null; }
  seChatSessionId = null;
}

async function seLoadSkills() {
  try {
    const resp = await fetch('/api/skills?check=true');
    seSkills = await resp.json();
  } catch (e) {
    seSkills = [];
  }
  seRenderStatusSummary();
  seRenderList();
  seRenderDetail();
}

// ── Status Summary ──
function seGetSkillStatus(skill) {
  if (!skill.requirements_status || skill.requirements_status.length === 0) return 'ready';
  const hasMissing = skill.requirements_status.some(r => r.status === 'missing');
  if (hasMissing) return 'needs-setup';
  const hasManual = skill.requirements_status.some(r => r.status === 'manual');
  if (hasManual) return 'manual';
  return 'ready';
}

function seRenderStatusSummary() {
  const el = document.getElementById('seStatusSummary');
  if (!el) return;
  let ready = 0, needsSetup = 0, manual = 0;
  for (const s of seSkills) {
    const st = seGetSkillStatus(s);
    if (st === 'ready') ready++;
    else if (st === 'needs-setup') needsSetup++;
    else manual++;
  }
  const parts = [];
  if (ready > 0) parts.push(`<span class="se-sum-ready">${ready} ready</span>`);
  if (needsSetup > 0) parts.push(`<span class="se-sum-setup">${needsSetup} need setup</span>`);
  if (manual > 0) parts.push(`<span class="se-sum-manual">${manual} manual</span>`);
  el.innerHTML = parts.join(' <span class="se-sum-dot">\u00b7</span> ');
}

// ── Filtering ──
function seSetFilter(filter) {
  seActiveFilter = filter;
  document.querySelectorAll('.se-filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
  seRenderList();
}

function seFilterList() {
  seRenderList();
}

function seGetFilteredSkills() {
  const query = (document.getElementById('seSearchInput')?.value || '').toLowerCase().trim();
  return seSkills.filter(s => {
    // Search filter
    if (query) {
      const searchable = [s.name, s.display_name || '', s.description, s.plain_description || ''].join(' ').toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    // Tab filter
    if (seActiveFilter === 'ready') return seGetSkillStatus(s) === 'ready';
    if (seActiveFilter === 'setup') return seGetSkillStatus(s) === 'needs-setup';
    return true;
  });
}

// ── List Rendering ──
function seRenderList() {
  const list = document.getElementById('seSkillList');
  const filtered = seGetFilteredSkills();

  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding:20px;color:#555;font-size:13px;text-align:center;">No skills match your search.</div>';
    return;
  }

  // Group by category
  const groups = {};
  for (const s of filtered) {
    const cat = s.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }

  let html = '';
  for (const catDef of SE_CATEGORY_ORDER) {
    const items = groups[catDef.key];
    if (!items || items.length === 0) continue;
    const isCollapsed = seCollapsedCategories[catDef.key];
    html += `<div class="se-category-group">
      <div class="se-category-header" onclick="seToggleCategory('${catDef.key}')">
        <span class="se-category-arrow">${isCollapsed ? '\u25b6' : '\u25bc'}</span>
        <span class="se-category-icon">${catDef.icon}</span>
        <span class="se-category-label">${catDef.label}</span>
        <span class="se-category-count">${items.length}</span>
      </div>`;
    if (!isCollapsed) {
      for (const s of items) {
        const isSelected = seSelectedSkill === s.name;
        const status = seGetSkillStatus(s);
        let statusIcon = '';
        if (status === 'ready') statusIcon = '<span class="se-status-circle se-sc-ready">\u2713</span>';
        else if (status === 'needs-setup') statusIcon = '<span class="se-status-circle se-sc-missing">!</span>';
        else statusIcon = '<span class="se-status-circle se-sc-manual">?</span>';
        const icon = s.icon || '';
        const displayName = s.display_name || s.name;
        html += `<div class="se-skill-item${isSelected ? ' active' : ''}${!s.exists ? ' missing' : ''}" onclick="seSelectSkill('${s.name}')">
          <div class="se-skill-name">${statusIcon}<span class="se-skill-icon">${icon}</span>${escHtml(displayName)}</div>
          <div class="se-skill-desc">${escHtml(s.description)}</div>
        </div>`;
      }
    }
    html += '</div>';
  }

  // Handle uncategorized
  if (groups['other']) {
    for (const s of groups['other']) {
      const isSelected = seSelectedSkill === s.name;
      const status = seGetSkillStatus(s);
      let statusIcon = '<span class="se-status-circle se-sc-manual">?</span>';
      if (status === 'ready') statusIcon = '<span class="se-status-circle se-sc-ready">\u2713</span>';
      else if (status === 'needs-setup') statusIcon = '<span class="se-status-circle se-sc-missing">!</span>';
      html += `<div class="se-skill-item${isSelected ? ' active' : ''}" onclick="seSelectSkill('${s.name}')">
        <div class="se-skill-name">${statusIcon}${escHtml(s.display_name || s.name)}</div>
        <div class="se-skill-desc">${escHtml(s.description)}</div>
      </div>`;
    }
  }

  list.innerHTML = html;
}

function seToggleCategory(key) {
  seCollapsedCategories[key] = !seCollapsedCategories[key];
  seRenderList();
}

// ── Skill Selection ──
async function seSelectSkill(name) {
  seSelectedSkill = name;
  seSkillContent = null;
  seShowingContent = false;
  seHighlights = null;
  seVersions = null;
  seShowVersions = false;
  seCloseChatSession();
  seRenderList();

  // Fade in detail panel
  const panel = document.getElementById('seDetailPanel');
  panel.style.opacity = '0';
  seRenderDetail();
  requestAnimationFrame(() => { panel.style.opacity = '1'; });

  // Load highlights async
  try {
    const resp = await fetch(`/api/skills/${encodeURIComponent(name)}/highlights`);
    const data = await resp.json();
    if (data.highlights && data.highlights.length > 0) {
      seHighlights = data.highlights;
      seRenderDetail();
    }
  } catch (e) { /* no highlights */ }
}

// ── Detail Panel ──
function seRenderDetail() {
  const panel = document.getElementById('seDetailPanel');
  if (!seSelectedSkill) {
    panel.innerHTML = '<div class="se-empty">Select a skill from the list to view details and configure it.</div>';
    return;
  }

  const skill = seSkills.find(s => s.name === seSelectedSkill);
  if (!skill) { panel.innerHTML = ''; return; }

  const hasConfig = skill.config && skill.config.length > 0;
  const configValues = skill.config_values || {};
  const reqStatusMap = {};
  if (skill.requirements_status) {
    for (const rs of skill.requirements_status) reqStatusMap[rs.name] = rs;
  }

  const displayName = skill.display_name || skill.name;
  const icon = skill.icon || '';
  const skillStatus = seGetSkillStatus(skill);

  // 1. Header
  let headerHtml = `<div class="se-detail-header">
    <h3 class="se-detail-name">${icon ? `<span class="se-detail-icon">${icon}</span>` : ''}${escHtml(displayName)}</h3>
    <span class="se-skill-id">${escHtml(skill.name)}</span>
    ${!skill.exists ? '<span class="se-badge-missing">File missing</span>' : ''}
  </div>`;

  // 2. Status banner
  let bannerHtml = '';
  if (skillStatus === 'needs-setup' && skill.requirements_status) {
    const missingCount = skill.requirements_status.filter(r => r.status === 'missing').length;
    bannerHtml = `<div class="se-status-banner se-banner-warning">
      <span class="se-banner-icon">\u26a0\ufe0f</span>
      <span>This skill needs <strong>${missingCount} item${missingCount > 1 ? 's' : ''}</strong> set up before it can run.</span>
    </div>`;
  }

  // 3. Description
  let descHtml = '';
  if (skill.plain_description) {
    descHtml = `<p class="se-plain-desc">${escHtml(skill.plain_description)}</p>
      <p class="se-detail-desc">${escHtml(skill.description)}</p>`;
  } else {
    descHtml = `<p class="se-plain-desc">${escHtml(skill.description)}</p>`;
  }
  if (skill.context_notes) {
    descHtml += `<div class="se-context-note">${escHtml(skill.context_notes)}</div>`;
  }

  // 4. Highlights
  let highlightHtml = '';
  if (seHighlights && seHighlights.length > 0) {
    highlightHtml = '<div class="se-highlights">';
    for (const h of seHighlights) {
      if (h.type === 'list' && h.data && h.data.length > 0) {
        highlightHtml += `<div class="se-highlight-label">${escHtml(h.label)}</div>`;
        highlightHtml += '<div class="se-highlight-tags">';
        for (const item of h.data) {
          highlightHtml += `<span class="se-highlight-tag">${escHtml(item)}</span>`;
        }
        highlightHtml += '</div>';
      } else if (h.type === 'field' && h.data) {
        highlightHtml += `<div class="se-highlight-field"><span class="se-highlight-label">${escHtml(h.label)}:</span> <span class="se-highlight-value">${escHtml(h.data)}</span></div>`;
      } else if (h.type === 'table' && h.data && h.data.length > 0) {
        highlightHtml += `<div class="se-highlight-label">${escHtml(h.label)}</div>`;
        highlightHtml += '<div class="se-highlight-table">';
        for (const row of h.data) {
          highlightHtml += `<div class="se-highlight-row">${row.map(c => `<span>${escHtml(c)}</span>`).join('')}</div>`;
        }
        highlightHtml += '</div>';
      }
    }
    highlightHtml += '</div>';
  }

  // 5. Requirements as setup checklist
  let reqHtml = '';
  if (skill.requirements && skill.requirements.length > 0) {
    const readyCount = skill.requirements.filter(r => (reqStatusMap[r]?.status || 'manual') === 'ok').length;
    const total = skill.requirements.length;
    const hasMissing = skill.requirements.some(r => (reqStatusMap[r]?.status) === 'missing');
    const collapseClass = hasMissing ? '' : ' se-checklist-collapsed';

    reqHtml = `<div class="se-requirements">
      <div class="se-checklist-header" onclick="this.parentElement.classList.toggle('se-checklist-collapsed')">
        <h4 class="se-section-title">Requirements <span class="se-req-count">${readyCount} of ${total} ready</span></h4>
        <span class="se-checklist-toggle">\u25bc</span>
      </div>
      <ul class="se-req-list${collapseClass}">`;
    for (const req of skill.requirements) {
      const rs = reqStatusMap[req] || { status: 'manual', fix: null };
      const status = rs.status;
      const icon = status === 'ok' ? '\u2713' : status === 'missing' ? '\u2717' : '?';
      const cls = status === 'ok' ? 'se-req-ok' : status === 'missing' ? 'se-req-missing' : 'se-req-manual';
      let fixHtml = '';
      if (status === 'missing' && rs.fix) {
        fixHtml = `<div class="se-req-fix">${escHtml(rs.fix)}</div>`;
      }
      reqHtml += `<li class="se-req-item ${cls}">
        <span class="se-req-icon">${icon}</span>
        <div class="se-req-content">
          <span class="se-req-name">${escHtml(req)}</span>
          ${fixHtml}
        </div>
      </li>`;
    }
    reqHtml += '</ul></div>';
  }

  // 6. Config section
  let configHtml = '';
  if (hasConfig) {
    configHtml = '<div class="se-config-section"><h4 class="se-section-title">Your Settings</h4>';
    for (const field of skill.config) {
      if (field.type === 'info') {
        configHtml += `<div class="se-config-info">
          <span class="se-config-label">${escHtml(field.label)}</span>
          ${field.hint ? `<span class="se-config-hint">${escHtml(field.hint)}</span>` : ''}
        </div>`;
      } else if (field.type === 'textarea') {
        configHtml += `<div class="se-config-field">
          <label class="se-config-label">${escHtml(field.label)}</label>
          ${field.hint ? `<div class="se-config-hint">${escHtml(field.hint)}</div>` : ''}
          <textarea class="se-input" data-key="${field.key}" placeholder="${escHtml(field.placeholder || '')}" rows="3">${escHtml(configValues[field.key] || '')}</textarea>
        </div>`;
      } else {
        configHtml += `<div class="se-config-field">
          <label class="se-config-label">${escHtml(field.label)}</label>
          ${field.hint ? `<div class="se-config-hint">${escHtml(field.hint)}</div>` : ''}
          <input type="${field.type === 'url' ? 'url' : 'text'}" class="se-input" data-key="${field.key}" placeholder="${escHtml(field.placeholder || '')}" value="${escHtml(configValues[field.key] || '')}">
        </div>`;
      }
    }
    configHtml += '<button class="se-save-btn" onclick="seSaveConfig()">Save Settings</button>';
    configHtml += '<div class="se-save-msg" id="seSaveMsg"></div>';
    configHtml += '</div>';
  }

  // 7. AI Chat section
  let chatHtml = '';
  if (skill.exists) {
    let chipsHtml = '';
    const prompts = skill.chat_prompts || ['Add a new feature', 'Change a setting', 'Fix an issue'];
    chipsHtml = '<div class="se-chat-chips">' +
      prompts.map(p => `<button class="se-chat-chip" onclick="seFillChat('${escHtml(p)}')">${escHtml(p)}</button>`).join('') +
      '</div>';

    chatHtml = `<div class="se-chat-section">
      <h4 class="se-section-title">Ask AI to Edit This Skill</h4>
      ${chipsHtml}
      <div class="se-chat-output" id="seChatOutput"></div>
      <div class="se-chat-input-bar">
        <span class="se-chat-prompt">\u276f</span>
        <input type="text" id="seChatInput" placeholder="Tell AI what to change..." onkeydown="if(event.key==='Enter'){seSendChat();event.preventDefault()}">
        <button class="se-chat-send" onclick="seSendChat()">Send</button>
      </div>
    </div>`;
  }

  // 8. Toggle buttons
  const contentToggle = `<div class="se-content-toggle">
    <button class="se-toggle-btn${seShowingContent ? ' active' : ''}" onclick="seToggleContent()">
      ${seShowingContent ? 'Hide' : 'View'} Full Skill
    </button>
    <button class="se-toggle-btn${seShowVersions ? ' active' : ''}" onclick="seToggleVersions()">
      ${seShowVersions ? 'Hide' : 'Show'} History
    </button>
  </div>`;

  // 9. Content preview
  const contentPreview = seShowingContent && seSkillContent
    ? `<pre class="se-content-preview">${escHtml(seSkillContent)}</pre>`
    : seShowingContent ? '<div class="se-loading">Loading...</div>' : '';

  // 10. Version list
  let versionHtml = '';
  if (seShowVersions && seVersions !== null) {
    versionHtml = '<div class="se-versions">';
    if (seVersions.length === 0) {
      versionHtml += '<div class="se-version-empty">No version history yet.</div>';
    } else {
      for (const v of seVersions.slice(0, 20)) {
        const date = new Date(v.timestamp);
        const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        versionHtml += `<div class="se-version-item">
          <span class="se-version-time">${timeStr}</span>
          <span class="se-version-label">${escHtml(v.label || 'Auto-save')}</span>
          <button class="se-version-btn se-version-preview" onclick="sePreviewVersion('${v.filename}')">Preview</button>
          <button class="se-version-btn se-version-revert" onclick="seRevertVersion('${v.filename}')">Revert</button>
        </div>`;
      }
    }
    versionHtml += '</div>';
  }

  panel.innerHTML = `
    ${headerHtml}
    ${bannerHtml}
    ${descHtml}
    ${highlightHtml}
    ${reqHtml}
    ${configHtml}
    ${chatHtml}
    ${contentToggle}
    ${contentPreview}
    ${versionHtml}`;
}

// ── Chat chips ──
function seFillChat(text) {
  const input = document.getElementById('seChatInput');
  if (input) { input.value = text; input.focus(); }
}

// ── Toggle Content ──
async function seToggleContent() {
  seShowingContent = !seShowingContent;
  if (seShowingContent && !seSkillContent) {
    seRenderDetail();
    try {
      const resp = await fetch(`/api/skills/${encodeURIComponent(seSelectedSkill)}/content`);
      const data = await resp.json();
      seSkillContent = data.content || '(empty)';
    } catch (e) {
      seSkillContent = '(Failed to load skill content)';
    }
  }
  seRenderDetail();
}

// ── Toggle Versions ──
async function seToggleVersions() {
  seShowVersions = !seShowVersions;
  if (seShowVersions && seVersions === null) {
    try {
      const resp = await fetch(`/api/skills/${encodeURIComponent(seSelectedSkill)}/versions`);
      const data = await resp.json();
      seVersions = data.versions || [];
    } catch (e) { seVersions = []; }
  }
  seRenderDetail();
}

async function sePreviewVersion(filename) {
  try {
    const resp = await fetch(`/api/skills/${encodeURIComponent(seSelectedSkill)}/versions/${encodeURIComponent(filename)}`);
    const data = await resp.json();
    seSkillContent = data.content;
    seShowingContent = true;
    seRenderDetail();
  } catch (e) {}
}

async function seRevertVersion(filename) {
  if (!confirm('Revert to this version? Current file will be saved as a new version first.')) return;
  try {
    const resp = await fetch(`/api/skills/${encodeURIComponent(seSelectedSkill)}/versions/${encodeURIComponent(filename)}/revert`, { method: 'POST' });
    const data = await resp.json();
    if (data.ok) {
      seVersions = null;
      seSkillContent = null;
      seShowingContent = false;
      seShowVersions = false;
      seRenderDetail();
    }
  } catch (e) {}
}

// ── Save Config ──
async function seSaveConfig() {
  const inputs = document.querySelectorAll('#seDetailPanel .se-input');
  const config_values = {};
  inputs.forEach(el => {
    const key = el.dataset.key;
    const val = el.value.trim();
    if (key && val) config_values[key] = val;
  });

  const msgEl = document.getElementById('seSaveMsg');
  try {
    const resp = await fetch(`/api/skills/${encodeURIComponent(seSelectedSkill)}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_values })
    });
    const data = await resp.json();
    if (data.ok) {
      msgEl.textContent = 'Saved!';
      msgEl.className = 'se-save-msg se-save-ok';
      const skill = seSkills.find(s => s.name === seSelectedSkill);
      if (skill) skill.config_values = data.config_values;
      seRenderList();
      setTimeout(() => { msgEl.textContent = ''; msgEl.className = 'se-save-msg'; }, 2000);
      // Re-check requirements after save (API keys may have changed)
      seReloadRequirements();
    } else {
      msgEl.textContent = data.error || 'Save failed';
      msgEl.className = 'se-save-msg se-save-err';
    }
  } catch (e) {
    msgEl.textContent = 'Error: ' + e.message;
    msgEl.className = 'se-save-msg se-save-err';
  }
}

async function seReloadRequirements() {
  try {
    const resp = await fetch('/api/skills?check=true');
    seSkills = await resp.json();
    seRenderStatusSummary();
    seRenderList();
    seRenderDetail();
  } catch (e) {}
}

// ── AI Chat ──
async function seSendChat() {
  const input = document.getElementById('seChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const output = document.getElementById('seChatOutput');
  if (output) {
    output.textContent += `\u276f ${text}\n\n`;
    output.scrollTop = output.scrollHeight;
  }

  try {
    const resp = await fetch(`/api/skills/${encodeURIComponent(seSelectedSkill)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await resp.json();
    if (!data.ok) {
      if (output) output.textContent += `Error: ${data.error || 'Failed'}\n`;
      return;
    }
    if (data.sessionId && data.sessionId !== seChatSessionId) {
      if (seChatEventSource) seChatEventSource.close();
      seChatSessionId = data.sessionId;
      seChatEventSource = new EventSource(`/api/terminal/sessions/${data.sessionId}/stream`);
      seChatEventSource.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const out = document.getElementById('seChatOutput');
        if (!out) return;
        if (msg.type === 'output' || msg.type === 'catchup') {
          out.textContent += msg.data;
          out.scrollTop = out.scrollHeight;
        }
      };
    }
  } catch (e) {
    if (output) output.textContent += `Error: ${e.message}\n`;
  }
}

// escHtml() is defined in board.js — reuse it
