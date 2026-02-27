
  let allTasks = [];     // ALL tasks across all spaces
  let skills = [];
  let projects = [];
  let templates = [];    // Template definitions from server
  let routines = [];     // Routine definitions from server
  let activeTemplateId = null; // Currently open template popup
  let spaces = [];       // [{id, name, project_id, working_dir, context}]
  let activeSpaceId = null;
  let draggedTaskId = null;
  let pollInterval = null;
  let currentResultTaskId = null;
  let editingSpaceId = null; // for space settings modal
  let currentPlan = null;    // Task Master: plan being reviewed
  let planAbortController = null; // Task Master: for cancelling planning request
  let planTimerInterval = null;   // Task Master: elapsed timer
  let doneFilter = 'recent';     // 'recent' = last 10, 'all' = all non-archived
  let historyFilter = '';        // Current search in history modal

  // ── Workflow Builder State ──
  let wfEditingRoutineId = null;  // null = new, string = editing existing
  let wfNodes = [];               // [{id, template_id, x, y, variables, isTrigger}]
  let wfSelectedNodeId = null;
  let wfDragging = null;
  let wfNextNodeId = 0;
  let activeWorkflowRunId = null; // ID of currently executing workflow run
  let wfExecMode = false;         // true when canvas shows execution state
  let currentWorkflowRun = null;  // latest run data from server

  // ── API (with error handling) ──
  let serverDown = false;
  let serverDownSince = null;

  function showServerBanner(msg, type) {
    const banner = document.getElementById('serverBanner');
    const text = document.getElementById('serverBannerText');
    text.textContent = msg;
    banner.className = 'server-banner active' + (type === 'warning' ? ' warning' : '');
  }
  function hideServerBanner() {
    document.getElementById('serverBanner').className = 'server-banner';
  }

  async function safeFetch(url, opts) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) {
        const errText = await r.text().catch(() => r.statusText);
        throw new Error(`HTTP ${r.status}: ${errText}`);
      }
      // Server is reachable — clear any banner
      if (serverDown) {
        serverDown = false;
        serverDownSince = null;
        hideServerBanner();
      }
      return r;
    } catch (e) {
      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('ERR_CONNECTION')) {
        if (!serverDown) {
          serverDown = true;
          serverDownSince = Date.now();
        }
        showServerBanner('⚠ Cannot reach server — retrying...', 'error');
      }
      throw e;
    }
  }

  const api = {
    async getTasks() { return (await safeFetch('/api/tasks')).json(); },
    async getSkills() { return (await safeFetch('/api/skills')).json(); },
    async scanSkills() { return (await safeFetch('/api/skills/scan', { method:'POST' })).json(); },
    async getProjects() { return (await safeFetch('/api/projects')).json(); },
    async getTemplates() { return (await safeFetch('/api/templates')).json(); },
    async createProject(d) { return (await safeFetch('/api/projects', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async deleteProject(id) { return (await safeFetch(`/api/projects/${id}`, { method:'DELETE' })).json(); },
    async createTask(d) { return (await safeFetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async updateTask(id,d) { return (await safeFetch(`/api/tasks/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async deleteTask(id) { return (await safeFetch(`/api/tasks/${id}`, { method:'DELETE' })).json(); },
    async moveTask(id,s) { return (await safeFetch(`/api/tasks/${id}/move`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:s}) })).json(); },
    async getResult(id) { return (await safeFetch(`/api/tasks/${id}/result`)).json(); },
    async getLog(id) { try { const r = await safeFetch(`/api/tasks/${id}/log`); return r.ok ? await r.text() : null; } catch(_) { return null; } },
    async run(w) { const body = w ? {workers: w} : {}; return (await safeFetch('/api/run', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })).json(); },
    async stop() { return (await safeFetch('/api/stop', { method:'POST' })).json(); },
    async getWorkers() { return (await safeFetch('/api/workers')).json(); },
    async reset() { return (await safeFetch('/api/reset', { method:'POST' })).json(); },
    async archiveTasks(ids) { return (await safeFetch('/api/tasks/archive', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({task_ids: ids || []}) })).json(); },
    async unarchiveTask(id) { return (await safeFetch(`/api/tasks/${id}/unarchive`, { method:'POST' })).json(); },
    async generatePlan(goal) { return (await safeFetch('/api/plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({goal}) })).json(); },
    async approvePlan(d) { return (await safeFetch('/api/plan/approve', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async saveRoutine(d) { return (await safeFetch('/api/routines', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async saveCustomRoutine(d) { return (await safeFetch('/api/routines/custom', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async updateRoutine(id,d) { return (await safeFetch(`/api/routines/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async deleteRoutine(id) { return (await safeFetch(`/api/routines/${id}`, { method:'DELETE' })).json(); },
    async startWorkflowRun(d) { return (await safeFetch('/api/workflow-runs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async getWorkflowRun(id) { return (await safeFetch(`/api/workflow-runs/${id}`)).json(); },
    async getWorkflowRuns(active) { const q = active ? '?active=true' : ''; return (await safeFetch('/api/workflow-runs' + q)).json(); },
    async health() { return (await safeFetch('/api/health')).json(); },
    async getSchedules() { return (await safeFetch('/api/schedules')).json(); },
    async createSchedule(d) { return (await safeFetch('/api/schedules', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async updateSchedule(id,d) { return (await safeFetch(`/api/schedules/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async deleteSchedule(id) { return (await safeFetch(`/api/schedules/${id}`, { method:'DELETE' })).json(); },
    async runScheduleNow(id) { return (await safeFetch(`/api/schedules/${id}/run-now`, { method:'POST' })).json(); },
    // Terminal API
    async listTerminals() { return (await safeFetch('/api/terminal/sessions')).json(); },
    async createTerminal(d) { return (await safeFetch('/api/terminal/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
    async getTerminal(id) { return (await safeFetch(`/api/terminal/sessions/${id}`)).json(); },
    async sendTerminalInput(id, text) { return (await safeFetch(`/api/terminal/sessions/${id}/input`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text}) })).json(); },
    async deleteTerminal(id) { return (await safeFetch(`/api/terminal/sessions/${id}`, { method:'DELETE' })).json(); },
    async attachTerminal(taskId) { return (await safeFetch(`/api/tasks/${taskId}/attach-terminal`, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })).json(); },
  };

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

    html += `<div class="space-tab-add" onclick="createNewSpace()" title="New Space">+</div>`;
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

  function deleteCurrentSpace() {
    if (editingSpaceId === 'general') return;
    const space = spaces.find(s => s.id === editingSpaceId);
    if (!space) return;

    const tasksInSpace = allTasks.filter(t => (t.space_id || 'general') === editingSpaceId);
    let msg = `Delete space "${space.name}"?`;
    if (tasksInSpace.length > 0) msg += `\n\n${tasksInSpace.length} task(s) will be moved to General.`;

    if (!confirm(msg)) return;

    // Move tasks to general
    tasksInSpace.forEach(async t => {
      await api.updateTask(t.id, { space_id: 'general' });
    });

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
    if (!startIso) return '0:00';
    const sec = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
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
      const totalCount = items.length;
      document.getElementById(`count-${status}`).textContent = totalCount;

      // Apply "recent" filter to done column — show latest 10 by default
      let displayItems = items;
      if (status === 'done' && doneFilter === 'recent' && items.length > 10) {
        // Sort by completed_at descending, take 10
        displayItems = [...items].sort((a, b) =>
          (b.completed_at || '').localeCompare(a.completed_at || '')
        ).slice(0, 10);
      }

      // Show/hide the done filter bar
      if (status === 'done') {
        const filterBar = document.getElementById('doneFilter');
        filterBar.style.display = items.length > 5 ? 'flex' : 'none';
      }

      if (displayItems.length === 0) {
        const icons = { pending:'&#128203;', running:'&#128260;', done:'&#127881;', failed:'&#128295;' };
        el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icons[status]}</div><div>No ${status} tasks</div></div>`;
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
    if (t.worker) tags.push(`<span class="tag tag-worker">${t.worker}</span>`);
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
        ${t.status === 'pending' ? `<button class="card-btn" onclick="event.stopPropagation();editTask('${t.id}')" title="Edit">&#9998;</button>` : ''}
        ${t.status === 'pending' ? `<button class="card-btn" onclick="event.stopPropagation();openInTerminal('${t.id}')" title="Open in Terminal" style="color:#7B2FF2;font-size:12px;">💻</button>` : ''}
        ${(isRunning || isDone || isFailed) && hasSession ? `<button class="card-btn" onclick="event.stopPropagation();openTaskTerminal('${t.id}')" title="Chat with agent" style="color:#4ADE80;font-size:13px;">💬</button>` : ''}
        ${isFailed ? `<button class="card-btn" onclick="event.stopPropagation();retryById('${t.id}')" title="Retry" style="color:#FBBF24;">&#8635;</button>` : ''}
        ${(isDone || isFailed) ? `<button class="card-btn" onclick="event.stopPropagation();archiveTask('${t.id}')" title="Archive" style="color:#666;font-size:12px;">📁</button>` : ''}
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

  // ── Task Actions ──
  function openAddModal() {
    document.getElementById('editTaskId').value = '';
    document.getElementById('modalTitle').textContent = 'New Task';
    document.getElementById('taskInput').value = '';
    document.getElementById('skillInput').value = '';
    document.getElementById('priorityInput').value = '5';
    document.getElementById('modelInput').value = 'sonnet';
    document.getElementById('turnsInput').value = '25';
    document.getElementById('contextInput').value = '';
    document.getElementById('contextSummary').textContent = '';
    document.getElementById('contextDetails').removeAttribute('open');
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

  async function deleteTask(id) { if (!confirm('Delete this task?')) return; await api.deleteTask(id); await refresh(); }
  async function retryById(id) { await api.moveTask(id, 'pending'); await refresh(); }

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

  async function viewResult(id) {
    currentResultTaskId = id;
    currentResultText = '';
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
          viewResult(id);
        }
      } catch (_) {}
    }

    await updateLiveLog();
    liveLogInterval = setInterval(updateLiveLog, 2000);
  }

  function stopLiveLog() {
    if (liveLogInterval) { clearInterval(liveLogInterval); liveLogInterval = null; }
  }

  function closeResultModal() {
    document.getElementById('resultModal').classList.remove('active');
    currentResultText = '';
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

    // Build the combined task description
    const combinedTask = [
      `This is a follow-up to task #${parentTask.id}.`,
      ``,
      `Previous task description:`,
      parentTask.task,
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
        document.getElementById('runnerStatus').textContent = result.message || 'Error';
      }
    } catch (e) {
      document.getElementById('runnerStatus').textContent = 'Failed to start workers';
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
    await refresh();
  }

  async function resetAll() { if (!confirm('Reset all tasks to pending?')) return; await api.reset(); await refresh(); }

  // ── Templates & Routines ──

  function renderTemplateBar() {
    const container = document.getElementById('templateCards');
    const bar = document.getElementById('templateBar');
    if (!container || !bar) return;

    // Always show bar (has "+ New Routine" even when empty)
    bar.style.display = '';

    // Collapsed state
    const collapsed = localStorage.getItem('claude-tm-tpl-collapsed') === 'true';
    bar.classList.toggle('collapsed', collapsed);
    document.getElementById('templateBarToggle').textContent = collapsed ? '▸' : '▾';

    let html = '';

    // Routines first (prominent)
    routines.forEach(r => {
      const isPlanRoutine = r.source === 'task-master' && r.plan;
      const count = isPlanRoutine ? (r.plan.steps ? r.plan.steps.length : 0) : (r.tasks ? r.tasks.length : 0);
      const badge = isPlanRoutine ? 'PLAN' : `${count} tasks`;
      const badgeClass = isPlanRoutine ? 'plan-routine-badge' : 'routine-badge';
      const clickFn = isPlanRoutine ? `runSavedPlanRoutine('${r.id}')` : `runRoutine('${r.id}')`;
      const canEdit = !isPlanRoutine; // only edit template-based routines
      html += `<div class="tpl-card routine" onclick="${clickFn}" title="${escHtml(r.description || '')}" style="position:relative;">
        <span class="routine-clock" onclick="event.stopPropagation();scheduleRoutine('${r.id}')" title="Schedule" style="right:${canEdit ? '40' : '4'}px;">🕐</span>
        ${canEdit ? `<span class="routine-clock" onclick="event.stopPropagation();openRoutineBuilder('${r.id}')" title="Edit routine" style="right:22px;">✏️</span>` : ''}
        ${canEdit ? `<span class="routine-clock" onclick="event.stopPropagation();deleteRoutine('${r.id}')" title="Delete routine" style="right:4px;">🗑️</span>` : ''}
        <span class="tpl-card-icon">${r.icon || '⚡'}</span>
        <span class="tpl-card-name">${escHtml(r.name)}</span>
        <span class="${badgeClass}">${badge}</span>
      </div>`;
    });

    // "+ New Routine" card
    html += `<div class="tpl-card" onclick="openRoutineBuilder()" style="border-style:dashed;opacity:0.6;" title="Build a custom routine">
      <span class="tpl-card-icon">➕</span>
      <span class="tpl-card-name">New Routine</span>
    </div>`;

    // Divider
    if (routines.length > 0 && templates.length > 0) {
      html += `<div style="width:1px;height:32px;background:rgba(255,255,255,0.08);flex-shrink:0;margin:0 4px;"></div>`;
    }

    // Individual templates
    templates.forEach(t => {
      html += `<div class="tpl-card" onclick="useTemplate('${t.id}')">
        <span class="tpl-card-icon">${t.icon || '⚡'}</span>
        <span class="tpl-card-name">${escHtml(t.name)}</span>
      </div>`;
    });

    container.innerHTML = html;
  }

  function toggleTemplateBar() {
    const cur = localStorage.getItem('claude-tm-tpl-collapsed') === 'true';
    localStorage.setItem('claude-tm-tpl-collapsed', String(!cur));
    renderTemplateBar();
  }

  function useTemplate(templateId) {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;

    // No variables → instant create + run
    if (!tpl.variables || tpl.variables.length === 0) {
      createTaskFromTemplate(tpl, {});
      return;
    }

    // Show variable popup
    activeTemplateId = templateId;
    document.getElementById('templatePopupTitle').innerHTML =
      `<span style="margin-right:8px;">${tpl.icon || '⚡'}</span>${escHtml(tpl.name)}`;

    let fieldsHtml = '';
    tpl.variables.forEach(v => {
      const optLabel = v.required === false ? ' <span style="color:#666;font-weight:400;">(optional)</span>' : '';
      fieldsHtml += `<div class="form-group">
        <label>${escHtml(v.label || v.name)}${optLabel}</label>
        <input type="text" id="tpl-var-${v.name}" placeholder="${escHtml(v.placeholder || '')}"
               value="${escHtml(v.default || '')}" class="tpl-var-input">
      </div>`;
    });

    document.getElementById('templatePopupFields').innerHTML = fieldsHtml;
    document.getElementById('templatePopup').classList.add('active');
    const first = document.querySelector('.tpl-var-input');
    if (first) setTimeout(() => first.focus(), 100);
  }

  function closeTemplatePopup() {
    document.getElementById('templatePopup').classList.remove('active');
    activeTemplateId = null;
  }

  async function submitTemplate() {
    if (!activeTemplateId) return;
    const tpl = templates.find(t => t.id === activeTemplateId);
    if (!tpl) return;

    // Gather variables
    const vars = {};
    let hasError = false;
    (tpl.variables || []).forEach(v => {
      const input = document.getElementById(`tpl-var-${v.name}`);
      const val = input ? input.value.trim() : (v.default || '');
      if (v.required !== false && !val) {
        if (input) input.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        hasError = true;
      }
      vars[v.name] = val || (v.default || '');
    });
    if (hasError) return;

    closeTemplatePopup();
    await createTaskFromTemplate(tpl, vars);
  }

  async function createTaskFromTemplate(tpl, vars) {
    // Substitute variables into prompt
    let prompt = tpl.prompt_template;
    Object.entries(vars).forEach(([key, val]) => {
      prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
    });
    // Clean unfilled optional placeholders
    prompt = prompt.replace(/\{[a-zA-Z_]+\}/g, '').replace(/\s{2,}/g, ' ').trim();

    const space = getActiveSpace();
    const taskData = {
      task: prompt,
      skill: tpl.skill || null,
      priority: 1,
      model: tpl.model || 'sonnet',
      max_turns: tpl.max_turns || 25,
      context: space.context || [],
      extra_context: [],
      working_dir: space.working_dir || null,
      space_id: activeSpaceId
    };

    await api.createTask(taskData);
    await refresh();

    // Auto-run
    const result = await api.run();
    if (result.ok) {
      document.getElementById('runnerStatus').textContent = `Running: ${tpl.name}`;
      startPolling();
    }
  }

  // ── Archive & History ──

  function setDoneFilter(mode) {
    doneFilter = mode;
    document.getElementById('filterRecent').classList.toggle('active', mode === 'recent');
    document.getElementById('filterAll').classList.toggle('active', mode === 'all');
    renderBoard();
  }

  async function archiveAllDone() {
    const doneTasks = getSpaceTasks().filter(t => t.status === 'done');
    if (doneTasks.length === 0) return;
    if (!confirm(`Archive ${doneTasks.length} completed task${doneTasks.length > 1 ? 's' : ''}? They'll move to History.`)) return;
    const ids = doneTasks.map(t => t.id);
    await api.archiveTasks(ids);
    await refresh();
  }

  async function archiveAllFailed() {
    const failedTasks = getSpaceTasks().filter(t => t.status === 'failed');
    if (failedTasks.length === 0) return;
    if (!confirm(`Archive ${failedTasks.length} failed task${failedTasks.length > 1 ? 's' : ''}? They'll move to History.`)) return;
    const ids = failedTasks.map(t => t.id);
    await api.archiveTasks(ids);
    await refresh();
  }

  async function archiveTask(id) {
    await api.archiveTasks([id]);
    await refresh();
  }

  function openHistory() {
    document.getElementById('historyModal').classList.add('active');
    document.getElementById('historySearch').value = '';
    historyFilter = '';
    renderHistory();
    setTimeout(() => document.getElementById('historySearch').focus(), 100);
  }

  function closeHistory() {
    document.getElementById('historyModal').classList.remove('active');
  }

  function renderHistory() {
    const search = document.getElementById('historySearch').value.toLowerCase().trim();
    // Get all archived tasks across all spaces, sorted by date (newest first)
    let archived = allTasks.filter(t => t.archived);
    archived.sort((a, b) => (b.archived_at || b.completed_at || '').localeCompare(a.archived_at || a.completed_at || ''));

    // Apply search filter
    if (search) {
      archived = archived.filter(t => {
        const haystack = [t.task, t.skill, t.plan_id, t.id].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }

    document.getElementById('historyCount').textContent = `${archived.length} archived task${archived.length !== 1 ? 's' : ''}`;

    const list = document.getElementById('historyList');
    if (archived.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">📁</div><div>${search ? 'No matches found' : 'No archived tasks yet'}</div><div style="color:#555;font-size:12px;margin-top:8px;">Use the "Archive" button in the Done or Failed columns to move completed tasks here.</div></div>`;
      return;
    }

    // Group by date
    const groups = {};
    archived.forEach(t => {
      const date = (t.archived_at || t.completed_at || '').slice(0, 10);
      const label = formatDateLabel(date);
      if (!groups[label]) groups[label] = [];
      groups[label].push(t);
    });

    let html = '';
    Object.entries(groups).forEach(([label, tasks]) => {
      html += `<div style="font-size:11px;color:#666;padding:8px 4px 4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${escHtml(label)}</div>`;
      html += '<div class="history-list">';
      tasks.forEach(t => {
        const statusClass = t.status === 'done' ? 'done' : 'failed';
        const skillTag = t.skill ? `<span class="tag tag-skill" style="font-size:10px;">${escHtml(t.skill)}</span>` : '';
        const planTag = t.plan_id ? `<span class="tag" style="background:rgba(123,47,242,0.1);color:#888;font-size:10px;padding:1px 4px;">📋 ${escHtml(t.plan_id)}</span>` : '';
        const time = (t.completed_at || t.archived_at || '').slice(11, 16);

        html += `<div class="history-item" onclick="viewResult('${t.id}')">
          <span class="hi-id">#${t.id}</span>
          <span class="hi-task">${escHtml(getCardPreview(t).slice(0, 100))}</span>
          <div class="hi-meta">
            ${skillTag}${planTag}
            <span class="hi-date">${time}</span>
            <span class="hi-status ${statusClass}">${t.status}</span>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();unarchiveTask('${t.id}')" title="Restore to board" style="padding:2px 6px;font-size:11px;">↩</button>
          </div>
        </div>`;
      });
      html += '</div>';
    });

    list.innerHTML = html;
  }

  function formatDateLabel(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = Math.floor((today - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  }

  async function unarchiveTask(id) {
    await api.unarchiveTask(id);
    await refresh();
    renderHistory(); // Update the history list too
  }

  // ── Schedules ──

  let allSchedules = [];

  async function openSchedules(preSelectRoutineId) {
    document.getElementById('schedulesModal').classList.add('active');
    document.getElementById('scheduleListView').style.display = '';
    document.getElementById('scheduleFormView').style.display = 'none';
    document.getElementById('scheduleListActions').style.display = '';

    // Show timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.getElementById('scheduleTzInfo').textContent = `Timezone: ${tz}`;

    try {
      const data = await api.getSchedules();
      allSchedules = data.schedules || [];
    } catch (_) { allSchedules = []; }

    renderScheduleList();

    if (preSelectRoutineId) {
      showScheduleForm(preSelectRoutineId);
    }
  }

  function closeSchedules() {
    document.getElementById('schedulesModal').classList.remove('active');
  }

  function renderScheduleList() {
    const list = document.getElementById('scheduleList');
    if (allSchedules.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:40px;">
        <div class="empty-state-icon">🕐</div>
        <div>No schedules yet</div>
        <div style="color:#555;font-size:12px;margin-top:8px;">Create a schedule to auto-run routines at specific times.</div>
      </div>`;
      return;
    }

    let html = '';
    allSchedules.forEach(s => {
      const onClass = s.enabled ? 'on' : '';
      const disabledClass = s.enabled ? '' : ' disabled';
      const icon = s.routine_icon || '📋';
      const daysLabel = formatDaysLabel(s.days);
      const timeStr = `${String(s.time.hour).padStart(2, '0')}:${String(s.time.minute).padStart(2, '0')}`;
      const nextRun = s.enabled && s.next_run ? formatNextRun(s.next_run) : 'Disabled';
      const nextRunClass = s.enabled ? 'next-run' : '';

      let historyLine = '';
      if (s.last_run) {
        const lastDate = new Date(s.last_run);
        const timeAgo = formatTimeAgo(lastDate);
        const statusClass = 'status-' + (s.last_run_status || 'ok');
        const statusIcon = s.last_run_status === 'ok' ? '✅' : s.last_run_status === 'skipped' ? '⏭' : '❌';
        const h = s.history && s.history[0] ? s.history[0] : {};
        const detail = h.tasks_created ? ` — ${h.tasks_created} tasks` : '';
        const reason = h.reason ? ` (${h.reason})` : '';
        historyLine = `<div class="schedule-history-line">Last: ${timeAgo} <span class="${statusClass}">${statusIcon} ${s.last_run_status || 'ok'}${reason}${detail}</span></div>`;
      }

      html += `<div class="schedule-item${disabledClass}">
        <button class="schedule-toggle ${onClass}" onclick="event.stopPropagation();toggleSchedule('${s.id}',${!s.enabled})" title="${s.enabled ? 'Disable' : 'Enable'}"></button>
        <div class="schedule-info">
          <div class="schedule-name"><span class="schedule-icon">${icon}</span> ${escHtml(s.name)}</div>
          <div class="schedule-detail">${daysLabel} at ${timeStr} · Next: <span class="${nextRunClass}">${nextRun}</span></div>
          ${historyLine}
        </div>
        <div class="schedule-actions">
          <button onclick="event.stopPropagation();editSchedule('${s.id}')" title="Edit">✏️</button>
          <button onclick="event.stopPropagation();runScheduleNow('${s.id}')" title="Run now">▶</button>
          <button onclick="event.stopPropagation();deleteSchedule('${s.id}')" title="Delete">🗑</button>
        </div>
      </div>`;
    });

    list.innerHTML = html;
  }

  function formatDaysLabel(days) {
    if (days === 'daily') return 'Every day';
    if (days === 'weekdays') return 'Weekdays';
    if (days === 'weekends') return 'Weekends';
    if (Array.isArray(days)) {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days.map(d => names[d]).join(', ');
    }
    return 'Custom';
  }

  function formatNextRun(isoStr) {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = d - now;
    if (diffMs < 0) return 'Overdue';

    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);

    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today ${timeStr} (in ${diffH}h ${diffM}m)`;
    if (isTomorrow) return `Tomorrow ${timeStr}`;
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + timeStr;
  }

  function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffM = Math.floor(diffMs / 60000);
    if (diffM < 60) return `${diffM}m ago`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  }

  function showScheduleForm(preRoutineId) {
    document.getElementById('scheduleListView').style.display = 'none';
    document.getElementById('scheduleFormView').style.display = '';
    document.getElementById('scheduleListActions').style.display = 'none';
    document.getElementById('scheduleFormTitle').textContent = 'New Schedule';
    document.getElementById('editScheduleId').value = '';

    // Populate routine dropdown
    const sel = document.getElementById('scheduleRoutineSelect');
    sel.innerHTML = '<option value="">Select a routine...</option>';
    routines.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.icon || '📋'} ${r.name}`;
      sel.appendChild(opt);
    });
    if (preRoutineId) sel.value = preRoutineId;

    // Defaults
    document.getElementById('scheduleTimeInput').value = '09:00';
    document.getElementById('scheduleDaysInput').value = 'weekdays';
    document.getElementById('customDayPicker').style.display = 'none';

    // Space note
    const space = getActiveSpace();
    document.getElementById('scheduleSpaceNote').textContent = `${space.name || activeSpaceId}${space.working_dir ? ' — ' + space.working_dir.split(/[/\\]/).pop() : ''}`;

    // Timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.getElementById('scheduleFormTz').textContent = `(${tz})`;
  }

  function editSchedule(id) {
    const s = allSchedules.find(sc => sc.id === id);
    if (!s) return;

    showScheduleForm(s.routine_id);
    document.getElementById('scheduleFormTitle').textContent = 'Edit Schedule';
    document.getElementById('editScheduleId').value = s.id;
    document.getElementById('scheduleTimeInput').value = `${String(s.time.hour).padStart(2, '0')}:${String(s.time.minute).padStart(2, '0')}`;

    if (Array.isArray(s.days)) {
      document.getElementById('scheduleDaysInput').value = 'custom';
      document.getElementById('customDayPicker').style.display = 'flex';
      document.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.toggle('active', s.days.includes(parseInt(btn.dataset.day)));
      });
    } else {
      document.getElementById('scheduleDaysInput').value = s.days;
    }
  }

  function hideScheduleForm() {
    document.getElementById('scheduleListView').style.display = '';
    document.getElementById('scheduleFormView').style.display = 'none';
    document.getElementById('scheduleListActions').style.display = '';
  }

  function onScheduleDaysChange() {
    const val = document.getElementById('scheduleDaysInput').value;
    document.getElementById('customDayPicker').style.display = val === 'custom' ? 'flex' : 'none';
  }

  function toggleScheduleDay(btn) {
    btn.classList.toggle('active');
  }

  async function saveSchedule() {
    const routineId = document.getElementById('scheduleRoutineSelect').value;
    if (!routineId) { alert('Please select a routine'); return; }

    const routine = routines.find(r => r.id === routineId);
    const timeVal = document.getElementById('scheduleTimeInput').value;
    const [h, m] = timeVal.split(':').map(Number);

    let days = document.getElementById('scheduleDaysInput').value;
    if (days === 'custom') {
      const selected = [];
      document.querySelectorAll('.day-btn.active').forEach(btn => {
        selected.push(parseInt(btn.dataset.day));
      });
      if (selected.length === 0) { alert('Please select at least one day'); return; }
      days = selected.sort();
    }

    const space = getActiveSpace();
    const editId = document.getElementById('editScheduleId').value;

    try {
      if (editId) {
        await api.updateSchedule(editId, {
          name: routine ? routine.name : 'Schedule',
          routine_id: routineId,
          time: { hour: h, minute: m },
          days
        });
      } else {
        await api.createSchedule({
          name: routine ? routine.name : 'Schedule',
          routine_id: routineId,
          time: { hour: h, minute: m },
          days,
          space_id: activeSpaceId,
          working_dir: space.working_dir || null,
          context: space.context || []
        });
      }

      // Reload
      const data = await api.getSchedules();
      allSchedules = data.schedules || [];
      hideScheduleForm();
      renderScheduleList();
    } catch (e) {
      alert('Failed to save schedule: ' + e.message);
    }
  }

  async function toggleSchedule(id, enabled) {
    try {
      await api.updateSchedule(id, { enabled });
      const data = await api.getSchedules();
      allSchedules = data.schedules || [];
      renderScheduleList();
    } catch (_) {}
  }

  async function deleteSchedule(id) {
    if (!confirm('Delete this schedule?')) return;
    try {
      await api.deleteSchedule(id);
      const data = await api.getSchedules();
      allSchedules = data.schedules || [];
      renderScheduleList();
    } catch (_) {}
  }

  async function runScheduleNow(id) {
    if (!confirm('Run this schedule now?')) return;
    try {
      await api.runScheduleNow(id);
      const data = await api.getSchedules();
      allSchedules = data.schedules || [];
      renderScheduleList();
      await refresh();
      startPolling();
    } catch (e) {
      alert('Failed: ' + e.message);
    }
  }

  function scheduleRoutine(routineId) {
    openSchedules(routineId);
  }

  // ── Routine Builder ──

  let rbSteps = []; // [{template_id, variables: {}}]

  function openRoutineBuilder(editId) {
    const modal = document.getElementById('routineBuilderModal');
    document.getElementById('rbEditId').value = editId || '';
    document.getElementById('rbTitle').textContent = editId ? 'Edit Routine' : 'Build a Routine';

    if (editId) {
      const routine = routines.find(r => r.id === editId);
      if (!routine) return;
      document.getElementById('rbName').value = routine.name;
      document.getElementById('rbIcon').value = routine.icon || '⚡';
      document.getElementById('rbDescription').value = routine.description || '';
      rbSteps = (routine.tasks || []).map(t => ({
        template_id: t.template_id,
        variables: { ...(t.variables || {}) }
      }));
    } else {
      document.getElementById('rbName').value = '';
      document.getElementById('rbIcon').value = '⚡';
      document.getElementById('rbDescription').value = '';
      rbSteps = [];
    }

    renderRbSteps();
    modal.classList.add('active');
  }

  function closeRoutineBuilder() {
    document.getElementById('routineBuilderModal').classList.remove('active');
    document.getElementById('rbTemplatePicker').style.display = 'none';
  }

  function renderRbSteps() {
    const container = document.getElementById('rbSteps');
    if (rbSteps.length === 0) {
      container.innerHTML = '<div class="rb-empty">No steps yet. Click "+ Add Step" to get started.</div>';
      return;
    }

    let html = '';
    rbSteps.forEach((step, i) => {
      const tpl = templates.find(t => t.id === step.template_id);
      const name = tpl ? `${tpl.icon || '⚡'} ${tpl.name}` : step.template_id;
      const vars = tpl ? (tpl.variables || []) : [];

      html += `<div class="rb-step">
        <div class="rb-step-header">
          <span class="rb-step-num">${i + 1}</span>
          <span class="rb-step-name">${escHtml(name)}</span>
          <div class="rb-step-actions">
            ${i > 0 ? `<button onclick="rbMoveStep(${i},-1)" title="Move up">↑</button>` : ''}
            ${i < rbSteps.length - 1 ? `<button onclick="rbMoveStep(${i},1)" title="Move down">↓</button>` : ''}
            <button onclick="rbRemoveStep(${i})" title="Remove" style="color:#F87171;">✕</button>
          </div>
        </div>`;

      if (vars.length > 0) {
        html += '<div class="rb-step-vars">';
        vars.forEach(v => {
          const val = step.variables[v.name] || v.default || '';
          html += `<div>
            <label>${escHtml(v.label || v.name)}${v.required ? ' *' : ''}</label>
            <input type="text" value="${escHtml(val)}"
              placeholder="${escHtml(v.placeholder || '')}"
              onchange="rbUpdateVar(${i},'${escHtml(v.name)}',this.value)">
          </div>`;
        });
        html += '</div>';
      }

      html += '</div>';
    });

    container.innerHTML = html;
  }

  function rbShowTemplatePicker() {
    const picker = document.getElementById('rbTemplatePicker');
    const grid = document.getElementById('rbTemplateGrid');

    if (picker.style.display !== 'none') {
      picker.style.display = 'none';
      return;
    }

    let html = '';
    templates.forEach(t => {
      html += `<div class="rb-tpl-option" onclick="rbAddStep('${t.id}')">
        <span class="rb-tpl-option-icon">${t.icon || '⚡'}</span>
        <span class="rb-tpl-option-name">${escHtml(t.name)}</span>
      </div>`;
    });

    if (templates.length === 0) {
      html = '<div class="rb-empty">No templates available yet.</div>';
    }

    grid.innerHTML = html;
    picker.style.display = '';
  }

  function rbAddStep(templateId) {
    const tpl = templates.find(t => t.id === templateId);
    const vars = {};
    if (tpl && tpl.variables) {
      tpl.variables.forEach(v => {
        if (v.default) vars[v.name] = v.default;
      });
    }
    rbSteps.push({ template_id: templateId, variables: vars });
    document.getElementById('rbTemplatePicker').style.display = 'none';
    renderRbSteps();
  }

  function rbRemoveStep(idx) {
    rbSteps.splice(idx, 1);
    renderRbSteps();
  }

  function rbMoveStep(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= rbSteps.length) return;
    [rbSteps[idx], rbSteps[newIdx]] = [rbSteps[newIdx], rbSteps[idx]];
    renderRbSteps();
  }

  function rbUpdateVar(stepIdx, varName, value) {
    if (rbSteps[stepIdx]) {
      rbSteps[stepIdx].variables[varName] = value;
    }
  }

  async function saveRoutineBuilder() {
    const editId = document.getElementById('rbEditId').value;
    const name = document.getElementById('rbName').value.trim();
    const icon = document.getElementById('rbIcon').value.trim() || '⚡';
    const description = document.getElementById('rbDescription').value.trim();

    if (!name) { showToast('Routine name is required', 'error'); return; }
    if (rbSteps.length === 0) { showToast('Add at least one step', 'error'); return; }

    // Clean up empty variable values
    const cleanTasks = rbSteps.map(s => {
      const vars = {};
      for (const [k, v] of Object.entries(s.variables)) {
        if (v) vars[k] = v;
      }
      return { template_id: s.template_id, variables: vars };
    });

    try {
      if (editId) {
        await api.updateRoutine(editId, { name, icon, description, tasks: cleanTasks });
        showToast(`Updated routine "${name}"`, 'success');
      } else {
        await api.saveCustomRoutine({ name, icon, description, tasks: cleanTasks });
        showToast(`Created routine "${name}" with ${cleanTasks.length} steps`, 'success');
      }

      // Refresh routines
      const tplData = await api.getTemplates();
      templates = tplData.templates || [];
      routines = tplData.routines || [];
      renderTemplateBar();
      closeRoutineBuilder();
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    }
  }

  async function deleteRoutine(routineId) {
    const routine = routines.find(r => r.id === routineId);
    if (!routine) return;
    if (!confirm(`Delete routine "${routine.name}"? This cannot be undone.`)) return;

    try {
      await api.deleteRoutine(routineId);
      showToast(`Deleted routine "${routine.name}"`, 'success');
      const tplData = await api.getTemplates();
      templates = tplData.templates || [];
      routines = tplData.routines || [];
      renderTemplateBar();
    } catch (e) {
      showToast('Failed to delete: ' + e.message, 'error');
    }
  }

  // ── Agent Terminal ──

  let terminalSessions = {}; // id → { eventSource, outputEl }
  let terminalLayout = 1;

  let currentView = 'board';

  function switchView(view) {
    if (view === currentView) return;
    currentView = view;

    // Toggle view-active class
    document.querySelectorAll('.view').forEach(v => v.classList.remove('view-active'));
    const viewMap = { board: 'boardView', terminals: 'terminalViewWrapper', workflows: 'workflowView' };
    const target = document.getElementById(viewMap[view]);
    if (target) target.classList.add('view-active');

    // Toggle sidebar active state
    document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    if (view === 'terminals') refreshTerminals();
    if (view === 'workflows') wfRenderList();
  }

  function openTerminalPanel() {
    switchView('terminals');
  }

  // ── openTaskTerminal — the core task↔terminal linking function ──
  async function openTaskTerminal(taskId) {
    switchView('terminals');

    // Check if task already has a terminal pane open
    for (const [sessId, sess] of Object.entries(terminalSessions)) {
      const pane = document.getElementById(`pane-${sessId}`);
      if (pane && pane.dataset.linkedTaskId === String(taskId)) {
        // Already open — scroll to it and highlight
        pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        pane.classList.add('highlighted');
        setTimeout(() => pane.classList.remove('highlighted'), 2000);
        const input = document.getElementById(`input-${sessId}`);
        if (input) input.focus();
        return;
      }
    }

    // Call the attach-terminal endpoint
    try {
      const result = await api.attachTerminal(taskId);
      if (!result.ok) {
        showToast('Failed to attach terminal: ' + (result.error || 'Unknown'), 'error');
        return;
      }

      if (result.reused) {
        // Terminal exists on server but we don't have the pane — add it
        if (!terminalSessions[result.session.id]) {
          addTerminalPane(result.session, taskId);
        }
        const pane = document.getElementById(`pane-${result.session.id}`);
        if (pane) {
          pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          pane.classList.add('highlighted');
          setTimeout(() => pane.classList.remove('highlighted'), 2000);
        }
      } else {
        // New terminal created — add pane
        addTerminalPane(result.session, taskId);
        document.getElementById('terminalEmpty').style.display = 'none';

        // Auto-adjust layout
        const paneCount = Object.keys(terminalSessions).length;
        if (paneCount === 2 && terminalLayout === 1) setTerminalLayout(2);
        if (paneCount >= 3 && terminalLayout < 4) setTerminalLayout(4);
      }

      updateTerminalBadge();
      showToast(`Terminal attached to task #${taskId}`, 'success');
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    }
  }

  function updateTerminalBadge() {
    const badge = document.getElementById('terminalCountBadge');
    if (badge) {
      const count = Object.keys(terminalSessions).length;
      badge.textContent = count;
      badge.dataset.count = count;
      badge.style.display = count > 0 ? '' : 'none';
    }
  }

  // Track which task IDs we've already auto-created terminals for
  const autoCreatedTerminals = new Set();

  async function autoCreateTerminalForTask(task) {
    if (autoCreatedTerminals.has(task.id)) return;
    autoCreatedTerminals.add(task.id);

    // Small delay to let worker write claudeSessionId to tasks.json
    await new Promise(r => setTimeout(r, 1500));

    try {
      const result = await api.attachTerminal(task.id);
      if (!result.ok) return;

      const sessId = result.session.id;
      if (!terminalSessions[sessId]) {
        addTerminalPane(result.session, task.id);
        document.getElementById('terminalEmpty').style.display = 'none';

        // Mark the pane as "task running" — disable input
        const pane = document.getElementById(`pane-${sessId}`);
        if (pane) {
          const inputEl = document.getElementById(`input-${sessId}`);
          if (inputEl) {
            inputEl.disabled = true;
            inputEl.placeholder = 'Task is running — will be available for chat when done...';
          }
          // Add a running indicator to the output
          const outputEl = document.getElementById(`output-${sessId}`);
          if (outputEl) {
            outputEl.textContent += '\n⏳ Task is currently running via worker...\n   Terminal will be ready for --resume chat once the task completes.\n\n';
          }
        }
      }

      // Auto-adjust layout
      const paneCount = Object.keys(terminalSessions).length;
      if (paneCount === 2 && terminalLayout === 1) setTerminalLayout(2);
      if (paneCount >= 3 && terminalLayout < 4) setTerminalLayout(4);

      updateTerminalBadge();
    } catch (e) {
      console.warn('Auto-create terminal failed for task', task.id, e);
    }
  }

  function autoUpdateTerminalForTask(task) {
    // When task finishes, enable the terminal input for --resume chat
    for (const [sessId, sess] of Object.entries(terminalSessions)) {
      const pane = document.getElementById(`pane-${sessId}`);
      if (pane && pane.dataset.linkedTaskId === String(task.id)) {
        const inputEl = document.getElementById(`input-${sessId}`);
        if (inputEl) {
          inputEl.disabled = false;
          inputEl.placeholder = 'Type a message...';
        }
        const outputEl = document.getElementById(`output-${sessId}`);
        if (outputEl) {
          const statusIcon = task.status === 'done' ? '✅' : '❌';
          outputEl.textContent += `\n${statusIcon} Task ${task.status}${task.error ? ': ' + task.error : ''}\n💬 You can now chat — this terminal will --resume the task conversation.\n\n`;
          outputEl.scrollTop = outputEl.scrollHeight;
        }
        // Highlight briefly
        pane.classList.add('highlighted');
        setTimeout(() => pane.classList.remove('highlighted'), 2000);
        break;
      }
    }
  }

  async function refreshTerminals() {
    try {
      const sessions = await api.listTerminals();
      const grid = document.getElementById('terminalGrid');
      const empty = document.getElementById('terminalEmpty');

      // Connect to any sessions we're not yet connected to
      for (const s of sessions) {
        if (!terminalSessions[s.id]) {
          addTerminalPane(s);
        }
        // Update status indicator
        const statusEl = document.querySelector(`#pane-${CSS.escape(s.id)} .terminal-pane-status`);
        if (statusEl) {
          statusEl.className = `terminal-pane-status ${s.status}`;
        }
      }

      // Remove panes for sessions that no longer exist
      for (const id of Object.keys(terminalSessions)) {
        if (!sessions.find(s => s.id === id)) {
          removeTerminalPane(id);
        }
      }

      if (empty) empty.style.display = sessions.length === 0 ? '' : 'none';
    } catch (e) {
      console.warn('Failed to refresh terminals:', e);
    }
  }

  function addTerminalPane(session, linkedTaskId) {
    const grid = document.getElementById('terminalGrid');
    const taskId = linkedTaskId || session.linkedTaskId || null;

    const pane = document.createElement('div');
    pane.className = 'terminal-pane';
    pane.id = `pane-${session.id}`;
    if (taskId) pane.dataset.linkedTaskId = String(taskId);

    const skillBadge = session.skill ? `<span class="terminal-pane-skill">${escHtml(session.skill)}</span>` : '';
    const taskBadge = taskId ? `<span class="terminal-task-badge" onclick="event.stopPropagation();scrollToTask('${taskId}')" title="Go to task #${taskId}">#${taskId}</span>` : '';

    pane.innerHTML = `
      <div class="terminal-pane-header">
        <span class="terminal-pane-status ${session.status}"></span>
        <span class="terminal-pane-name">${escHtml(session.name)}</span>
        ${taskBadge}
        ${skillBadge}
        <button class="terminal-pane-kill" onclick="killTerminal('${session.id}')" title="Kill session">✕</button>
      </div>
      <div class="terminal-output" id="output-${session.id}"></div>
      <div class="terminal-input-bar">
        <span>❯</span>
        <input type="text" id="input-${session.id}" placeholder="Type a message..."
          onkeydown="if(event.key==='Enter'){sendTermInput('${session.id}');event.preventDefault()}"
          ${session.status === 'dead' ? 'disabled' : ''}>
      </div>
    `;

    grid.appendChild(pane);

    // Connect SSE
    connectTerminalSSE(session.id);
    updateTerminalBadge();
  }

  function scrollToTask(taskId) {
    // Switch to board view first, then find and highlight the card
    switchView('board');
    setTimeout(() => {
      const card = document.querySelector(`[ondragstart*="'${taskId}'"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.transition = 'box-shadow 0.3s';
        card.style.boxShadow = '0 0 20px rgba(123,47,242,0.4)';
        setTimeout(() => { card.style.boxShadow = ''; }, 2000);
      }
    }, 50);
  }

  function connectTerminalSSE(sessionId) {
    const outputEl = document.getElementById(`output-${sessionId}`);
    if (!outputEl) return;

    const es = new EventSource(`/api/terminal/sessions/${sessionId}/stream`);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'catchup' || msg.type === 'output') {
          outputEl.textContent += msg.data;
          outputEl.scrollTop = outputEl.scrollHeight;
        } else if (msg.type === 'status') {
          const statusEl = document.querySelector(`#pane-${CSS.escape(sessionId)} .terminal-pane-status`);
          if (statusEl) statusEl.className = `terminal-pane-status ${msg.data}`;
          const inputEl = document.getElementById(`input-${sessionId}`);
          if (inputEl) {
            inputEl.disabled = (msg.data === 'dead');
            inputEl.placeholder = msg.data === 'thinking' ? 'Claude is thinking...' : 'Type a message...';
          }
        }
      } catch (e) {}
    };

    es.onerror = () => {
      // SSE will auto-reconnect, but mark if fully closed
    };

    terminalSessions[sessionId] = { eventSource: es, outputEl };
  }

  function removeTerminalPane(sessionId) {
    const session = terminalSessions[sessionId];
    if (session) {
      if (session.eventSource) session.eventSource.close();
      delete terminalSessions[sessionId];
    }
    const pane = document.getElementById(`pane-${sessionId}`);
    if (pane) pane.remove();

    const grid = document.getElementById('terminalGrid');
    const empty = document.getElementById('terminalEmpty');
    if (empty && grid.children.length <= 1) empty.style.display = '';
    updateTerminalBadge();
  }

  async function sendTermInput(sessionId) {
    const inputEl = document.getElementById(`input-${sessionId}`);
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    try {
      await api.sendTerminalInput(sessionId, text);
    } catch (e) {
      showToast('Failed to send: ' + e.message, 'error');
    }
  }

  async function killTerminal(sessionId) {
    if (!confirm('Kill this terminal session?')) return;
    try {
      await api.deleteTerminal(sessionId);
      removeTerminalPane(sessionId);
      showToast('Terminal closed', 'info');
    } catch (e) {
      showToast('Failed to kill: ' + e.message, 'error');
    }
  }

  async function setTerminalLayout(cols) {
    terminalLayout = cols;
    const grid = document.getElementById('terminalGrid');
    grid.className = `terminal-grid layout-${cols}`;
    document.querySelectorAll('.layout-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.layout) === cols);
    });

    // Auto-create terminals to fill the grid
    const currentCount = Object.keys(terminalSessions).length;
    if (currentCount < cols) {
      const space = spaces.find(s => s.id === activeSpaceId);
      const workingDir = (space && space.working_dir) || null;
      const model = 'sonnet';
      for (let i = currentCount; i < cols; i++) {
        try {
          const name = `Terminal ${i + 1}`;
          const result = await api.createTerminal({ name, skill: null, model, workingDir });
          if (result.ok) {
            addTerminalPane(result.session);
            document.getElementById('terminalEmpty').style.display = 'none';
          }
        } catch (e) {
          console.error('Auto-create terminal failed:', e);
        }
      }
      showToast(`Launched ${cols - currentCount} terminal${cols - currentCount > 1 ? 's' : ''}`, 'success');
    }
  }

  function openNewTerminalModal() {
    const modal = document.getElementById('newTerminalModal');
    document.getElementById('ntName').value = '';
    document.getElementById('ntModel').value = 'sonnet';
    document.getElementById('ntWorkDir').value = '';

    // Populate skill dropdown
    const sel = document.getElementById('ntSkill');
    sel.innerHTML = '<option value="">None (general)</option>';
    skills.forEach(s => {
      if (s.exists) {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = `${s.name} - ${s.description}`;
        sel.appendChild(opt);
      }
    });

    // Pre-fill working dir from active space
    const space = spaces.find(s => s.id === activeSpaceId);
    if (space && space.working_dir) {
      document.getElementById('ntWorkDir').value = space.working_dir;
    }

    modal.classList.add('active');
    document.getElementById('ntName').focus();
  }

  function closeNewTerminalModal() {
    document.getElementById('newTerminalModal').classList.remove('active');
  }

  async function createNewTerminal() {
    const name = document.getElementById('ntName').value.trim() || `Terminal ${Object.keys(terminalSessions).length + 1}`;
    const skill = document.getElementById('ntSkill').value || null;
    const model = document.getElementById('ntModel').value || 'sonnet';
    const workingDir = document.getElementById('ntWorkDir').value.trim() || null;

    try {
      const result = await api.createTerminal({ name, skill, model, workingDir });
      if (result.ok) {
        closeNewTerminalModal();
        addTerminalPane(result.session);
        document.getElementById('terminalEmpty').style.display = 'none';

        // Auto-adjust layout based on pane count
        const paneCount = Object.keys(terminalSessions).length;
        if (paneCount === 2 && terminalLayout === 1) setTerminalLayout(2);
        if (paneCount >= 3 && terminalLayout < 4) setTerminalLayout(4);

        showToast(`Terminal "${name}" launched`, 'success');
      } else {
        showToast('Failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (e) {
      showToast('Failed to create terminal: ' + e.message, 'error');
    }
  }

  async function openInTerminal(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    // Open terminal panel
    openTerminalPanel();

    // Create terminal with task's config
    try {
      const result = await api.createTerminal({
        name: `#${taskId}: ${task.task ? task.task.substring(0, 35) : 'Task'}`,
        skill: task.skill || null,
        model: task.model || 'sonnet',
        workingDir: task.working_dir || null
      });

      if (result.ok) {
        addTerminalPane(result.session, taskId);
        document.getElementById('terminalEmpty').style.display = 'none';

        // Auto-adjust layout
        const paneCount = Object.keys(terminalSessions).length;
        if (paneCount === 2 && terminalLayout === 1) setTerminalLayout(2);
        if (paneCount >= 3 && terminalLayout < 4) setTerminalLayout(4);

        // Send the task description as the first message after a short delay
        setTimeout(async () => {
          try {
            await api.sendTerminalInput(result.session.id, task.task || task.description || '');
          } catch (e) {}
        }, 1500);

        showToast(`Opened task in terminal`, 'success');
      }
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    }
  }

  // ── Task Master ──

  function openTaskMaster(preloadPlan) {
    const modal = document.getElementById('taskMasterModal');
    document.getElementById('tmInput').style.display = preloadPlan ? 'none' : '';
    document.getElementById('tmLoading').style.display = 'none';
    document.getElementById('tmReview').style.display = preloadPlan ? '' : 'none';

    if (preloadPlan) {
      currentPlan = preloadPlan;
      renderPlanReview(preloadPlan);
    } else {
      document.getElementById('tmGoalInput').value = '';
      currentPlan = null;
    }

    modal.classList.add('active');
    if (!preloadPlan) {
      setTimeout(() => document.getElementById('tmGoalInput').focus(), 100);
    }
  }

  function closeTaskMaster() {
    document.getElementById('taskMasterModal').classList.remove('active');
    cancelPlanTimer();
    currentPlan = null;
    planAbortController = null;
  }

  function cancelPlanTimer() {
    if (planTimerInterval) { clearInterval(planTimerInterval); planTimerInterval = null; }
  }

  async function generatePlan() {
    const goal = document.getElementById('tmGoalInput').value.trim();
    if (!goal) { document.getElementById('tmGoalInput').style.borderColor = 'rgba(239,68,68,0.5)'; return; }

    // Switch to loading state
    document.getElementById('tmInput').style.display = 'none';
    document.getElementById('tmLoading').style.display = '';
    document.getElementById('tmReview').style.display = 'none';

    // Start elapsed timer
    const startTime = Date.now();
    document.getElementById('tmElapsed').textContent = '0s';
    cancelPlanTimer();
    planTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      document.getElementById('tmElapsed').textContent = `${elapsed}s`;
    }, 1000);

    try {
      const data = await api.generatePlan(goal);
      cancelPlanTimer();

      if (!data.ok || !data.plan) {
        alert('Planning failed: ' + (data.error || data.details || 'Unknown error'));
        document.getElementById('tmInput').style.display = '';
        document.getElementById('tmLoading').style.display = 'none';
        return;
      }

      currentPlan = data.plan;
      renderPlanReview(data.plan);

      // Switch to review state
      document.getElementById('tmLoading').style.display = 'none';
      document.getElementById('tmReview').style.display = '';

    } catch (err) {
      cancelPlanTimer();
      alert('Planning failed: ' + err.message);
      document.getElementById('tmInput').style.display = '';
      document.getElementById('tmLoading').style.display = 'none';
    }
  }

  function cancelPlan() {
    cancelPlanTimer();
    document.getElementById('tmInput').style.display = '';
    document.getElementById('tmLoading').style.display = 'none';
    document.getElementById('tmReview').style.display = 'none';
  }

  function renderPlanReview(plan) {
    document.getElementById('tmPlanNameText').textContent = plan.plan_name || 'Plan Review';
    document.getElementById('tmPlanDesc').textContent = plan.plan_description || '';

    const container = document.getElementById('tmPlanSteps');
    let html = '';

    const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);

    sortedSteps.forEach((step, i) => {
      const skillBadge = step.skill
        ? `<span class="step-skill">${escHtml(step.skill)}</span>`
        : `<span class="step-model">general</span>`;
      const modelBadge = `<span class="step-model">${step.model || 'sonnet'}</span>`;

      let depHtml = '';
      if (step.depends_on && step.depends_on.length > 0) {
        const depNames = step.depends_on.map(d => {
          const ds = plan.steps.find(s => s.order === d);
          return ds ? `Step ${d}` : `Step ${d}`;
        }).join(', ');
        depHtml = `<div class="step-dep dependent">Needs ${depNames}</div>`;
      } else {
        depHtml = `<div class="step-dep independent">Independent</div>`;
      }

      html += `<div class="plan-step" id="plan-step-${step.order}">
        <div class="step-actions">
          <button onclick="editPlanStep(${step.order})" title="Edit">✏️</button>
          <button onclick="removePlanStep(${step.order})" title="Remove">✕</button>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <div class="step-num">${step.order}</div>
          <div class="step-title" style="flex:1;">${escHtml(step.title)}</div>
          ${skillBadge} ${modelBadge}
        </div>
        <div class="step-desc" id="step-desc-${step.order}" onclick="toggleStepDesc(${step.order})">${escHtml(step.task_description)}</div>
        <div id="step-edit-${step.order}" style="display:none;">
          <textarea class="step-edit-textarea" id="step-edit-ta-${step.order}">${escHtml(step.task_description)}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button class="btn btn-primary btn-sm" onclick="savePlanStepEdit(${step.order})">Save</button>
            <button class="btn btn-ghost btn-sm" onclick="cancelPlanStepEdit(${step.order})">Cancel</button>
          </div>
        </div>
        ${depHtml}
      </div>`;

      // Arrow between steps
      if (i < sortedSteps.length - 1) {
        html += `<div class="plan-arrow">↓</div>`;
      }
    });

    container.innerHTML = html;

    // Estimate
    const totalMin = sortedSteps.reduce((sum, s) => sum + (s.estimated_minutes || 2), 0);
    document.getElementById('tmEstimate').innerHTML =
      `📊 ${sortedSteps.length} steps &middot; ~${totalMin} min estimated &middot; Sequential execution (1 worker)`;
  }

  function toggleStepDesc(order) {
    const desc = document.getElementById(`step-desc-${order}`);
    if (desc) desc.classList.toggle('expanded');
  }

  function editPlanStep(order) {
    if (!currentPlan) return;
    document.getElementById(`step-desc-${order}`).style.display = 'none';
    document.getElementById(`step-edit-${order}`).style.display = '';
    const ta = document.getElementById(`step-edit-ta-${order}`);
    ta.focus();
  }

  function savePlanStepEdit(order) {
    if (!currentPlan) return;
    const step = currentPlan.steps.find(s => s.order === order);
    if (!step) return;
    const ta = document.getElementById(`step-edit-ta-${order}`);
    step.task_description = ta.value.trim();
    renderPlanReview(currentPlan);
  }

  function cancelPlanStepEdit(order) {
    document.getElementById(`step-desc-${order}`).style.display = '';
    document.getElementById(`step-edit-${order}`).style.display = 'none';
  }

  function removePlanStep(order) {
    if (!currentPlan) return;
    currentPlan.steps = currentPlan.steps.filter(s => s.order !== order);
    // Re-number steps
    currentPlan.steps.sort((a, b) => a.order - b.order).forEach((s, i) => {
      // Update depends_on references
      s.depends_on = (s.depends_on || []).filter(d => d !== order).map(d => {
        // Find new order for the dependency
        const origStep = currentPlan.steps.find(ss => ss.order === d);
        return origStep ? d : null;
      }).filter(Boolean);
      s.order = i + 1;
    });
    renderPlanReview(currentPlan);
  }

  async function approvePlan() {
    if (!currentPlan || !currentPlan.steps || currentPlan.steps.length === 0) return;

    const space = getActiveSpace();
    const approveBtn = document.querySelector('#tmReview .btn-success');
    approveBtn.textContent = 'Creating tasks...';
    approveBtn.disabled = true;

    try {
      const result = await api.approvePlan({
        plan: currentPlan,
        space_id: activeSpaceId,
        working_dir: space.working_dir || null,
        context: space.context || []
      });

      if (!result.ok) {
        alert('Failed to create tasks: ' + (result.error || 'Unknown error'));
        approveBtn.textContent = '✅ Approve & Run';
        approveBtn.disabled = false;
        return;
      }

      closeTaskMaster();
      await refresh();

      // Auto-run with 1 worker (sequential for dependent tasks)
      const runResult = await api.run(1);
      if (runResult.ok) {
        document.getElementById('runnerStatus').textContent =
          `${currentPlan ? currentPlan.plan_name : 'Plan'}: ${result.tasks_created} tasks`;
        startPolling();
      }
    } catch (err) {
      alert('Error: ' + err.message);
      approveBtn.textContent = '✅ Approve & Run';
      approveBtn.disabled = false;
    }
  }

  function saveAsRoutine() {
    if (!currentPlan) return;
    // Pre-fill routine name from plan name
    document.getElementById('routineNameInput').value = currentPlan.plan_name || '';
    document.getElementById('routineIconInput').value = '🧠';
    document.getElementById('saveRoutineModal').classList.add('active');
    setTimeout(() => document.getElementById('routineNameInput').focus(), 100);
  }

  function closeSaveRoutineModal() {
    document.getElementById('saveRoutineModal').classList.remove('active');
  }

  async function confirmSaveRoutine() {
    if (!currentPlan) return;
    const name = document.getElementById('routineNameInput').value.trim();
    const icon = document.getElementById('routineIconInput').value.trim() || '🧠';

    if (!name) {
      document.getElementById('routineNameInput').style.borderColor = 'rgba(239,68,68,0.5)';
      return;
    }

    try {
      const result = await api.saveRoutine({
        name,
        icon,
        description: currentPlan.plan_description || '',
        plan: currentPlan
      });

      if (result.ok) {
        closeSaveRoutineModal();
        // Reload templates to include the new routine
        const tplData = await api.getTemplates();
        templates = tplData.templates || [];
        routines = tplData.routines || [];
        renderTemplateBar();
        // Show success feedback
        document.getElementById('tmEstimate').innerHTML =
          `✅ Saved as routine "${name}" — available in Quick Actions bar`;
      } else {
        alert('Failed to save: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error saving routine: ' + err.message);
    }
  }

  function runSavedPlanRoutine(routineId) {
    const routine = routines.find(r => r.id === routineId);
    if (!routine || !routine.plan) return;
    // Open Task Master directly in review mode with the saved plan
    openTaskMaster(JSON.parse(JSON.stringify(routine.plan))); // deep clone
  }

  async function runRoutine(routineId) {
    const routine = routines.find(r => r.id === routineId);
    if (!routine || !routine.tasks || routine.tasks.length === 0) return;

    const space = getActiveSpace();
    document.getElementById('runnerStatus').textContent = `Creating ${routine.tasks.length} tasks...`;

    let created = 0;
    for (const rt of routine.tasks) {
      const tpl = templates.find(t => t.id === rt.template_id);
      if (!tpl) { console.warn(`Routine: template "${rt.template_id}" not found`); continue; }

      let prompt = tpl.prompt_template;
      const vars = rt.variables || {};
      (tpl.variables || []).forEach(v => {
        const val = vars[v.name] || v.default || '';
        prompt = prompt.replace(new RegExp(`\\{${v.name}\\}`, 'g'), val);
      });
      prompt = prompt.replace(/\{[a-zA-Z_]+\}/g, '').replace(/\s{2,}/g, ' ').trim();

      await api.createTask({
        task: prompt,
        skill: tpl.skill || null,
        priority: created + 1,
        model: tpl.model || 'sonnet',
        max_turns: tpl.max_turns || 25,
        context: space.context || [],
        extra_context: [],
        working_dir: space.working_dir || null,
        space_id: activeSpaceId
      });
      created++;
    }

    await refresh();

    if (created > 0) {
      const result = await api.run();
      if (result.ok) {
        document.getElementById('runnerStatus').textContent =
          `${routine.name}: ${created} tasks (${result.workers} worker${result.workers > 1 ? 's' : ''})`;
        startPolling();
      }
    }
  }

  // ── Polling ──
  let previousTaskStates = {}; // Track task states for notifications

  async function refresh() {
    try {
      const newTasks = await api.getTasks();

      // Detect newly completed/failed tasks for notifications
      for (const t of newTasks) {
        const prev = previousTaskStates[t.id];
        if (prev === 'running' && (t.status === 'done' || t.status === 'failed')) {
          notifyTaskComplete(t);
          // Update terminal pane status when task finishes
          autoUpdateTerminalForTask(t);
        }
        // Auto-create terminal when a task starts running
        if (!prev && t.status === 'running' || prev === 'pending' && t.status === 'running') {
          autoCreateTerminalForTask(t);
        }
      }
      // Update state tracking
      previousTaskStates = {};
      newTasks.forEach(t => { previousTaskStates[t.id] = t.status; });

      allTasks = newTasks;
    } catch (e) {
      // Server unreachable — keep stale data, banner already shown by safeFetch
      console.warn('Refresh failed:', e.message);
      return;
    }

    // Migrate old tasks
    if (migrateOldTasks()) {
      for (const t of allTasks.filter(tt => !tt.space_id || tt.space_id === 'general')) {
        // Only update if needed
      }
    }

    renderBoard();
    renderSpaceTabs();

    const running = allTasks.filter(t => t.status === 'running').length;
    const done = allTasks.filter(t => t.status === 'done').length;
    const failed = allTasks.filter(t => t.status === 'failed').length;
    const badge = document.getElementById('workerBadge');

    if (running > 0) {
      badge.textContent = `${running} task${running > 1 ? 's' : ''} running`;
      badge.classList.add('active');
      document.getElementById('stopBtn').style.display = '';
      document.getElementById('runnerStatus').textContent = 'Processing...';
    } else {
      badge.textContent = '0 workers active';
      badge.classList.remove('active');
      document.getElementById('stopBtn').style.display = 'none';
      document.getElementById('terminalHint').textContent = '';
      if (done > 0 || failed > 0) {
        document.getElementById('runnerStatus').textContent = `Done: ${done} | Failed: ${failed}`;
      } else {
        document.getElementById('runnerStatus').textContent = 'Ready';
      }
    }

    // Poll workflow execution status if in exec mode
    if (wfExecMode && activeWorkflowRunId) {
      wfPollExecStatus();
    }
  }

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(refresh, 2000);
  }

  // ── Browser Notifications ──
  let notificationsEnabled = false;

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { notificationsEnabled = true; return; }
    if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      notificationsEnabled = perm === 'granted';
    }
  }

  function notifyTaskComplete(task) {
    const isDone = task.status === 'done';
    const preview = getCardPreview(task).slice(0, 60);
    const title = isDone ? '✅ Task Complete' : '❌ Task Failed';
    const body = `#${task.id}: ${preview}`;

    // Browser notification (if tab is not focused)
    if (notificationsEnabled && document.hidden) {
      try {
        const n = new Notification(title, { body, icon: '🤖', tag: `task-${task.id}` });
        n.onclick = () => { window.focus(); viewResult(task.id); n.close(); };
        setTimeout(() => n.close(), 8000);
      } catch (_) {}
    }

    // Audio ping
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = isDone ? 880 : 440;
      osc.type = isDone ? 'sine' : 'triangle';
      gain.gain.value = 0.08;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
  }

  // ── Workflow Builder ──

  function wfRenderList() {
    const container = document.getElementById('wfList');
    document.getElementById('wfListContainer').style.display = '';
    document.getElementById('wfCanvasContainer').classList.remove('active');

    let html = `<div class="wf-card wf-card-new" onclick="wfNewWorkflow()">
      <span class="wf-card-new-icon">+</span>
      <span class="wf-card-new-text">New Workflow</span>
    </div>`;

    routines.forEach(r => {
      if (r.source === 'task-master' && r.plan) return;
      const count = r.tasks ? r.tasks.length : 0;
      html += `<div class="wf-card" onclick="wfOpenWorkflow('${escHtml(r.id)}')">
        <div class="wf-card-actions">
          <button class="wf-card-btn" onclick="event.stopPropagation();wfRunDirect('${escHtml(r.id)}')" title="Run">▶</button>
          <button class="wf-card-btn" onclick="event.stopPropagation();scheduleRoutine('${escHtml(r.id)}')" title="Schedule">🕐</button>
          <button class="wf-card-btn delete" onclick="event.stopPropagation();wfDeleteWorkflow('${escHtml(r.id)}')" title="Delete">🗑</button>
        </div>
        <span class="wf-card-icon">${r.icon || '⚡'}</span>
        <div class="wf-card-name">${escHtml(r.name)}</div>
        <div class="wf-card-desc">${escHtml(r.description || 'No description')}</div>
        <div class="wf-card-meta">
          <span class="wf-card-badge">${count} step${count !== 1 ? 's' : ''}</span>
        </div>
      </div>`;
    });

    container.innerHTML = html;
  }

  function wfNewWorkflow() {
    wfEditingRoutineId = null;
    wfNodes = [];
    wfSelectedNodeId = null;
    wfNextNodeId = 0;
    document.getElementById('wfToolbarName').value = '';
    document.getElementById('wfToolbarIcon').value = '⚡';

    wfNodes.push({ id: 'trigger', template_id: null, x: 80, y: 160, variables: {}, isTrigger: true });
    wfNextNodeId = 1;
    wfShowCanvas();
  }

  function wfOpenWorkflow(routineId) {
    const routine = routines.find(r => r.id === routineId);
    if (!routine) return;

    wfEditingRoutineId = routineId;
    wfSelectedNodeId = null;
    wfNextNodeId = 0;
    document.getElementById('wfToolbarName').value = routine.name;
    document.getElementById('wfToolbarIcon').value = routine.icon || '⚡';

    wfNodes = [{ id: 'trigger', template_id: null, x: 80, y: 160, variables: {}, isTrigger: true }];
    (routine.tasks || []).forEach((task, i) => {
      wfNodes.push({
        id: 'node-' + i,
        template_id: task.template_id,
        x: 80 + (i + 1) * 260,
        y: 160,
        variables: { ...(task.variables || {}) }
      });
      wfNextNodeId = i + 1;
    });

    wfShowCanvas();
  }

  function wfShowCanvas() {
    document.getElementById('wfListContainer').style.display = 'none';
    document.getElementById('wfCanvasContainer').classList.add('active');
    wfClosePanel();
    // Small delay to let DOM render before measuring node sizes
    requestAnimationFrame(() => {
      wfRenderNodes();
      wfRenderConnections();
    });
  }

  function wfBackToList() {
    if (wfExecMode) wfExitExecMode();
    document.getElementById('wfCanvasContainer').classList.remove('active');
    document.getElementById('wfListContainer').style.display = '';
    wfClosePanel();
    wfClosePicker();
    wfRenderList();
  }

  function wfGetNodeExecState(node) {
    // Returns exec state for a node during wfExecMode
    if (!wfExecMode || !currentWorkflowRun) return null;
    if (node.isTrigger) {
      // Trigger node is always "success" once workflow starts
      return 'success';
    }
    // Map wfNodes (canvas) to run nodes (server). Canvas nodes are: trigger, node-0, node-1, ...
    // Run nodes are indexed 0, 1, 2... (no trigger). node-0 → run.nodes[0], node-1 → run.nodes[1], etc.
    const nodeIdStr = String(node.id);
    const match = nodeIdStr.match(/^node-(\d+)$/);
    if (!match) return null;
    const runIndex = parseInt(match[1]);
    const runNode = currentWorkflowRun.nodes[runIndex];
    if (!runNode) return null;
    return runNode.status; // waiting | running | success | error
  }

  function wfRenderNodes() {
    const canvas = document.getElementById('wfCanvas');
    canvas.querySelectorAll('.wf-node, .wf-add-node').forEach(el => el.remove());

    wfNodes.forEach(node => {
      const el = document.createElement('div');
      const execState = wfGetNodeExecState(node);
      let cls = 'wf-node' + (node.isTrigger ? ' wf-trigger' : '') + (node.id === wfSelectedNodeId && !wfExecMode ? ' selected' : '');
      if (execState) cls += ' state-' + execState;
      el.className = cls;
      el.id = 'wfn-' + node.id;
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';

      if (node.isTrigger) {
        el.innerHTML = `<div class="wf-node-header">
          <span class="wf-node-icon">⚡</span>
          <div class="wf-node-info">
            <div class="wf-node-title">Start</div>
            <div class="wf-node-subtitle">Trigger</div>
          </div>
        </div>`;
        const outDot = document.createElement('div');
        outDot.className = 'wf-connector output';
        el.appendChild(outDot);
      } else {
        const tpl = templates.find(t => t.id === node.template_id);
        const icon = tpl ? (tpl.icon || '⚡') : '❓';
        const name = tpl ? tpl.name : node.template_id;
        const model = tpl ? (tpl.model || 'sonnet') : '';
        const varSummary = wfVarSummary(node, tpl);

        el.innerHTML = `<div class="wf-node-header">
          <span class="wf-node-icon">${icon}</span>
          <div class="wf-node-info">
            <div class="wf-node-title">${escHtml(name)}</div>
            <div class="wf-node-subtitle">${escHtml(model)}</div>
          </div>
        </div>${varSummary ? `<div class="wf-node-body">${escHtml(varSummary)}</div>` : ''}`;

        const inDot = document.createElement('div');
        inDot.className = 'wf-connector input';
        el.appendChild(inDot);
        const outDot = document.createElement('div');
        outDot.className = 'wf-connector output';
        el.appendChild(outDot);
      }

      // Add status badge during exec mode
      if (execState && execState !== 'waiting') {
        const badge = document.createElement('div');
        badge.className = 'wf-node-status st-' + execState;
        if (execState === 'success') badge.textContent = '✓';
        else if (execState === 'error') badge.textContent = '✗';
        else if (execState === 'running') badge.innerHTML = '<div class="mini-spin"></div>';
        el.appendChild(badge);
      }

      // Only allow interaction when NOT in exec mode
      if (!wfExecMode) {
        el.addEventListener('mousedown', (e) => {
          if (e.target.closest('.wf-connector')) return;
          wfOnNodeMouseDown(e, node.id);
        });
        el.addEventListener('click', (e) => {
          if (!node.isTrigger && !wfDragging) wfSelectNode(node.id);
        });
      }

      canvas.appendChild(el);
    });

    // Only show add button when not in exec mode
    if (!wfExecMode) {
      wfRenderAddButton();
    }
  }

  function wfVarSummary(node, tpl) {
    if (!tpl || !tpl.variables || tpl.variables.length === 0) return '';
    const parts = [];
    tpl.variables.forEach(v => {
      const val = node.variables[v.name];
      if (val === '{{prev}}') parts.push('\u2190 prev step');
      else if (val) parts.push(val);
    });
    return parts.join(' \u00b7 ') || 'Click to configure';
  }

  function wfRenderConnections() {
    const svg = document.getElementById('wfSvg');
    svg.innerHTML = '';

    for (let i = 0; i < wfNodes.length - 1; i++) {
      const from = wfNodes[i];
      const to = wfNodes[i + 1];
      const fromEl = document.getElementById('wfn-' + from.id);
      const toEl = document.getElementById('wfn-' + to.id);
      if (!fromEl || !toEl) continue;

      const x1 = from.x + fromEl.offsetWidth;
      const y1 = from.y + fromEl.offsetHeight / 2;
      const x2 = to.x;
      const y2 = to.y + toEl.offsetHeight / 2;
      const dx = Math.abs(x2 - x1) * 0.4;

      // Determine connection color during exec mode
      let strokeColor = 'rgba(123,47,242,0.5)';
      let arrowColor = 'rgba(123,47,242,0.5)';
      let isAnimated = true;
      if (wfExecMode && currentWorkflowRun) {
        const fromState = wfGetNodeExecState(from);
        const toState = wfGetNodeExecState(to);
        if (fromState === 'success' && toState === 'success') {
          strokeColor = 'rgba(34,197,94,0.6)';
          arrowColor = 'rgba(34,197,94,0.6)';
          isAnimated = false;
        } else if (fromState === 'success' && toState === 'running') {
          strokeColor = 'rgba(123,47,242,0.7)';
          arrowColor = 'rgba(123,47,242,0.7)';
          isAnimated = true;
        } else if (toState === 'error' || fromState === 'error') {
          strokeColor = 'rgba(239,68,68,0.5)';
          arrowColor = 'rgba(239,68,68,0.5)';
          isAnimated = false;
        } else {
          strokeColor = 'rgba(255,255,255,0.08)';
          arrowColor = 'rgba(255,255,255,0.08)';
          isAnimated = false;
        }
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
      path.style.stroke = strokeColor;
      path.style.strokeWidth = '2';
      path.style.fill = 'none';
      if (isAnimated) path.classList.add('animated');
      svg.appendChild(path);

      // Arrowhead
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      arrow.setAttribute('points', `${x2},${y2} ${x2-10},${y2-5} ${x2-10},${y2+5}`);
      arrow.style.fill = arrowColor;
      svg.appendChild(arrow);
    }
  }

  function wfRenderAddButton() {
    const canvas = document.getElementById('wfCanvas');
    canvas.querySelectorAll('.wf-add-node').forEach(el => el.remove());
    if (wfNodes.length === 0) return;

    const lastNode = wfNodes[wfNodes.length - 1];
    const lastEl = document.getElementById('wfn-' + lastNode.id);
    if (!lastEl) return;

    const btn = document.createElement('div');
    btn.className = 'wf-add-node';
    btn.innerHTML = '+';
    btn.style.left = (lastNode.x + lastEl.offsetWidth + 50) + 'px';
    btn.style.top = (lastNode.y + lastEl.offsetHeight / 2 - 18) + 'px';
    btn.onclick = () => wfShowPicker();
    canvas.appendChild(btn);

    // Also draw a dashed line from last node to add button
    const svg = document.getElementById('wfSvg');
    const x1 = lastNode.x + lastEl.offsetWidth;
    const y1 = lastNode.y + lastEl.offsetHeight / 2;
    const x2 = lastNode.x + lastEl.offsetWidth + 50;
    const y2 = y1;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
    line.setAttribute('stroke', 'rgba(123,47,242,0.25)');
    line.setAttribute('stroke-dasharray', '4 4');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);
  }

  // ── Node Dragging ──
  function wfOnNodeMouseDown(e, nodeId) {
    if (e.button !== 0) return;
    const node = wfNodes.find(n => n.id === nodeId);
    if (!node) return;

    wfDragging = { nodeId, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y, moved: false };
    const el = document.getElementById('wfn-' + nodeId);
    if (el) el.classList.add('dragging');
    e.preventDefault();
  }

  function wfOnMouseMove(e) {
    if (!wfDragging) return;
    const node = wfNodes.find(n => n.id === wfDragging.nodeId);
    if (!node) return;

    const dx = e.clientX - wfDragging.startX;
    const dy = e.clientY - wfDragging.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wfDragging.moved = true;

    node.x = Math.max(0, wfDragging.origX + dx);
    node.y = Math.max(0, wfDragging.origY + dy);

    const el = document.getElementById('wfn-' + node.id);
    if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }

    wfRenderConnections();
    wfRenderAddButton();
  }

  function wfOnMouseUp() {
    if (!wfDragging) return;
    const el = document.getElementById('wfn-' + wfDragging.nodeId);
    if (el) el.classList.remove('dragging');
    wfDragging = null;
  }

  function wfInitCanvas() {
    const canvas = document.getElementById('wfCanvas');
    if (!canvas) return;
    canvas.addEventListener('mousemove', wfOnMouseMove);
    canvas.addEventListener('mouseup', wfOnMouseUp);
    canvas.addEventListener('mouseleave', wfOnMouseUp);
  }

  // ── Template Picker ──
  function wfShowPicker() {
    const grid = document.getElementById('wfPickerGrid');
    let html = '';
    templates.forEach(t => {
      html += `<div class="rb-tpl-option" onclick="wfAddNode('${escHtml(t.id)}')">
        <span class="rb-tpl-option-icon">${t.icon || '⚡'}</span>
        <span class="rb-tpl-option-name">${escHtml(t.name)}</span>
      </div>`;
    });
    if (!templates.length) html = '<div style="color:#666;text-align:center;padding:20px;">No templates available.</div>';
    grid.innerHTML = html;
    document.getElementById('wfPicker').classList.add('active');
    document.getElementById('wfPickerBackdrop').classList.add('active');
  }

  function wfClosePicker() {
    document.getElementById('wfPicker').classList.remove('active');
    document.getElementById('wfPickerBackdrop').classList.remove('active');
  }

  function wfAddNode(templateId) {
    wfClosePicker();
    const tpl = templates.find(t => t.id === templateId);
    const vars = {};
    const nonTriggerCount = wfNodes.filter(n => !n.isTrigger).length;
    if (tpl && tpl.variables) tpl.variables.forEach(v => {
      if (v.default) {
        vars[v.name] = v.default;
      } else if (v.required && nonTriggerCount > 0) {
        // Auto-default required vars to {{prev}} for non-first nodes
        vars[v.name] = '{{prev}}';
      }
    });

    const lastNode = wfNodes[wfNodes.length - 1];
    const lastEl = document.getElementById('wfn-' + lastNode.id);
    const newX = lastNode.x + (lastEl ? lastEl.offsetWidth : 180) + 80;

    const nodeId = 'node-' + (wfNextNodeId++);
    wfNodes.push({ id: nodeId, template_id: templateId, x: newX, y: lastNode.y, variables: vars });

    wfRenderNodes();
    wfRenderConnections();
    wfSelectNode(nodeId);
  }

  // ── Node Selection & Panel ──
  function wfSelectNode(nodeId) {
    wfSelectedNodeId = nodeId;
    document.querySelectorAll('.wf-node').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById('wfn-' + nodeId);
    if (el) el.classList.add('selected');
    wfOpenPanel(nodeId);
  }

  function wfOpenPanel(nodeId) {
    const node = wfNodes.find(n => n.id === nodeId);
    if (!node || node.isTrigger) { wfClosePanel(); return; }

    const tpl = templates.find(t => t.id === node.template_id);
    document.getElementById('wfPanelIcon').textContent = tpl ? (tpl.icon || '⚡') : '❓';
    document.getElementById('wfPanelTitle').textContent = tpl ? tpl.name : node.template_id;
    document.getElementById('wfPanelSub').textContent = tpl ? (tpl.skill || 'No skill') + ' · ' + (tpl.model || 'sonnet') : '';

    const body = document.getElementById('wfPanelBody');
    let html = '';
    // Determine if this node is not the first (trigger doesn't count)
    const nonTriggerNodes = wfNodes.filter(n => !n.isTrigger);
    const nodeIdx = nonTriggerNodes.findIndex(n => n.id === nodeId);
    const showPrevBtn = nodeIdx > 0; // not the first real node

    if (tpl && tpl.variables && tpl.variables.length > 0) {
      tpl.variables.forEach(v => {
        const val = node.variables[v.name] || v.default || '';
        const isPrev = val === '{{prev}}';
        const displayVal = isPrev ? '' : val;
        const inputClass = isPrev ? 'is-prev' : '';
        const placeholder = isPrev ? '\u2190 Previous step output' : escHtml(v.placeholder || '');
        const readonlyAttr = isPrev ? 'readonly' : '';

        if (showPrevBtn) {
          html += `<div class="wf-panel-field">
            <label>${escHtml(v.label || v.name)}${v.required ? ' *' : ''}</label>
            <div class="wf-var-input-row">
              <input type="text" id="wf-input-${escHtml(v.name)}" class="${inputClass}" value="${escHtml(displayVal)}" placeholder="${placeholder}" ${readonlyAttr}
                oninput="wfUpdateVar('${nodeId}','${escHtml(v.name)}',this.value)">
              <button class="wf-var-prev-btn${isPrev ? ' active' : ''}" title="Use previous step output"
                onclick="wfTogglePrev('${nodeId}','${escHtml(v.name)}',this)">\u21a9</button>
            </div>
          </div>`;
        } else {
          html += `<div class="wf-panel-field">
            <label>${escHtml(v.label || v.name)}${v.required ? ' *' : ''}</label>
            <input type="text" value="${escHtml(val)}" placeholder="${escHtml(v.placeholder || '')}"
              oninput="wfUpdateVar('${nodeId}','${escHtml(v.name)}',this.value)">
          </div>`;
        }
      });
    } else {
      html = '<div style="color:#666;font-size:12px;padding:10px 0;">No configurable variables.</div>';
    }
    body.innerHTML = html;
    document.getElementById('wfPanel').classList.add('active');
  }

  function wfTogglePrev(nodeId, varName, btn) {
    const node = wfNodes.find(n => n.id === nodeId);
    if (!node) return;
    const input = document.getElementById('wf-input-' + varName);
    if (node.variables[varName] === '{{prev}}') {
      // Turn OFF prev mode
      node.variables[varName] = '';
      btn.classList.remove('active');
      if (input) { input.value = ''; input.className = ''; input.placeholder = ''; input.removeAttribute('readonly'); }
    } else {
      // Turn ON prev mode
      node.variables[varName] = '{{prev}}';
      btn.classList.add('active');
      if (input) { input.value = ''; input.className = 'is-prev'; input.placeholder = '\u2190 Previous step output'; input.setAttribute('readonly', ''); }
    }
    // Update node body preview
    const tpl = templates.find(t => t.id === node.template_id);
    const bodyEl = document.querySelector('#wfn-' + nodeId + ' .wf-node-body');
    if (bodyEl) bodyEl.textContent = wfVarSummary(node, tpl) || 'Click to configure';
  }

  function wfClosePanel() {
    document.getElementById('wfPanel').classList.remove('active');
    wfSelectedNodeId = null;
    document.querySelectorAll('.wf-node').forEach(el => el.classList.remove('selected'));
  }

  function wfUpdateVar(nodeId, varName, value) {
    const node = wfNodes.find(n => n.id === nodeId);
    if (node) {
      node.variables[varName] = value;
      // Update node body preview
      const tpl = templates.find(t => t.id === node.template_id);
      const bodyEl = document.querySelector('#wfn-' + nodeId + ' .wf-node-body');
      if (bodyEl) bodyEl.textContent = wfVarSummary(node, tpl) || 'Click to configure';
    }
  }

  function wfDeleteSelectedNode() {
    if (!wfSelectedNodeId) return;
    const idx = wfNodes.findIndex(n => n.id === wfSelectedNodeId);
    if (idx <= 0) return; // Don't delete trigger
    wfNodes.splice(idx, 1);
    wfClosePanel();
    wfRenderNodes();
    wfRenderConnections();
  }

  // ── Save & Run ──
  async function wfSave() {
    const name = document.getElementById('wfToolbarName').value.trim();
    const icon = document.getElementById('wfToolbarIcon').value.trim() || '⚡';
    if (!name) { showToast('Workflow name is required', 'error'); return; }

    const taskNodes = wfNodes.filter(n => !n.isTrigger);
    if (taskNodes.length === 0) { showToast('Add at least one step', 'error'); return; }

    const cleanTasks = taskNodes.map(n => {
      const vars = {};
      for (const [k, v] of Object.entries(n.variables)) { if (v) vars[k] = v; }
      return { template_id: n.template_id, variables: vars };
    });

    try {
      if (wfEditingRoutineId) {
        await api.updateRoutine(wfEditingRoutineId, { name, icon, description: '', tasks: cleanTasks });
        showToast('Workflow updated: "' + name + '"', 'success');
      } else {
        const result = await api.saveCustomRoutine({ name, icon, description: '', tasks: cleanTasks });
        if (result.routine) wfEditingRoutineId = result.routine.id;
        showToast('Workflow created: "' + name + '"', 'success');
      }
      const tplData = await api.getTemplates();
      templates = tplData.templates || [];
      routines = tplData.routines || [];
      renderTemplateBar();
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  }

  async function wfRun() {
    await wfSave();
    if (!wfEditingRoutineId) return;

    const space = getActiveSpace();
    try {
      const res = await api.startWorkflowRun({
        routine_id: wfEditingRoutineId,
        space_id: activeSpaceId,
        working_dir: space.working_dir || null,
        context: space.context || []
      });
      if (res.ok) {
        wfStartExecMode(res.run);
        showToast('Workflow started sequentially!', 'success');
      } else {
        showToast('Failed: ' + (res.error || 'Unknown error'), 'error');
      }
    } catch (e) {
      showToast('Error starting workflow: ' + e.message, 'error');
    }
  }

  async function wfRunDirect(routineId) {
    const space = getActiveSpace();
    try {
      const res = await api.startWorkflowRun({
        routine_id: routineId,
        space_id: activeSpaceId,
        working_dir: space.working_dir || null,
        context: space.context || []
      });
      if (res.ok) {
        // Open the workflow on canvas and enter exec mode
        wfOpenWorkflow(routineId);
        wfStartExecMode(res.run);
        showToast('Workflow started!', 'success');
      } else {
        showToast('Failed: ' + (res.error || 'Unknown error'), 'error');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }

  // ── Exec Mode ──
  function wfStartExecMode(run) {
    wfExecMode = true;
    wfExecFinished = false;
    activeWorkflowRunId = run.id;
    currentWorkflowRun = run;

    // Show exec bar, hide edit controls
    document.getElementById('wfExecBar').style.display = '';
    // Hide Save/Run buttons, name/icon inputs during exec
    document.querySelectorAll('.wf-toolbar .btn, .wf-toolbar-name, .wf-toolbar-icon').forEach(el => el.style.display = 'none');
    // Hide add-node button and panel
    document.querySelectorAll('.wf-add-node').forEach(el => el.style.display = 'none');
    wfClosePanel();

    // Disable node dragging during exec
    wfDragging = null;

    wfUpdateExecUI();
    wfRenderNodes();
    wfRenderConnections();
  }

  function wfExitExecMode() {
    wfExecMode = false;
    activeWorkflowRunId = null;
    currentWorkflowRun = null;

    // Hide exec bar, restore edit controls
    document.getElementById('wfExecBar').style.display = 'none';
    document.querySelectorAll('.wf-toolbar .btn, .wf-toolbar-name, .wf-toolbar-icon').forEach(el => el.style.display = '');

    // Re-render without execution states
    wfRenderNodes();
    wfRenderConnections();
  }

  function wfUpdateExecUI() {
    if (!currentWorkflowRun) return;
    const run = currentWorkflowRun;
    const statusEl = document.getElementById('wfExecStatus');
    const progressEl = document.getElementById('wfExecProgress');
    const total = run.nodes.length;
    const doneCount = run.nodes.filter(n => n.status === 'success').length;
    const currentIdx = run.current_node_index;

    if (run.status === 'done') {
      statusEl.textContent = '✅ Workflow completed!';
      statusEl.style.color = '#22C55E';
      progressEl.textContent = `${total} of ${total} steps done`;
    } else if (run.status === 'failed') {
      const failedNode = run.nodes.find(n => n.status === 'error');
      statusEl.textContent = '❌ Workflow failed';
      statusEl.style.color = '#F87171';
      progressEl.textContent = failedNode ? `Failed at step ${run.nodes.indexOf(failedNode) + 1}: ${failedNode.template_id}` : 'Error';
    } else {
      statusEl.textContent = '⏳ Running...';
      statusEl.style.color = '#C084FC';
      progressEl.textContent = `Step ${currentIdx + 1} of ${total} (${doneCount} done)`;
    }
  }

  async function wfStopExec() {
    // Stop all running tasks for this workflow
    if (!activeWorkflowRunId) return;
    try {
      await api.stop();
      showToast('Workflow stopped', 'warning');
    } catch (e) {
      showToast('Error stopping: ' + e.message, 'error');
    }
  }

  let wfExecFinished = false; // guard against duplicate completion handling

  async function wfPollExecStatus() {
    if (!wfExecMode || !activeWorkflowRunId) return;
    try {
      const run = await api.getWorkflowRun(activeWorkflowRunId);
      currentWorkflowRun = run;
      wfUpdateExecUI();
      wfRenderNodes();
      wfRenderConnections();

      // If workflow finished, unlock canvas after a delay (only once)
      if ((run.status === 'done' || run.status === 'failed') && !wfExecFinished) {
        wfExecFinished = true;
        const wasSuccess = run.status === 'done';
        if (wasSuccess) {
          try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; o.type = 'sine'; o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); o.stop(ctx.currentTime + 0.3); } catch (_) {}
          showToast('🎉 Workflow completed successfully!', 'success');
        } else {
          showToast('❌ Workflow failed — check failed node', 'error');
        }
        // Keep exec UI visible for 5s so user can see final state, then exit
        setTimeout(() => wfExitExecMode(), 5000);
      }
    } catch (e) {
      console.warn('Exec poll error:', e.message);
    }
  }

  async function wfDeleteWorkflow(routineId) {
    await deleteRoutine(routineId);
    wfRenderList();
  }

  // ── Init ──
  async function init() {
    // Load spaces from localStorage
    loadSpaces();

    // Request notification permission early
    requestNotificationPermission();

    try {
      // Load skills
      skills = await api.getSkills();
      const sel = document.getElementById('skillInput');
      skills.forEach(s => {
        if (s.exists) {
          const opt = document.createElement('option');
          opt.value = s.name;
          const ctxLabel = s.context && s.context.length > 0 ? ` [+${s.context.length} ctx]` : '';
          opt.textContent = `${s.name} - ${s.description}${ctxLabel}`;
          sel.appendChild(opt);
        }
      });

      // Load projects
      projects = await api.getProjects();

      // Load templates & routines
      try {
        const tplData = await api.getTemplates();
        templates = tplData.templates || [];
        routines = tplData.routines || [];
        renderTemplateBar();
      } catch (e) { console.warn('Templates not loaded:', e); }

      // Check Claude CLI status
      try {
        const health = await api.health();
        if (!health.claude_cli) {
          showServerBanner('⚠ Claude CLI not found — tasks will fail. Install: claude.ai/download', 'warning');
        }
      } catch (_) {}

    } catch (e) {
      showServerBanner('⚠ Cannot connect to server — is it running? (node server.js)', 'error');
      console.error('Init failed:', e);
    }

    // Load tasks and render (even if init partially failed, try to show what we can)
    await refresh();
    startPolling();
    wfInitCanvas();

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeAddModal(); closeResultModal(); closeSpaceModal(); closeTemplatePopup(); closeTaskMaster(); closeSaveRoutineModal(); closeHistory(); closeSchedules(); closeRoutineBuilder(); closeNewTerminalModal(); wfClosePicker(); wfClosePanel(); }
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') openAddModal();
      if (e.key === 'm' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') openTaskMaster();
      if (e.key === '1' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') switchView('board');
      if (e.key === '2' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') switchView('terminals');
      if (e.key === '3' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') switchView('workflows');
      // Ctrl+Enter in follow-up textarea submits
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && document.activeElement.id === 'followUpInput') {
        e.preventDefault();
        submitFollowUp();
      }
      // Ctrl+Enter in Task Master goal textarea triggers Plan It
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && document.activeElement.id === 'tmGoalInput') {
        e.preventDefault();
        generatePlan();
      }
      // Enter in template variable popup submits
      if (e.key === 'Enter' && document.activeElement.classList.contains('tpl-var-input')) {
        e.preventDefault();
        submitTemplate();
      }
      // Enter in routine name input saves
      if (e.key === 'Enter' && document.activeElement.id === 'routineNameInput') {
        e.preventDefault();
        confirmSaveRoutine();
      }
    });

    document.querySelectorAll('.modal-overlay').forEach(el => {
      el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
    });
  }

  init();
