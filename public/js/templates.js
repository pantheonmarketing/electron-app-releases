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
  const res = await api.archiveTasks([id]);
  if (res.error) { showToast(res.message || 'Archive failed', 'error'); return; }
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
        <div class="schedule-detail">${daysLabel} at ${timeStr}${s.timezone ? ' <span style="color:#666;">(' + s.timezone.replace(/_/g, ' ') + ')</span>' : ''} · Next: <span class="${nextRunClass}">${nextRun}</span></div>
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

  // Timezone dropdown
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzSelect = document.getElementById('scheduleTzInput');
  if (tzSelect.options.length === 0) {
    const commonTzs = [
      'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
      'America/Anchorage','Pacific/Honolulu','America/Phoenix',
      'America/Toronto','America/Vancouver','America/Mexico_City',
      'America/Sao_Paulo','America/Argentina/Buenos_Aires',
      'Europe/London','Europe/Paris','Europe/Berlin','Europe/Moscow',
      'Africa/Cairo','Africa/Lagos','Asia/Dubai','Asia/Kolkata',
      'Asia/Bangkok','Asia/Shanghai','Asia/Tokyo','Asia/Seoul',
      'Asia/Singapore','Asia/Manila','Australia/Sydney','Pacific/Auckland',
      'UTC'
    ];
    if (!commonTzs.includes(browserTz)) commonTzs.unshift(browserTz);
    commonTzs.forEach(tz => {
      const opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = tz.replace(/_/g, ' ');
      tzSelect.appendChild(opt);
    });
  }
  tzSelect.value = browserTz;
  document.getElementById('scheduleFormTz').textContent = `(${browserTz})`;
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

  // Restore saved timezone
  if (s.timezone) {
    const tzSelect = document.getElementById('scheduleTzInput');
    // Add the timezone if it's not in the list
    if (!Array.from(tzSelect.options).some(o => o.value === s.timezone)) {
      const opt = document.createElement('option');
      opt.value = s.timezone;
      opt.textContent = s.timezone.replace(/_/g, ' ');
      tzSelect.insertBefore(opt, tzSelect.firstChild);
    }
    tzSelect.value = s.timezone;
    document.getElementById('scheduleFormTz').textContent = `(${s.timezone})`;
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
  const timezone = document.getElementById('scheduleTzInput').value || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    if (editId) {
      await api.updateSchedule(editId, {
        name: routine ? routine.name : 'Schedule',
        routine_id: routineId,
        time: { hour: h, minute: m },
        days,
        timezone
      });
    } else {
      await api.createSchedule({
        name: routine ? routine.name : 'Schedule',
        routine_id: routineId,
        time: { hour: h, minute: m },
        days,
        timezone,
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

