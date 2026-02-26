/**
 * scripter.js — AI Video Script Generator
 * Pick a mode (Ads/Social), framework, voice, duration — get a perfectly structured script.
 */

// ── State ──
let scrHistory = [];
let scrSelectedFramework = null;
let scrGenerating = false;
let scrInitialized = false;
let scrMode = 'ads'; // 'ads' or 'social'

// ── Frameworks Data ──
const SCR_FRAMEWORKS_ADS = [
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

const SCR_FRAMEWORKS_SOCIAL = [
  { id: 'storytime', name: 'Storytime', acr: 'STORY', desc: 'Personal story with twist ending', color: '#7B2FF2' },
  { id: 'hot-take', name: 'Hot Take', acr: 'TAKE', desc: 'Controversial opinion → proof', color: '#E04B6A' },
  { id: 'tutorial', name: 'Quick Tutorial', acr: 'HOW', desc: 'Step-by-step value drop', color: '#F59E0B' },
  { id: 'before-after', name: 'Before / After', acr: 'GLOW', desc: 'Transformation reveal', color: '#10B981' },
  { id: 'pov', name: 'POV', acr: 'POV', desc: '"POV: you just..." relatable moment', color: '#3B82F6' },
  { id: 'myth-bust', name: 'Myth Buster', acr: 'MYTH', desc: 'Common belief → actually wrong', color: '#8B5CF6' },
  { id: 'ranking', name: 'Ranking / Tier', acr: 'RANK', desc: 'Rate or rank things (S/A/B/F tier)', color: '#EF4444' },
  { id: 'rant', name: 'Mini Rant', acr: 'RANT', desc: 'Passionate rant that builds to a point', color: '#F97316' },
  { id: 'day-in-life', name: 'Day in My Life', acr: 'VLOG', desc: 'Lifestyle vlog with hook + payoff', color: '#06B6D4' },
  { id: 'challenge', name: 'Challenge', acr: 'DARE', desc: 'Try something wild → share results', color: '#EC4899' },
  { id: 'list-dump', name: 'Info Dump', acr: 'LIST', desc: 'Rapid-fire list people save & share', color: '#84CC16' },
  { id: 'reply-stitch', name: 'Reply / Stitch', acr: 'REACT', desc: 'React to comment or viral take', color: '#A855F7' },
];

// ── Voice Presets ──
const SCR_VOICE_PRESETS = {
  '': null,
  'genz': 'Gen Z creator (18-22). Uses slang like "no because", "literally", "lowkey", "slay", "ate that", "the way I—", "bestie". Short punchy sentences. Talks fast. Heavy emphasis words in ALL CAPS. Uses "?" even in statements. Chaotic but endearing energy.',
  'professional': 'Professional coach/expert (30-45). Measured, authoritative tone. Uses "here\'s the thing", "most people don\'t realize", "let me break this down". Clean grammar. Confident pauses. Data-driven. Commands respect without being stuffy.',
  'relatable-mom': 'Relatable mom/woman (28-40). Warm, conversational. Uses "okay so", "I\'m shook", "game changer", "mama", "hear me out". Run-on sentences that feel like texting a friend. Genuine excitement. Practical, real-life context.',
  'hype-bro': 'Hype bro / hustle culture (25-35). High energy. Uses "bro", "listen", "this is insane", "no cap", "let\'s go", "I\'m telling you". Bold claims. Urgency. Fast pace. Motivational undertone. Street-smart confidence.',
  'calm-authority': 'Calm, wise authority (35-50). Slow, intentional pacing. Uses "think about it", "here\'s what I\'ve learned", "the truth is". Storytelling cadence. Pauses for effect. Feels like advice from a mentor. Understated power.',
  'sassy': 'Sassy and bold (22-30). Uses "chile", "not me finding out", "the audacity", "periodt", "I said what I said". Eye-roll energy. Confident. Slightly dramatic. Makes the mundane entertaining. Unapologetic opinions.',
};

// ── Init ──
function scrInit() {
  if (scrInitialized) return;
  scrInitialized = true;
  scrRenderFrameworks();
  scrLoadHistory();
  scrRenderHistory();

  // Wire up voice custom toggle
  const voiceSelect = document.getElementById('scrVoice');
  if (voiceSelect) {
    voiceSelect.addEventListener('change', () => {
      const custom = document.getElementById('scrVoiceCustom');
      if (custom) custom.style.display = voiceSelect.value === 'custom' ? '' : 'none';
    });
  }

  scrUpdateDuration();
}

// ── Mode Toggle ──
function scrSetMode(mode) {
  scrMode = mode;
  scrSelectedFramework = null;
  document.querySelectorAll('.scr-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  scrRenderFrameworks();

  // Update topic placeholder based on mode
  const topicEl = document.getElementById('scrTopic');
  if (topicEl) {
    topicEl.placeholder = mode === 'ads'
      ? "What's this video about? Describe your product, service, or topic..."
      : "What's the video about? Describe the topic, niche, or angle you want to go viral with...";
  }
}

// ── Duration ──
function scrUpdateDuration() {
  const slider = document.getElementById('scrDuration');
  const valEl = document.getElementById('scrDurationVal');
  const hintEl = document.getElementById('scrDurationHint');
  if (!slider) return;

  const secs = parseInt(slider.value);
  valEl.textContent = secs + 's';

  // ~2.5 words/sec for spoken delivery
  const wordsLow = Math.round(secs * 2.5);
  const wordsHigh = Math.round(secs * 3);
  hintEl.textContent = `~${wordsLow}–${wordsHigh} words`;
}

// ── Framework Selection ──
function scrGetFrameworks() {
  return scrMode === 'ads' ? SCR_FRAMEWORKS_ADS : SCR_FRAMEWORKS_SOCIAL;
}

function scrRenderFrameworks() {
  const grid = document.getElementById('scrFrameworkGrid');
  if (!grid) return;
  const frameworks = scrGetFrameworks();
  grid.innerHTML = frameworks.map(f => `
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
  const frameworks = scrGetFrameworks();
  const fw = frameworks.find(f => f.id === scrSelectedFramework);

  // Voice
  const voiceSelect = document.getElementById('scrVoice');
  const voiceCustomEl = document.getElementById('scrVoiceCustom');
  let voice = null;
  if (voiceSelect.value === 'custom') {
    voice = voiceCustomEl.value.trim() || null;
  } else if (voiceSelect.value && SCR_VOICE_PRESETS[voiceSelect.value]) {
    voice = SCR_VOICE_PRESETS[voiceSelect.value];
  }

  // Duration
  const durationSecs = parseInt(document.getElementById('scrDuration').value) || 30;

  scrGenerating = true;
  const btn = document.getElementById('scrGenerateBtn');
  const output = document.getElementById('scrOutput');
  const empty = document.getElementById('scrEmptyState');

  btn.disabled = true;
  btn.textContent = 'Generating...';
  if (empty) empty.style.display = 'none';
  const modeLabel = scrMode === 'ads' ? 'ad' : 'social media';
  output.innerHTML = '<div class="scr-loading"><div class="scr-spinner"></div><div>Writing your ' + durationSecs + 's ' + modeLabel + ' script with ' + fw.name + '...</div></div>';

  try {
    const resp = await fetch('/api/scripter/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        framework: fw.name,
        topic,
        rewriteScript,
        mode: scrMode,
        voice,
        durationSecs,
      })
    });
    const data = await resp.json();

    if (data.ok) {
      scrRenderScript(data.script);
      // Save to history
      scrHistory.unshift({
        framework: fw.name,
        acr: fw.acr,
        mode: scrMode,
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
    .replace(/^(ENGAGEMENT:)/gm, '<span class="scr-cta-label">$1</span>')
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

    // Strip section labels (CTA:, ENGAGEMENT:, PROBLEM:, AGITATE:, etc.)
    const stripped = trimmed.replace(/^(?:CTA|ENGAGEMENT|[A-Z][A-Z &]+(?:\([^)]*\))?):\s*/g, '');
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

// ── Transcribe URL ──
async function scrTranscribe() {
  const urlEl = document.getElementById('scrTranscribeUrl');
  const btn = document.getElementById('scrTranscribeBtn');
  const rewriteEl = document.getElementById('scrRewrite');
  const url = urlEl.value.trim();

  if (!url) { showToast('Paste a video URL first', 'error'); return; }
  if (!/^https?:\/\//i.test(url)) { showToast('Enter a valid URL', 'error'); return; }

  btn.disabled = true;
  btn.innerHTML = '<div class="scr-spinner" style="width:14px;height:14px;border-width:2px"></div>';
  rewriteEl.value = 'Downloading & transcribing... (this takes 30-60s)';
  rewriteEl.disabled = true;

  try {
    const resp = await fetch('/api/scripter/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await resp.json();

    if (data.ok && data.transcript) {
      rewriteEl.value = data.transcript;
      showToast(`Transcribed! ${data.transcript.length} chars — now pick a framework and generate.`, 'success');
      urlEl.value = '';
    } else {
      rewriteEl.value = '';
      showToast('Transcription failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    rewriteEl.value = '';
    showToast('Transcription error: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M12 4v12m0 0l-4-4m4 4l4-4"/></svg>';
  rewriteEl.disabled = false;
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
      ${h.mode === 'social' ? '<span class="scr-history-mode">S</span>' : ''}
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
