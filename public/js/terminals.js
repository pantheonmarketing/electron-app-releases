// ── Agent Terminal ──

let terminalSessions = {}; // id → { eventSource, outputEl }
let terminalLayout = 1;

let currentView = 'board';

function switchView(view) {
  if (view === currentView) return;
  currentView = view;

  // Toggle view-active class
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view-active'));
  const viewMap = { board: 'boardView', terminals: 'terminalViewWrapper', workflows: 'workflowView', reelmaster: 'reelmasterView', stories: 'storiesView', scripter: 'scripterView', heygen: 'heygenView', influencer: 'influencerView', giveaway: 'giveawayView', scout: 'scoutView' };
  const target = document.getElementById(viewMap[view]);
  if (target) target.classList.add('view-active');

  // Toggle sidebar active state
  document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  if (view === 'terminals') refreshTerminals();
  if (view === 'workflows') wfRenderList();
  if (view === 'reelmaster') rmInit();
  if (view === 'scripter') scrInit();
  if (view === 'heygen') hgInit();
  if (view === 'stories') stInit();
  if (view === 'influencer') icInit();
  if (view === 'giveaway') gvInit();
  if (view === 'scout') scInit();
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

/**
 * Recent chats — reopen a chat whose pane was closed or that predates a restart.
 * Live chats already have a pane, so they are shown but not offered for resume.
 */
async function openRecentChatsModal() {
  const modal = document.getElementById('recentChatsModal');
  const list = document.getElementById('recentChatsList');
  modal.classList.add('active');
  list.textContent = 'Loading...';
  try {
    const { sessions } = await api.terminalHistory();
    if (!sessions.length) {
      list.innerHTML = '<div style="color:#666;font-size:13px;padding:18px 0;text-align:center;">No previous chats yet</div>';
      return;
    }
    list.innerHTML = sessions.map(s => {
      const when = new Date(s.updatedAt).toLocaleString();
      const badges = [
        s.skill ? escHtml(s.skill) : '',
        s.model ? escHtml(s.model) : '',
        s.live ? 'open' : '',
      ].filter(Boolean).join(' · ');
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(s.name)}</div>
          <div style="font-size:11px;color:#666;">${when}${badges ? ' · ' + badges : ''}</div>
        </div>
        <button class="btn btn-sm ${s.live ? 'btn-ghost' : 'btn-primary'}" onclick="resumeChat('${s.id}')">${s.live ? 'Go to' : 'Resume'}</button>
      </div>`;
    }).join('');
  } catch (e) {
    list.textContent = 'Could not load recent chats: ' + e.message;
  }
}

function closeRecentChatsModal() {
  document.getElementById('recentChatsModal').classList.remove('active');
}

async function resumeChat(sessionId) {
  try {
    const { session, error } = await api.resumeTerminal(sessionId);
    if (error) throw new Error(error);
    closeRecentChatsModal();
    switchView('terminals');
    // refreshTerminals adds the pane and wires SSE for anything newly in memory.
    await refreshTerminals();
    document.getElementById(`pane-${session.id}`)?.scrollIntoView({ block: 'nearest' });
    showToast('Chat resumed', 'success');
  } catch (e) {
    showToast('Could not resume chat: ' + e.message, 'error');
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

