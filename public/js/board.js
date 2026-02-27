// ── Spaces (stored in localStorage) ──
function loadSpaces() {
  try {
    spaces = JSON.parse(localStorage.getItem('claude-tm-spaces') || '[]');
  } catch (e) { spaces = []; }
  if (spaces.length === 0) {
    // Create default "General" space
    spaces = [{ id: 'general', name: 'General', project_id: null, working_dir: null, context: [] }];
    saveSpaces();
  }
  activeSpaceId = localStorage.getItem('claude-tm-active-space') || spaces[0].id;
  // Ensure active space exists
  if (!spaces.find(s => s.id === activeSpaceId)) activeSpaceId = spaces[0].id;
}

function saveSpaces() {
  localStorage.setItem('claude-tm-spaces', JSON.stringify(spaces));
  localStorage.setItem('claude-tm-active-space', activeSpaceId);
}

function getActiveSpace() {
  return spaces.find(s => s.id === activeSpaceId) || spaces[0];
}

function getSpaceTasks() {
  // Filter tasks to current space, exclude archived
  return allTasks.filter(t => (t.space_id || 'general') === activeSpaceId && !t.archived);
}

// Migrate old tasks without space_id to general
function migrateOldTasks() {
  let changed = false;
  allTasks.forEach(t => {
    if (!t.space_id) {
      t.space_id = 'general';
      changed = true;
    }
  });
  return changed;
}

// ── Space Tab Rendering ──
function renderSpaceTabs() {
  const container = document.getElementById('spaceTabs');

  // Hide space tabs when only 1 space (cleaner for beginners)
  if (spaces.length <= 1) {
    container.style.display = 'none';
    renderSpaceInfo();
    return;
  }
  container.style.display = '';

  let html = '';

  spaces.forEach(space => {
    const isActive = space.id === activeSpaceId;
    const taskCount = allTasks.filter(t => (t.space_id || 'general') === space.id).length;
    const runningCount = allTasks.filter(t => (t.space_id || 'general') === space.id && t.status === 'running').length;
    const proj = space.project_id ? projects.find(p => p.id === space.project_id) : null;

    html += `<div class="space-tab ${isActive ? 'active' : ''}" onclick="switchSpace('${space.id}')">
      <span>${escHtml(space.name)}</span>
      ${taskCount > 0 ? `<span class="tab-count">${runningCount > 0 ? '&#9679; ' : ''}${taskCount}</span>` : ''}
      <span class="tab-settings" onclick="event.stopPropagation();openSpaceSettings('${space.id}')" title="Space Settings">&#9881;</span>
    </div>`;
  });

  html += `<div class="space-tab-add" onclick="createNewSpace()" title="Spaces let you organize tasks by project — each space can have its own working folder and context files">+</div>`;
  container.innerHTML = html;

  // Update space info bar
  renderSpaceInfo();
}

function renderSpaceInfo() {
  const space = getActiveSpace();
  const infoEl = document.getElementById('spaceInfo');

  if (!space.project_id && !space.working_dir && (!space.context || space.context.length === 0)) {
    infoEl.style.display = 'none';
    return;
  }

  let html = '';
  const proj = space.project_id ? projects.find(p => p.id === space.project_id) : null;
  if (proj) {
    html += `<span>Project: <strong style="color:#C084FC;">${escHtml(proj.name)}</strong></span>`;
  }
  if (space.working_dir) {
    html += `<span class="info-tag">&#128194; ${escHtml(space.working_dir.split('\\').pop().split('/').pop())}</span>`;
  }
  const ctxCount = (space.context || []).length;
  if (ctxCount > 0) {
    html += `<span class="info-tag">&#128196; ${ctxCount} context source${ctxCount > 1 ? 's' : ''}</span>`;
  }

  infoEl.innerHTML = html;
  infoEl.style.display = 'flex';
}

function switchSpace(id) {
  activeSpaceId = id;
  saveSpaces();
  renderSpaceTabs();
  renderBoard();
}

function createNewSpace() {
  const name = prompt('Space name:');
  if (!name || !name.trim()) return;
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  if (spaces.find(s => s.id === id)) {
    alert('A space with that ID already exists');
    return;
  }
  spaces.push({ id, name: name.trim(), project_id: null, working_dir: null, context: [] });
  activeSpaceId = id;
  saveSpaces();
  renderSpaceTabs();
  renderBoard();
  // Open settings so user can configure the project
  openSpaceSettings(id);
}

// ── Space Settings Modal ──
function openSpaceSettings(spaceId) {
  editingSpaceId = spaceId;
  const space = spaces.find(s => s.id === spaceId);
  if (!space) return;

  document.getElementById('spaceModalTitle').textContent = space.id === 'general' ? 'General Space Settings' : `Space: ${space.name}`;
  document.getElementById('spaceNameInput').value = space.name;
  document.getElementById('spaceWorkdirInput').value = space.working_dir || '';
  document.getElementById('spaceContextInput').value = (space.context || []).join('\n');
  document.getElementById('deleteSpaceBtn').style.display = space.id === 'general' ? 'none' : '';

  // Populate project dropdown
  const sel = document.getElementById('spaceProjectInput');
  sel.innerHTML = '<option value="">None (general workspace)</option>';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name}${p.valid ? '' : ' ⚠️'}`;
    sel.appendChild(opt);
  });
  sel.value = space.project_id || '';
  onSpaceProjectChange();

  renderProjectListInSpace();
  document.getElementById('spaceModal').classList.add('active');
}

function onSpaceProjectChange() {
  const projId = document.getElementById('spaceProjectInput').value;
  const infoDiv = document.getElementById('spaceProjectInfo');

  if (!projId) {
    infoDiv.style.display = 'none';
    return;
  }

  const proj = projects.find(p => p.id === projId);
  if (!proj) { infoDiv.style.display = 'none'; return; }

  // Auto-fill workdir and context from project
  document.getElementById('spaceWorkdirInput').value = proj.working_dir;
  document.getElementById('spaceContextInput').value = proj.context.join('\n');

  infoDiv.innerHTML = `
    <div style="color:#C084FC;font-weight:600;margin-bottom:4px;">&#128204; ${escHtml(proj.name)}</div>
    <div style="color:#888;">Working dir + ${proj.context.length} context source(s) auto-filled from project profile.</div>
  `;
  infoDiv.style.display = 'block';
}

function saveSpaceSettings() {
  const space = spaces.find(s => s.id === editingSpaceId);
  if (!space) return;

  space.name = document.getElementById('spaceNameInput').value.trim() || space.name;
  space.project_id = document.getElementById('spaceProjectInput').value || null;
  space.working_dir = document.getElementById('spaceWorkdirInput').value.trim() || null;
  const ctxRaw = document.getElementById('spaceContextInput').value.trim();
  space.context = ctxRaw ? ctxRaw.split('\n').map(l => l.trim()).filter(Boolean) : [];

  saveSpaces();
  renderSpaceTabs();
  closeSpaceModal();
}

async function deleteCurrentSpace() {
  if (editingSpaceId === 'general') return;
  const space = spaces.find(s => s.id === editingSpaceId);
  if (!space) return;

  const tasksInSpace = allTasks.filter(t => (t.space_id || 'general') === editingSpaceId);
  let msg = `Delete space "${space.name}"?`;
  if (tasksInSpace.length > 0) msg += `\n\n${tasksInSpace.length} task(s) will be moved to General.`;

  if (!confirm(msg)) return;

  // Move tasks to general — await all updates before continuing
  try {
    await Promise.all(tasksInSpace.map(t => api.updateTask(t.id, { space_id: 'general' })));
  } catch (e) {
    console.error('Failed to move some tasks:', e);
  }

  spaces = spaces.filter(s => s.id !== editingSpaceId);
  if (activeSpaceId === editingSpaceId) activeSpaceId = 'general';
  saveSpaces();
  closeSpaceModal();
  renderSpaceTabs();
  refresh();
}

function closeSpaceModal() {
  document.getElementById('spaceModal').classList.remove('active');
  editingSpaceId = null;
}

// ── Project list inside Space Settings ──
function renderProjectListInSpace() {
  const el = document.getElementById('projectListInSpace');
  if (projects.length === 0) {
    el.innerHTML = '<div style="color:#666;font-size:12px;padding:8px;text-align:center;">No project profiles yet.</div>';
    return;
  }
  el.innerHTML = projects.map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px;font-size:12px;">
      <div style="flex:1;">
        <span style="color:#ddd;font-weight:600;">${escHtml(p.name)}</span>
        <span style="color:#666;margin-left:6px;">${p.context.length} ctx ${p.valid ? '&#9989;' : '&#9888;&#65039;'}</span>
      </div>
      <button class="card-btn delete" onclick="deleteProject('${p.id}')" title="Delete" style="width:20px;height:20px;font-size:10px;">&times;</button>
    </div>
  `).join('');
}

async function addProject() {
  const id = document.getElementById('projIdInput').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const name = document.getElementById('projNameInput').value.trim();
  const working_dir = document.getElementById('projWorkdirInput').value.trim();
  const ctxRaw = document.getElementById('projContextInput').value.trim();
  const context = ctxRaw ? ctxRaw.split('\n').map(l => l.trim()).filter(Boolean) : [];

  if (!id || !name || !working_dir) return alert('Fill in ID, Name, and Working Directory');

  await api.createProject({ id, name, working_dir, context });
  document.getElementById('projIdInput').value = '';
  document.getElementById('projNameInput').value = '';
  document.getElementById('projWorkdirInput').value = '';
  document.getElementById('projContextInput').value = '';
  projects = await api.getProjects();
  renderProjectListInSpace();

  // Refresh project dropdown in space settings
  const sel = document.getElementById('spaceProjectInput');
  const current = sel.value;
  sel.innerHTML = '<option value="">None (general workspace)</option>';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name}${p.valid ? '' : ' ⚠️'}`;
    sel.appendChild(opt);
  });
  sel.value = current;
}

async function deleteProject(id) {
  if (!confirm(`Delete project profile "${id}"?`)) return;
  await api.deleteProject(id);
  projects = await api.getProjects();
  renderProjectListInSpace();
}

// ── Elapsed Timer ──
function formatElapsed(startIso) {
  if (!startIso || startIso === 'null' || startIso === 'undefined') return '0:00';
  const ms = Date.now() - new Date(startIso).getTime();
  if (isNaN(ms)) return '0:00';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const sec = Math.floor((new Date(endIso) - new Date(startIso)) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec/60)}m ${sec%60}s`;
}

// ── Render Board ──
function renderBoard() {
  const spaceTasks = getSpaceTasks();
  const columns = { pending: [], running: [], done: [], failed: [] };
  spaceTasks.forEach(t => { if (columns[t.status]) columns[t.status].push(t); });

  // Count archived for the header
  const archivedCount = allTasks.filter(t => t.archived && (t.space_id || 'general') === activeSpaceId).length;

  Object.entries(columns).forEach(([status, items]) => {
    const el = document.getElementById(`col-${status}`);
    const colEl = el.closest('.column');
    const totalCount = items.length;
    document.getElementById(`count-${status}`).textContent = totalCount;

    // Empty columns shrink to give more room to columns with tasks
    if (totalCount === 0) { colEl.classList.add('col-empty'); }
    else { colEl.classList.remove('col-empty'); }

    // Apply "recent" filter to done column — show latest 10 by default
    let displayItems = items;
    if (status === 'done' && doneFilter === 'recent' && items.length > 10) {
      // Sort by completed_at descending, take 10
      displayItems = [...items].sort((a, b) =>
        (b.completed_at || '').localeCompare(a.completed_at || '')
      ).slice(0, 10);
    }

    // Show/hide the done filter bar — only show when there are enough done tasks to warrant filtering
    if (status === 'done') {
      const filterBar = document.getElementById('doneFilter');
      filterBar.style.display = items.length > 10 ? 'flex' : 'none';
    }

    if (displayItems.length === 0) {
      const emptyStates = {
        pending: { icon: '📋', title: 'No tasks yet', hint: 'Click <b>+ New Task</b> to give your AI something to do' },
        running: { icon: '⏳', title: 'Nothing running', hint: 'Hit <b>▶ Run All</b> to start your pending tasks' },
        done:    { icon: '🎉', title: 'No completed tasks', hint: 'Completed tasks will show up here' },
        failed:  { icon: '✅', title: 'No failures', hint: 'All clear — nothing to fix!' }
      };
      const s = emptyStates[status] || { icon: '📋', title: `No ${status} tasks`, hint: '' };
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${s.icon}</div><div class="empty-state-title">${s.title}</div><div class="empty-state-hint">${s.hint}</div></div>`;
      return;
    }

    let html = displayItems.map(t => renderCard(t)).join('');

    // Show "X more hidden" for done column in recent mode
    if (status === 'done' && doneFilter === 'recent' && totalCount > 10) {
      html += `<div class="show-more-link" onclick="setDoneFilter('all')">+ ${totalCount - 10} more — click to show all</div>`;
    }

    el.innerHTML = html;
  });
}

// Extract a clean preview for the card — especially important for follow-up tasks
function getCardPreview(t) {
  const text = t.task || '';
  // Detect follow-up tasks: extract just the follow-up instruction
  const followUpMatch = text.match(/Follow-up instruction:\n([\s\S]+)$/);
  if (followUpMatch) {
    const parentMatch = text.match(/follow-up to task #(\d+)/);
    const parentId = parentMatch ? parentMatch[1] : '?';
    return `↩ #${parentId}: ${followUpMatch[1].trim()}`;
  }
  // Detect plan tasks: strip the [Plan: ...] header and dependency notes
  if (t.plan_id) {
    let clean = text;
    // Remove the plan header line
    clean = clean.replace(/^\[Plan:.*?\]\n+/s, '');
    // Remove dependency notes
    clean = clean.replace(/^This step depends on.*?\n+/gm, '');
    clean = clean.replace(/^Check the working directory.*?\n+/gm, '');
    return clean.trim();
  }
  return text;
}

function renderCard(t) {
  const isRunning = t.status === 'running';
  const isDone = t.status === 'done';
  const isFailed = t.status === 'failed';
  const canClick = isDone || isFailed;
  const cardClass = isRunning ? 'card card-running' : isDone ? 'card card-done' : isFailed ? 'card card-failed' : 'card';

  const tags = [];
  if (t.skill) {
    const sk = skills.find(s => s.name === t.skill);
    const autoCtx = sk && sk.context && sk.context.length > 0 ? ` +${sk.context.length}ctx` : '';
    tags.push(`<span class="tag tag-skill">${escHtml(t.skill)}${autoCtx}</span>`);
  }
  tags.push(`<span class="tag tag-model">${t.model || 'sonnet'}</span>`);
  if (t.priority && t.priority <= 2) tags.push(`<span class="tag tag-priority">P${t.priority}</span>`);
  if (isDone && t.started_at && t.completed_at) {
    tags.push(`<span class="tag tag-done-check">completed in ${formatDuration(t.started_at, t.completed_at)}</span>`);
  }
  if (isFailed && t.started_at && t.completed_at) {
    tags.push(`<span class="tag tag-duration">${formatDuration(t.started_at, t.completed_at)}</span>`);
  }

  let runningHtml = '';
  if (isRunning) {
    runningHtml = `
      <div class="running-indicator">
        <div class="spinner"></div>
        <span class="running-text">Processing...</span>
        <span class="elapsed-timer" data-started="${t.started_at}">${formatElapsed(t.started_at)}</span>
      </div>
      <div class="live-status" id="live-status-${t.id}" style="margin-top:6px;font-size:11px;color:#888;padding:4px 8px;background:rgba(123,47,242,0.05);border-radius:4px;border-left:2px solid rgba(123,47,242,0.3);display:none;"></div>`;
  }

  let errorHtml = '';
  if (t.error) {
    errorHtml = `<div style="margin-top:8px;font-size:11px;color:#F87171;background:rgba(248,113,113,0.08);padding:6px 8px;border-radius:4px;">Error: ${escHtml(String(t.error).slice(0,120))}</div>`;
  }

  const hasSession = !!(t.claudeSessionId || t.terminalSessionId);

  return `<div class="${cardClass}" draggable="true"
               ondragstart="onDragStart(event,'${t.id}')"
               ondragend="onDragEnd(event)"
               ${canClick ? `onclick="viewResult('${t.id}')" style="cursor:pointer"` : ''}
               ${isRunning ? `onclick="viewLiveLog('${t.id}')" style="cursor:pointer"` : ''}>
    <div class="card-actions">
      ${t.status === 'pending' ? `<button class="card-btn" onclick="event.stopPropagation();runSingleTask('${t.id}')" title="Run this task" style="color:#4ADE80;font-size:13px;">&#9654;</button>` : ''}
      ${t.status === 'pending' ? `<button class="card-btn" onclick="event.stopPropagation();editTask('${t.id}')" title="Edit">&#9998;</button>` : ''}
      ${t.status === 'pending' ? `<button class="card-btn" onclick="event.stopPropagation();openInTerminal('${t.id}')" title="Open in Terminal" style="color:#7B2FF2;font-size:12px;">💻</button>` : ''}
      ${(isRunning || isDone || isFailed) && hasSession ? `<button class="card-btn" onclick="event.stopPropagation();openTaskTerminal('${t.id}')" title="Chat with agent" style="color:#4ADE80;font-size:13px;">💬</button>` : ''}
      ${isFailed ? `<button class="card-btn" onclick="event.stopPropagation();retryById('${t.id}')" title="Retry" style="color:#FBBF24;">&#8635;</button>` : ''}
      ${(isDone || isFailed) ? `<button class="card-btn" onclick="event.stopPropagation();archiveTask('${t.id}')" title="Hide this task — find it later in History" style="color:#666;font-size:12px;">📁</button>` : ''}
      <button class="card-btn delete" onclick="event.stopPropagation();deleteTask('${t.id}')" title="Delete">&times;</button>
    </div>
    <div class="card-id">#${t.id}${t.task.startsWith('This is a follow-up to task') ? ` <span class="tag" style="background:rgba(123,47,242,0.15);color:#C084FC;font-size:10px;padding:1px 6px;vertical-align:middle;">↩ follow-up</span>` : ''}${t.plan_id ? ` <span class="tag" style="background:rgba(123,47,242,0.1);color:#888;font-size:10px;padding:1px 6px;vertical-align:middle;">📋 Step ${t.plan_step || '?'}/${t.plan_total || '?'}</span>` : ''}</div>
    <div class="card-task">${escHtml(getCardPreview(t))}</div>
    ${t.plan_id ? `<div class="plan-badge">${escHtml(t.plan_id)}</div>` : ''}
    <div class="card-meta">${tags.join('')}</div>
    ${runningHtml}
    ${errorHtml}
  </div>`;
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const esc = escHtml;

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Live Elapsed Timer + Live Status ──
setInterval(() => {
  document.querySelectorAll('.elapsed-timer').forEach(el => {
    const started = el.dataset.started;
    if (started) el.textContent = formatElapsed(started);
  });
}, 1000);

// Poll live status for running tasks every 3s
setInterval(async () => {
  const running = allTasks.filter(t => t.status === 'running');
  for (const t of running) {
    const el = document.getElementById(`live-status-${t.id}`);
    if (!el) continue;
    try {
      const data = await (await fetch(`/api/tasks/${t.id}/live`)).json();
      if (data.detail) {
        el.textContent = data.detail;
        el.style.display = '';
      }
    } catch (_) {}
  }
}, 3000);

// ── Drag & Drop ──
function onDragStart(e, id) { draggedTaskId = id; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function onDragEnd(e) { e.target.classList.remove('dragging'); draggedTaskId = null; document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); }
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
async function onDrop(e, s) { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); if (!draggedTaskId) return; await api.moveTask(draggedTaskId, s); await refresh(); }

