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

