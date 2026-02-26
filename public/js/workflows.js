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

