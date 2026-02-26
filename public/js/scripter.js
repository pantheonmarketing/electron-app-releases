/**
 * scripter.js — AI Video Script Generator
 * Pick a framework, describe your topic, get a perfectly structured script.
 */

// ── State ──
let scrHistory = [];
let scrSelectedFramework = null;
let scrGenerating = false;
let scrInitialized = false;

// ── Frameworks Data ──
const SCR_FRAMEWORKS = [
  { id: 'bandwagon', name: 'Bandwagon', acr: 'CROWD', desc: 'Leverage social proof & movement', color: '#7B2FF2' },
  { id: 'contrarian', name: 'Contrarian', acr: 'DISRUPT', desc: 'Expose industry secrets & myths', color: '#E04B6A' },
  { id: 'listicle', name: 'Listicle', acr: 'CURE', desc: 'Numbered list hooks', color: '#F59E0B' },
  { id: 'founder', name: 'Founder', acr: 'FOUNDER', desc: 'Humanize with founder story', color: '#10B981' },
  { id: 'how-you-can', name: 'How You Can X', acr: 'SIMPLE', desc: 'Minimal solution for busy people', color: '#3B82F6' },
  { id: 'organic', name: 'Organic', acr: 'PURE', desc: 'Raw & authentic real-life content', color: '#8B5CF6' },
  { id: 'pas', name: 'PAS', acr: 'PAS', desc: 'Pain → Agitate → Solution', color: '#EF4444' },
  { id: 'ugly-ads', name: 'Ugly Ads', acr: 'UGLY', desc: 'Anti-polished, gritty & real', color: '#F97316' },
  { id: 'founder-objections', name: 'Objections', acr: 'PROVE', desc: 'Crush skepticism with proof', color: '#06B6D4' },
  { id: 'us-vs-them', name: 'Us VS Them', acr: 'SHOW', desc: 'Challenge-style comparison', color: '#EC4899' },
  { id: 'triple-g', name: 'Triple G', acr: 'GGG', desc: 'Goal → Gap → Gains', color: '#84CC16' },
  { id: 'tease', name: 'Curiosity Loop', acr: 'TEASE', desc: 'Impossible claim → reveal', color: '#A855F7' },
];

// ── Init ──
function scrInit() {
  if (scrInitialized) return;
  scrInitialized = true;
  scrRenderFrameworks();
  scrLoadHistory();
  scrRenderHistory();
}

// ── Framework Selection ──
function scrRenderFrameworks() {
  const grid = document.getElementById('scrFrameworkGrid');
  if (!grid) return;
  grid.innerHTML = SCR_FRAMEWORKS.map(f => `
    <div class="scr-fw-card ${scrSelectedFramework === f.id ? 'active' : ''}"
         data-fw="${f.id}" onclick="scrSelectFramework('${f.id}')">
      <div class="scr-fw-acr" style="color:${f.color}">${f.acr}</div>
      <div class="scr-fw-name">${f.name}</div>
      <div class="scr-fw-desc">${f.desc}</div>
    </div>
  `).join('');
}

function scrSelectFramework(id) {
  scrSelectedFramework = id;
  document.querySelectorAll('.scr-fw-card').forEach(c => {
    c.classList.toggle('active', c.dataset.fw === id);
  });
}

// ── Generate ──
async function scrGenerate() {
  if (scrGenerating) return;
  if (!scrSelectedFramework) { showToast('Pick a framework first', 'error'); return; }

  const topicEl = document.getElementById('scrTopic');
  const rewriteEl = document.getElementById('scrRewrite');
  const topic = topicEl.value.trim();
  if (!topic) { showToast('Describe your topic', 'error'); return; }

  const rewriteScript = rewriteEl.value.trim() || null;
  const fw = SCR_FRAMEWORKS.find(f => f.id === scrSelectedFramework);

  scrGenerating = true;
  const btn = document.getElementById('scrGenerateBtn');
  const output = document.getElementById('scrOutput');
  const empty = document.getElementById('scrEmptyState');

  btn.disabled = true;
  btn.textContent = 'Generating...';
  if (empty) empty.style.display = 'none';
  output.innerHTML = '<div class="scr-loading"><div class="scr-spinner"></div><div>Writing your script with ' + fw.name + ' framework...</div></div>';

  try {
    const resp = await fetch('/api/scripter/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ framework: fw.name, topic, rewriteScript })
    });
    const data = await resp.json();

    if (data.ok) {
      scrRenderScript(data.script);
      // Save to history
      scrHistory.unshift({
        framework: fw.name,
        acr: fw.acr,
        topic: topic.slice(0, 60),
        script: data.script,
        generated_at: data.generated_at || new Date().toISOString()
      });
      if (scrHistory.length > 20) scrHistory = scrHistory.slice(0, 20);
      scrSaveHistory();
      scrRenderHistory();
    } else {
      output.innerHTML = `<div class="scr-error">Generation failed: ${data.error || 'Unknown error'}</div>`;
    }
  } catch (e) {
    output.innerHTML = `<div class="scr-error">Error: ${e.message}</div>`;
  }

  btn.disabled = false;
  btn.textContent = 'Generate Script';
  scrGenerating = false;
}

function scrRenderScript(text) {
  const output = document.getElementById('scrOutput');
  // Format the script with section highlighting
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const formatted = escaped
    .replace(/^(FRAMEWORK:.*)/gm, '<div class="scr-section-label">$1</div>')
    .replace(/^(HOOK \d+:)/gm, '<span class="scr-hook-label">$1</span>')
    .replace(/^(CTA:)/gm, '<span class="scr-cta-label">$1</span>')
    .replace(/^(\[.*?\]:)/gm, '<span class="scr-section-name">$1</span>')
    .replace(/^(---)/gm, '<hr class="scr-divider">')
    // Bold section headers like "CALL OUT THE MOVEMENT:" or "PROBLEM:"
    .replace(/^([A-Z][A-Z &]+(?:\([^)]*\))?:)/gm, '<span class="scr-section-name">$1</span>');

  output.innerHTML = `
    <div class="scr-script-content">${formatted}</div>
    <div class="scr-script-actions">
      <button class="btn btn-primary btn-sm" onclick="scrCopyClean()">Copy Clean Script</button>
      <button class="btn btn-ghost btn-sm" onclick="scrCopyScript()">Copy Full</button>
      <button class="btn btn-ghost btn-sm" onclick="scrSendToHeyGen()">Use in HeyGen</button>
    </div>
  `;
}

function scrCopyClean() {
  const content = document.querySelector('.scr-script-content');
  if (!content) return;
  const raw = content.innerText;
  const lines = raw.split('\n');
  const clean = [];
  let pickedHook = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty, framework header, dividers, backticks
    if (!trimmed || trimmed === '---' || trimmed === '```') continue;
    if (/^FRAMEWORK:/i.test(trimmed)) continue;

    // Pick only HOOK 1, skip the rest
    if (/^HOOK\s*\d+:/i.test(trimmed)) {
      if (!pickedHook) {
        clean.push(trimmed.replace(/^HOOK\s*\d+:\s*/i, ''));
        pickedHook = true;
      }
      continue;
    }

    // Strip section labels (CTA:, PROBLEM:, AGITATE:, etc.)
    const stripped = trimmed.replace(/^(?:CTA|[A-Z][A-Z &]+(?:\([^)]*\))?):\s*/g, '');
    if (stripped) clean.push(stripped);
  }

  const result = clean.join('\n\n');
  navigator.clipboard.writeText(result).then(() => {
    showToast('Clean script copied — ready to paste!', 'success');
  }).catch(() => showToast('Failed to copy', 'error'));
}

function scrCopyScript() {
  const content = document.querySelector('.scr-script-content');
  if (!content) return;
  navigator.clipboard.writeText(content.innerText).then(() => {
    showToast('Script copied to clipboard', 'success');
  }).catch(() => showToast('Failed to copy', 'error'));
}

function scrSendToHeyGen() {
  // Copy clean version for HeyGen teleprompter
  const content = document.querySelector('.scr-script-content');
  if (!content) return;
  // Reuse clean logic
  const btn = document.querySelector('.scr-script-actions button');
  scrCopyClean();
  showToast('Clean script copied! Paste it in HeyGen.', 'info');
  switchView('heygen');
}

// ── History ──
function scrLoadHistory() {
  try {
    const raw = localStorage.getItem('scrHistory');
    if (raw) scrHistory = JSON.parse(raw);
  } catch { scrHistory = []; }
}

function scrSaveHistory() {
  try {
    localStorage.setItem('scrHistory', JSON.stringify(scrHistory));
  } catch {}
}

function scrRenderHistory() {
  const list = document.getElementById('scrHistoryList');
  if (!list) return;
  if (scrHistory.length === 0) {
    list.innerHTML = '<div class="scr-history-empty">No scripts yet</div>';
    return;
  }
  list.innerHTML = scrHistory.slice(0, 10).map((h, i) => `
    <div class="scr-history-item" onclick="scrLoadFromHistory(${i})">
      <span class="scr-history-acr">${h.acr}</span>
      <span class="scr-history-topic">${h.topic}</span>
    </div>
  `).join('');
}

function scrLoadFromHistory(idx) {
  const item = scrHistory[idx];
  if (!item) return;
  scrRenderScript(item.script);
  document.getElementById('scrEmptyState').style.display = 'none';
}
