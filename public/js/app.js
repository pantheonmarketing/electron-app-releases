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
    document.getElementById('runnerStatus').textContent = 'AI is working...';
  } else {
    badge.textContent = 'Ready';
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
    buildSkillPicker();

    // Load projects
    projects = await api.getProjects();

    // Load templates & routines
    try {
      const tplData = await api.getTemplates();
      templates = tplData.templates || [];
      routines = tplData.routines || [];
      renderTemplateBar();
    } catch (e) { console.warn('Templates not loaded:', e); }

    // Check Claude CLI status (only warn Lifetime users — Basic only uses Reel Master)
    try {
      let tier = window.APP_TIER || null;
      if (!tier) {
        try {
          const resp = await fetch('/api/license-tier');
          const data = await resp.json();
          tier = data.tier || 'lifetime';
        } catch (_) { tier = 'lifetime'; }
      }
      const health = await api.health();
      if (health.claude_cli && !health.claude_logged_in) {
        showServerBanner('⚠ Claude installed but not logged in — click Setup in the sidebar to connect your account', 'warning');
      } else if (!health.claude_cli) {
        showServerBanner('⚠ Claude CLI not installed — click Setup in the sidebar to fix this', 'warning');
      }
    } catch (_) {}

  } catch (e) {
    showServerBanner('⚠ Cannot connect to the app — make sure AI CEO Studio is running', 'error');
    console.error('Init failed:', e);
  }

  // Load tasks and render (even if init partially failed, try to show what we can)
  await refresh();
  startPolling();
  wfInitCanvas();

  // Onboarding wizard (first-time users)
  if (typeof showOnboarding === 'function') showOnboarding();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAddModal(); closeResultModal(); closeSpaceModal(); closeTemplatePopup(); closeTaskMaster(); closeSaveRoutineModal(); closeHistory(); closeSchedules(); closeRoutineBuilder(); closeNewTerminalModal(); wfClosePicker(); wfClosePanel(); if (typeof closeSkillEditor === 'function') closeSkillEditor(); if (typeof finishOnboarding === 'function') finishOnboarding(); }
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') openAddModal();
    if (e.key === 'm' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') openTaskMaster();
    if (e.key === '1' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') switchView('board');
    if (e.key === '2' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') switchView('workflows');
    if (e.key === '3' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') switchView('reelmaster');
    if (e.key === '4' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') switchView('scripter');
    if (e.key === '5' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') switchView('heygen');
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
