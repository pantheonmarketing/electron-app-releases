// ── Skill Change Handler ──
async function refreshSkills() {
  const btn = document.querySelector('.btn-inline-refresh');
  if (btn) btn.classList.add('spinning');
  try {
    const result = await api.scanSkills();
    skills = result.skills || [];

    // Rebuild dropdown
    const sel = document.getElementById('skillInput');
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">None (general)</option>';
    skills.forEach(s => {
      if (s.exists) {
        const opt = document.createElement('option');
        opt.value = s.name;
        const ctxLabel = s.context && s.context.length > 0 ? ` [+${s.context.length} ctx]` : '';
        opt.textContent = `${s.name} - ${s.description}${ctxLabel}`;
        sel.appendChild(opt);
      }
    });
    // Restore selection if still valid
    if (currentVal && [...sel.options].some(o => o.value === currentVal)) {
      sel.value = currentVal;
    }
    buildSkillPicker();
    // Restore picker selection
    if (currentVal) selectSkillPickerValue(currentVal);

    if (result.added > 0) {
      showToast(`Found ${result.added} new skill${result.added > 1 ? 's' : ''}: ${result.new_skills.join(', ')}`, 'success');
    } else {
      showToast(`Skills up to date (${result.total} total)`, 'info');
    }
  } catch (e) {
    showToast('Failed to scan skills: ' + e.message, 'error');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function onSkillChange() {
  const skillName = document.getElementById('skillInput').value;
  const hint = document.getElementById('skillContextHint');

  if (!skillName) { hint.style.display = 'none'; return; }

  const skill = skills.find(s => s.name === skillName);
  if (!skill || !skill.context || skill.context.length === 0) {
    hint.style.display = 'none';
    return;
  }

  let hintText = `&#128279; <strong>${skill.name}</strong> auto-includes ${skill.context.length} context source(s)`;
  if (skill.context_notes) hintText += `<br><span style="color:#999;">${escHtml(skill.context_notes)}</span>`;
  hint.innerHTML = hintText;
  hint.style.display = 'block';
}

// ── Custom Skill Picker ──
const SP_CATEGORIES = [
  { key: 'content',       label: 'Content Creation', icon: '✍️' },
  { key: 'video',         label: 'Video Production', icon: '🎬' },
  { key: 'social',        label: 'Social Media',     icon: '📱' },
  { key: 'monitoring',    label: 'Monitoring',        icon: '📊' },
  { key: 'communication', label: 'Communication',     icon: '📧' },
  { key: 'web',           label: 'Web & Courses',     icon: '🌐' },
  { key: 'ai-tools',      label: 'AI Tools',          icon: '🤖' },
];

function buildSkillPicker() {
  const list = document.getElementById('skillPickerList');
  if (!list) return;
  const available = (skills || []).filter(s => s.exists);

  // Group by category
  const groups = {};
  for (const s of available) {
    const cat = s.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }

  let html = `<div class="sp-none-item" data-sp-value="" onclick="pickSkill('')">
    <span style="font-size:20px;opacity:0.5">🚫</span>
    <div>
      <div style="font-size:14px;font-weight:600;color:#999">None (general)</div>
      <div style="font-size:12px;color:#555">Run task without a specific skill</div>
    </div>
  </div>`;

  for (const catDef of SP_CATEGORIES) {
    const items = groups[catDef.key];
    if (!items || items.length === 0) continue;
    html += `<div class="sp-category" data-sp-cat="${catDef.key}">
      <span class="sp-category-icon">${catDef.icon}</span> ${catDef.label}
      <span class="sp-category-line"></span>
      <span style="font-size:11px;color:#555;font-weight:400">${items.length}</span>
    </div>`;
    html += `<div class="sp-grid" data-sp-grid="${catDef.key}">`;
    for (const s of items) {
      const icon = s.icon || '⚙️';
      const name = s.display_name || s.name;
      const desc = s.plain_description || s.description || '';
      const ctxLabel = s.context && s.context.length > 0 ? `<span class="sp-card-ctx">+${s.context.length} ctx</span>` : '';
      const searchData = (name + ' ' + s.name + ' ' + (s.description || '') + ' ' + desc).toLowerCase();
      html += `<div class="sp-card" data-sp-value="${s.name}" data-sp-search="${searchData}" onclick="pickSkill('${s.name}')">
        <div class="sp-card-icon">${icon}</div>
        <div class="sp-card-info">
          <div class="sp-card-name">${escHtml(name)}</div>
          <div class="sp-card-desc">${escHtml(desc)}</div>
        </div>
        ${ctxLabel}
      </div>`;
    }
    html += `</div>`;
  }
  // Uncategorized
  if (groups['other']) {
    html += `<div class="sp-category" data-sp-cat="other">⚙️ Other <span class="sp-category-line"></span></div>`;
    html += `<div class="sp-grid" data-sp-grid="other">`;
    for (const s of groups['other']) {
      const name = s.display_name || s.name;
      const desc = s.plain_description || s.description || '';
      const searchData = (name + ' ' + s.name + ' ' + (s.description || '') + ' ' + desc).toLowerCase();
      html += `<div class="sp-card" data-sp-value="${s.name}" data-sp-search="${searchData}" onclick="pickSkill('${s.name}')">
        <div class="sp-card-icon">${s.icon || '⚙️'}</div>
        <div class="sp-card-info">
          <div class="sp-card-name">${escHtml(name)}</div>
          <div class="sp-card-desc">${escHtml(desc)}</div>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  list.innerHTML = html;
}

function toggleSkillPicker() {
  const overlay = document.getElementById('skillPickerOverlay');
  const picker = document.getElementById('skillPicker');
  const isOpen = overlay.classList.contains('open');
  if (isOpen) {
    overlay.classList.remove('open');
    picker.classList.remove('open');
  } else {
    overlay.classList.add('open');
    picker.classList.add('open');
    const search = document.getElementById('skillPickerSearch');
    if (search) { search.value = ''; filterSkillPicker(); search.focus(); }
  }
}

function filterSkillPicker() {
  const query = (document.getElementById('skillPickerSearch')?.value || '').toLowerCase().trim();
  const cards = document.querySelectorAll('#skillPickerList .sp-card');
  const noneItem = document.querySelector('#skillPickerList .sp-none-item');
  const cats = document.querySelectorAll('#skillPickerList .sp-category');
  const grids = document.querySelectorAll('#skillPickerList .sp-grid');

  // Show/hide "None" item
  if (noneItem) noneItem.style.display = (!query || 'none general'.includes(query)) ? '' : 'none';

  // Show/hide cards
  cards.forEach(el => {
    if (!query) { el.style.display = ''; return; }
    el.style.display = (el.dataset.spSearch || '').includes(query) ? '' : 'none';
  });

  // Show/hide category + grid (hide if all children hidden)
  cats.forEach(cat => {
    const catKey = cat.dataset.spCat;
    const grid = document.querySelector(`[data-sp-grid="${catKey}"]`);
    if (!grid) return;
    const anyVisible = [...grid.querySelectorAll('.sp-card')].some(c => c.style.display !== 'none');
    cat.style.display = anyVisible ? '' : 'none';
    grid.style.display = anyVisible ? '' : 'none';
  });
}

function pickSkill(value) {
  document.getElementById('skillInput').value = value;
  updateSkillPickerLabel(value);
  // Close overlay
  document.getElementById('skillPickerOverlay').classList.remove('open');
  document.getElementById('skillPicker').classList.remove('open');
  onSkillChange();
}

function selectSkillPickerValue(value) {
  updateSkillPickerLabel(value);
}

function updateSkillPickerLabel(value) {
  const label = document.getElementById('skillPickerLabel');
  if (!label) return;
  if (!value) {
    label.innerHTML = '<span style="color:#666">None (general)</span>';
    return;
  }
  const skill = (skills || []).find(s => s.name === value);
  if (skill) {
    const icon = skill.icon || '';
    const name = skill.display_name || skill.name;
    label.innerHTML = `${icon} ${escHtml(name)}`;
  } else {
    label.textContent = value;
  }
}

// Escape key closes skill picker overlay
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('skillPickerOverlay');
    if (overlay && overlay.classList.contains('open')) {
      toggleSkillPicker();
      e.stopPropagation();
    }
  }
});

// ── Task Actions ──
function openAddModal() {
  document.getElementById('editTaskId').value = '';
  document.getElementById('modalTitle').textContent = 'New Task';
  document.getElementById('taskInput').value = '';
  document.getElementById('skillInput').value = '';
  selectSkillPickerValue('');
  document.getElementById('priorityInput').value = '5';
  document.getElementById('modelInput').value = 'sonnet';
  document.getElementById('turnsInput').value = '25';
  document.getElementById('contextInput').value = '';
  document.getElementById('contextSummary').textContent = '';
  const advDet = document.getElementById('advancedDetails') || document.getElementById('contextDetails');
  if (advDet) advDet.removeAttribute('open');
  document.getElementById('skillContextHint').style.display = 'none';
  document.getElementById('addModal').classList.add('active');
  document.getElementById('taskInput').focus();
}

function closeAddModal() { document.getElementById('addModal').classList.remove('active'); }

async function editTask(id) {
  const t = allTasks.find(x => x.id === id);
  if (!t) return;
  document.getElementById('editTaskId').value = t.id;
  document.getElementById('modalTitle').textContent = 'Edit Task #' + t.id;
  document.getElementById('taskInput').value = t.task;
  document.getElementById('skillInput').value = t.skill || '';
  selectSkillPickerValue(t.skill || '');
  document.getElementById('priorityInput').value = String(t.priority || 5);
  document.getElementById('modelInput').value = t.model || 'sonnet';
  document.getElementById('turnsInput').value = String(t.max_turns || 25);
  // Show extra context only (task-level, not space-level)
  document.getElementById('contextInput').value = (t.extra_context || []).join('\n');
  onSkillChange();
  document.getElementById('addModal').classList.add('active');
  document.getElementById('taskInput').focus();
}

async function saveTask() {
  const editId = document.getElementById('editTaskId').value;
  const space = getActiveSpace();

  // Merge: space context + extra task-level context
  const extraCtxRaw = document.getElementById('contextInput').value.trim();
  const extraContext = extraCtxRaw ? extraCtxRaw.split('\n').map(l => l.trim()).filter(Boolean) : [];
  const spaceContext = space.context || [];

  // Deduplicate
  const normalize = p => p.replace(/\\/g, '/').toLowerCase();
  const seen = new Set();
  const mergedContext = [];
  for (const p of [...spaceContext, ...extraContext]) {
    const key = normalize(p);
    if (!seen.has(key)) { seen.add(key); mergedContext.push(p); }
  }

  const data = {
    task: document.getElementById('taskInput').value.trim(),
    skill: document.getElementById('skillInput').value || null,
    priority: parseInt(document.getElementById('priorityInput').value),
    model: document.getElementById('modelInput').value,
    max_turns: parseInt(document.getElementById('turnsInput').value),
    space_id: activeSpaceId,
    extra_context: extraContext, // store separately so we can show in edit
  };

  // Set context + working_dir from space (merged with extra)
  if (mergedContext.length > 0) data.context = mergedContext;
  if (space.working_dir) data.working_dir = space.working_dir;

  if (!data.task) return alert('Enter a task description');
  if (editId) await api.updateTask(editId, data);
  else await api.createTask(data);
  closeAddModal();
  await refresh();
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  const res = await api.deleteTask(id);
  if (res.error) { showToast(res.message || 'Delete failed', 'error'); return; }
  await refresh();
}
async function retryById(id) { await api.moveTask(id, 'pending'); await refresh(); }

async function runSingleTask(id) {
  try {
    const res = await fetch(`/api/tasks/${id}/run`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(`Task #${id} started`, 'success');
      await refresh();
    } else {
      showToast(data.message || 'Failed to run task', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Result Viewer ──
// Markdown → HTML renderer (safe: escapes HTML first, then converts markdown)
function renderMarkdown(text) {
  // 1. Escape HTML to prevent XSS
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 2. Code blocks: ```lang\n...\n``` → <pre><code>
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-code-block"><code>${code.trim()}</code></pre>`;
  });

  // 3. Inline code: `text` → <code>
  html = html.replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>');

  // 4. Headers: ### → h4, ## → h3 (processed largest first to avoid conflicts)
  html = html.replace(/^#### (.+)$/gm, '<div class="md-h4">$1</div>');
  html = html.replace(/^### (.+)$/gm, '<div class="md-h3">$1</div>');
  html = html.replace(/^## (.+)$/gm, '<div class="md-h2">$1</div>');

  // 5. Horizontal rules: --- or *** on their own line
  html = html.replace(/^(-{3,}|\*{3,})$/gm, '<hr>');

  // 6. Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 7. Italic: *text* (but not inside bold)
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');

  return html;
}

let currentResultText = ''; // Store the raw result text for follow-ups

async function viewResult(id, autoOpen) {
  // If the user manually dismissed the modal, don't auto-reopen it
  if (autoOpen && resultModalDismissed) return;
  currentResultTaskId = id;
  currentResultText = '';
  resultModalDismissed = false;
  const t = allTasks.find(x => x.id === id);
  document.getElementById('resultTitle').textContent = `Task #${id} - ${t?.status === 'done' ? 'Result' : 'Error Details'}`;
  document.getElementById('resultContent').innerHTML = '<span style="color:#888">Loading...</span>';
  document.getElementById('retryBtn').style.display = t?.status === 'failed' ? '' : 'none';

  // Show follow-up section only for completed tasks
  const followUpSection = document.getElementById('followUpSection');
  followUpSection.style.display = t?.status === 'done' ? 'flex' : 'none';
  document.getElementById('followUpInput').value = '';

  document.getElementById('resultModal').classList.add('active');

  try {
    const result = await api.getResult(id);
    let metaHtml = '';
    let contentText = '';

    // Build meta info section
    if (result.skill || result.context_files) {
      let metaParts = [];
      if (result.skill) {
        metaParts.push(`Skill: ${result.skill}${result.skill_injected ? ` (${result.skill_chars?.toLocaleString()} chars)` : ' ⚠ NOT injected'}`);
        const sk = skills.find(s => s.name === result.skill);
        if (sk && sk.context && sk.context.length > 0) {
          metaParts.push(`Auto-context: ${sk.context.length} source(s)`);
        }
      }
      if (result.context_files > 0) {
        metaParts.push(`Context: ${result.context_files} source(s), ${result.context_chars?.toLocaleString()} chars`);
      }
      metaParts.push(`Prompt: ${result.prompt_total_chars?.toLocaleString()} chars`);
      metaHtml = `<div class="result-meta">${metaParts.join(' · ')}</div>`;
    }

    // Build content
    if (result.claude_response?.result) {
      contentText = result.claude_response.result;
    } else if (result.raw_output) {
      contentText = result.raw_output;
    } else if (result.stderr) {
      contentText = 'STDERR:\n' + result.stderr;
    } else {
      contentText = JSON.stringify(result, null, 2);
    }

    currentResultText = contentText; // Save for follow-up
    document.getElementById('resultContent').innerHTML = metaHtml + renderMarkdown(contentText);
  } catch (e) {
    const log = await api.getLog(id);
    document.getElementById('resultContent').textContent = log || 'No result file found yet.';
  }
}

let liveLogInterval = null;

async function viewLiveLog(id) {
  resultModalDismissed = false;
  currentResultTaskId = id;
  const t = allTasks.find(x => x.id === id);
  document.getElementById('resultTitle').textContent = `Task #${id} - Live Progress`;
  document.getElementById('resultContent').innerHTML = '<span style="color:#888">Loading live log...</span>';
  document.getElementById('retryBtn').style.display = 'none';
  document.getElementById('followUpSection').style.display = 'none';
  document.getElementById('resultModal').classList.add('active');

  // Start polling live log
  async function updateLiveLog() {
    try {
      const [statusData, logText] = await Promise.all([
        (await fetch(`/api/tasks/${id}/live`)).json(),
        (await fetch(`/api/tasks/${id}/live-log`)).text()
      ]);

      let html = '';
      // Status banner
      const statusColor = statusData.status === 'running' ? '#4ADE80' : statusData.status === 'done' ? '#22C55E' : statusData.status === 'failed' ? '#F87171' : '#888';
      html += `<div style="padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:6px;margin-bottom:12px;border-left:3px solid ${statusColor};font-size:13px;">`;
      html += `<strong style="color:${statusColor};text-transform:uppercase;">${statusData.status || 'preparing'}</strong>`;
      if (statusData.detail) html += ` <span style="color:#888;margin-left:8px;">${escHtml(statusData.detail)}</span>`;
      if (t && t.started_at) html += ` <span style="color:#666;margin-left:8px;">(${formatElapsed(t.started_at)})</span>`;
      html += `</div>`;

      // Log lines
      if (logText.trim()) {
        const lines = logText.split('\n').filter(l => l.trim());
        html += `<pre style="font-size:11px;color:#aaa;line-height:1.6;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;font-family:'SF Mono',Monaco,Consolas,monospace;">`;
        for (const line of lines) {
          // Colorize log lines
          let coloredLine = escHtml(line);
          if (line.includes('WARNING')) coloredLine = `<span style="color:#FBBF24">${coloredLine}</span>`;
          else if (line.includes('completed successfully')) coloredLine = `<span style="color:#4ADE80">${coloredLine}</span>`;
          else if (line.includes('failed')) coloredLine = `<span style="color:#F87171">${coloredLine}</span>`;
          else if (line.includes('Skill') || line.includes('Context')) coloredLine = `<span style="color:#C084FC">${coloredLine}</span>`;
          html += coloredLine + '\n';
        }
        html += `</pre>`;
      } else {
        html += `<div style="color:#666;font-size:13px;text-align:center;padding:20px;">Worker starting up...</div>`;
      }

      document.getElementById('resultContent').innerHTML = html;

      // Auto-scroll to bottom
      const contentEl = document.getElementById('resultContent');
      const pre = contentEl.querySelector('pre');
      if (pre) pre.scrollTop = pre.scrollHeight;

      // Check if task is done — stop polling and switch to result view
      const freshTasks = allTasks;
      const freshTask = freshTasks.find(x => x.id === id);
      if (freshTask && (freshTask.status === 'done' || freshTask.status === 'failed')) {
        stopLiveLog();
        viewResult(id, true);
      }
    } catch (_) {}
  }

  await updateLiveLog();
  liveLogInterval = setInterval(updateLiveLog, 2000);
}

function stopLiveLog() {
  if (liveLogInterval) { clearInterval(liveLogInterval); liveLogInterval = null; }
}

let resultModalDismissed = false;

function closeResultModal() {
  document.getElementById('resultModal').classList.remove('active');
  currentResultText = '';
  resultModalDismissed = true;
  stopLiveLog();
}

function copyResult() {
  const el = document.getElementById('resultContent');
  const metaEl = el.querySelector('.result-meta');
  let text = '';
  if (metaEl) {
    const clone = el.cloneNode(true);
    clone.querySelector('.result-meta').remove();
    text = clone.innerText;
  } else {
    text = el.innerText;
  }
  navigator.clipboard.writeText(text.trim()).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.innerHTML = '📋 Copy'; }, 2000);
  });
}

async function submitFollowUp() {
  const followUpText = document.getElementById('followUpInput').value.trim();
  if (!followUpText) return;

  const parentTask = allTasks.find(x => x.id === currentResultTaskId);
  if (!parentTask) return;

  // Disable button while submitting
  const btn = document.getElementById('followUpBtn');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  // Truncate previous result if too long (keep last 4000 chars)
  let prevResult = currentResultText || '';
  if (prevResult.length > 4000) {
    prevResult = '... (truncated) ...\n' + prevResult.slice(-4000);
  }

  // For chained follow-ups: extract just the original instruction, not the full chain
  let parentDescription = parentTask.task || '';
  const followUpMatch = parentDescription.match(/Follow-up instruction:\n([\s\S]+)$/);
  if (followUpMatch) {
    // This parent was itself a follow-up — only keep its follow-up instruction
    parentDescription = followUpMatch[1].trim();
  }
  if (parentDescription.length > 1000) {
    parentDescription = parentDescription.slice(0, 1000) + '\n... (truncated)';
  }

  // Build the combined task description
  const combinedTask = [
    `This is a follow-up to task #${parentTask.id}.`,
    ``,
    `Previous task description:`,
    parentDescription,
    ``,
    `Previous output:`,
    `---`,
    prevResult,
    `---`,
    ``,
    `Follow-up instruction:`,
    followUpText
  ].join('\n');

  try {
    await api.createTask({
      task: combinedTask,
      skill: parentTask.skill || null,
      priority: parentTask.priority || 5,
      model: parentTask.model || 'sonnet',
      max_turns: parentTask.max_turns || 25,
      context: parentTask.context || [],
      extra_context: parentTask.extra_context || [],
      working_dir: parentTask.working_dir || null,
      space_id: parentTask.space_id || 'general'
    });

    // Success — close modal, refresh, and auto-run immediately
    closeResultModal();
    await refresh();

    // Auto-launch 1 worker to pick up the follow-up task
    const runResult = await api.run(1);
    if (runResult.ok) {
      document.getElementById('runnerStatus').textContent = `Follow-up running...`;
      startPolling();
    } else {
      document.getElementById('runnerStatus').textContent = `Follow-up created (run manually)`;
    }
  } catch (e) {
    btn.textContent = '❌ Error';
    setTimeout(() => { btn.disabled = false; btn.textContent = '▶ Follow Up'; }, 2000);
  }
}
async function retryTask() { if (currentResultTaskId) { await api.moveTask(currentResultTaskId, 'pending'); closeResultModal(); await refresh(); } }

// ── Runner ──
let runningLock = false;

function writeDebug(lines) {
  const panel = document.getElementById('debugPanel');
  const content = document.getElementById('debugContent');
  if (!panel || !content) return;
  panel.style.display = 'block';
  const timestamp = new Date().toLocaleTimeString();
  let html = `<span style="color:#666">[${timestamp}]</span>\n`;
  for (const line of lines) {
    let color = '#aaa';
    if (line.includes('ERROR') || line.includes('failed') || line.includes('not found')) color = '#F87171';
    else if (line.includes('OK') || line.includes('succeeded') || line.includes('launched')) color = '#4ADE80';
    else if (line.includes('WARNING')) color = '#FBBF24';
    else if (line.includes('APP_DIR') || line.includes('BASE_DIR') || line.includes('Worker script')) color = '#C084FC';
    html += `<span style="color:${color}">${escHtml(line)}</span>\n`;
  }
  content.innerHTML = html;
  // Auto-scroll
  panel.scrollTop = panel.scrollHeight;
}

async function showRunDebug() {
  writeDebug(['Fetching diagnostics from /api/run/debug ...']);
  try {
    const res = await fetch('/api/run/debug');
    const data = await res.json();
    const lines = [];
    lines.push('=== ENVIRONMENT ===');
    lines.push(`APP_DIR: ${data.APP_DIR}`);
    lines.push(`BASE_DIR: ${data.BASE_DIR}`);
    lines.push(`LOGS_DIR: ${data.LOGS_DIR}`);
    lines.push(`IS_WIN: ${data.IS_WIN} | IS_MAC: ${data.IS_MAC} | ELECTRON: ${data.ELECTRON_MODE}`);
    lines.push('');
    lines.push('=== FILES ===');
    lines.push(`worker.js bundled: ${data.workerBundled} (exists: ${data.workerBundledExists})`);
    lines.push(`worker.js extracted: ${data.workerExtracted} (exists: ${data.workerExtractedExists})`);
    lines.push(`worker.js using: ${data.workerUsing}`);
    lines.push(`skills.json: ${data.skillsFile} (exists: ${data.skillsExists})`);
    lines.push(`tasks.json: ${data.tasksFile} (exists: ${data.tasksExists})`);
    lines.push('');
    lines.push('=== TOOLS ===');
    lines.push(`Node: ${data.nodeVersion}`);
    lines.push(`Claude CLI: ${data.claudeVersion}`);
    if (data.powershellVersion) lines.push(`PowerShell: ${data.powershellVersion}`);
    lines.push(`launchWorkerProcess: ${data.launchWorkerProcessType}`);
    lines.push('');
    lines.push('=== TASKS ===');
    lines.push(`Total: ${data.taskCount} | Pending: ${data.pendingCount} | Running: ${data.runningCount}`);
    lines.push(`Active workers: ${data.activeWorkers.length > 0 ? data.activeWorkers.map(w => w.id).join(', ') : 'none'}`);
    if (data.recentBatFiles && data.recentBatFiles.length > 0) {
      lines.push('');
      lines.push('=== RECENT BAT FILES ===');
      data.recentBatFiles.forEach(f => lines.push(`  ${f}`));
    }
    writeDebug(lines);
  } catch (e) {
    writeDebug(['ERROR: Could not reach /api/run/debug', e.message]);
  }
}

async function runWorkers() {
  if (runningLock) return; // Prevent double-click
  const btn = document.getElementById('runBtn');
  runningLock = true;
  btn.disabled = true;
  btn.textContent = '⏳ Starting...';
  try {
    const result = await api.run(); // smart auto-workers — server calculates optimal count

    if (result.ok) {
      document.getElementById('runnerStatus').textContent = `Running ${result.pending} task${result.pending > 1 ? 's' : ''} (${result.workers} worker${result.workers > 1 ? 's' : ''})`;
      document.getElementById('stopBtn').style.display = '';
      startPolling();
    } else {
      document.getElementById('runnerStatus').textContent = result.message || result.error || 'Error';
    }

    // Always show debug info in panel when present
    if (result.debug && result.debug.length > 0) {
      writeDebug(result.debug);
    }
  } catch (e) {
    document.getElementById('runnerStatus').textContent = 'Failed to start workers: ' + e.message;
    writeDebug(['EXCEPTION calling /api/run:', e.message]);
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Run All';
    runningLock = false;
  }
}

async function stopWorkers() {
  await api.stop();
  document.getElementById('runnerStatus').textContent = 'Stopped';
  document.getElementById('terminalHint').textContent = '';
  showToast('All tasks stopped', 'info');
  await refresh();
}

async function resetAll() { if (!confirm('Reset all tasks to pending?')) return; await api.reset(); await refresh(); }

