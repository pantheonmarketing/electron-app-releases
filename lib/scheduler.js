/**
 * lib/scheduler.js — Schedule engine for task-manager.
 * Handles cron-like schedule evaluation, firing, and recording.
 */

const fs = require('fs');
const shared = require('./shared');
const { readTasks, writeTasks, readTemplates, generateId, buildPromptFromTemplate, launchWorkersInternal } = require('./helpers');

function readSchedules() {
  if (!fs.existsSync(shared.SCHEDULES_FILE)) return { schedules: [] };
  try { return JSON.parse(fs.readFileSync(shared.SCHEDULES_FILE, 'utf-8')); }
  catch (_) { return { schedules: [] }; }
}

function writeSchedules(data) {
  const d = JSON.stringify(data, null, 2);
  const tmp = shared.SCHEDULES_FILE + '.tmp';
  fs.writeFileSync(tmp, d);
  if (fs.existsSync(shared.SCHEDULES_FILE)) fs.copyFileSync(shared.SCHEDULES_FILE, shared.SCHEDULES_FILE + '.bak');
  fs.renameSync(tmp, shared.SCHEDULES_FILE);
}

/** Get current wall-clock time in a specific timezone using Intl API */
function getCurrentTimeInTz(tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const parts = {};
    for (const p of fmt.formatToParts(new Date())) {
      parts[p.type] = parseInt(p.value) || 0;
    }
    return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second, dayOfWeek: new Date().getDay() };
  } catch (_) {
    // Fallback to system time if tz is invalid
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds(), dayOfWeek: now.getDay() };
  }
}

/** Get the system's local timezone name */
function getSystemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function computeNextRun(schedule) {
  if (!schedule.enabled) return null;
  const tz = schedule.timezone || getSystemTimezone();
  const now = new Date();
  const { hour, minute } = schedule.time;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(hour, minute, 0, 0);

    if (candidate <= now) continue;

    const dow = candidate.getDay();
    const days = schedule.days;
    if (days === 'daily') { return candidate.toISOString(); }
    if (days === 'weekdays' && dow >= 1 && dow <= 5) { return candidate.toISOString(); }
    if (days === 'weekends' && (dow === 0 || dow === 6)) { return candidate.toISOString(); }
    if (Array.isArray(days) && days.includes(dow)) { return candidate.toISOString(); }
  }
  return null;
}

function shouldFireNow(schedule) {
  if (!schedule.enabled) return false;
  const tz = schedule.timezone || getSystemTimezone();
  const current = getCurrentTimeInTz(tz);
  const { hour, minute } = schedule.time;

  // Check day-of-week
  const dow = current.dayOfWeek;
  const days = schedule.days;
  let dayMatch = false;
  if (days === 'daily') dayMatch = true;
  else if (days === 'weekdays') dayMatch = dow >= 1 && dow <= 5;
  else if (days === 'weekends') dayMatch = dow === 0 || dow === 6;
  else if (Array.isArray(days)) dayMatch = days.includes(dow);
  if (!dayMatch) return false;

  if (current.hour !== hour || current.minute !== minute) return false;

  if (schedule.last_run) {
    const lastRun = new Date(schedule.last_run);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (lastRun >= todayStart) return false;
  }

  return true;
}

function shouldFireCatchUp(schedule) {
  if (!schedule.enabled) return false;
  const tz = schedule.timezone || getSystemTimezone();
  const current = getCurrentTimeInTz(tz);
  const { hour, minute } = schedule.time;

  // Check if we're within 5 minutes after scheduled time
  const scheduledMinutes = hour * 60 + minute;
  const currentMinutes = current.hour * 60 + current.minute;
  const diff = currentMinutes - scheduledMinutes;
  if (diff < 0 || diff > 5) return false;

  const dow = current.dayOfWeek;
  const days = schedule.days;
  let dayMatch = false;
  if (days === 'daily') dayMatch = true;
  else if (days === 'weekdays') dayMatch = dow >= 1 && dow <= 5;
  else if (days === 'weekends') dayMatch = dow === 0 || dow === 6;
  else if (Array.isArray(days)) dayMatch = days.includes(dow);
  if (!dayMatch) return false;

  if (schedule.last_run) {
    const lastRun = new Date(schedule.last_run);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (lastRun >= todayStart) return false;
  }

  return true;
}

function fireSchedule(schedule) {
  console.log(`[Scheduler] Firing: ${schedule.name}`);

  const tasks = readTasks();
  const running = tasks.filter(t => t.status === 'running').length;
  if (running > 0) {
    console.log(`[Scheduler] Skipped "${schedule.name}" — ${running} tasks already running`);
    recordScheduleRun(schedule, 'skipped', 0, 0, 'Workers busy');
    return;
  }

  const tplData = readTemplates();
  const routine = tplData.routines.find(r => r.id === schedule.routine_id);
  if (!routine) {
    console.error(`[Scheduler] Routine "${schedule.routine_id}" not found`);
    recordScheduleRun(schedule, 'error', 0, 0, 'Routine not found');
    return;
  }

  let createdCount = 0;

  if (routine.source === 'task-master' && routine.plan) {
    const plan = routine.plan;
    const planId = plan.plan_name || routine.name;
    const steps = plan.steps || [];

    steps.forEach(step => {
      const id = generateId(tasks);
      const depNote = step.depends_on && step.depends_on.length > 0
        ? `\n\nThis step depends on output from: ${step.depends_on.map(d => `Step ${d}`).join(', ')}.\nCheck the working directory for any files produced by those steps.\n`
        : '';

      tasks.push({
        id,
        task: `[Plan: "${planId}" — Step ${step.order} of ${steps.length}]\n\n${step.task_description}${depNote}`,
        skill: step.skill || null,
        status: 'pending',
        priority: step.order,
        model: step.model || 'sonnet',
        max_turns: step.max_turns || 25,
        context: schedule.context || [],
        extra_context: [],
        working_dir: schedule.working_dir || null,
        space_id: schedule.space_id,
        plan_id: planId,
        plan_step: step.order,
        plan_total: steps.length
      });
      createdCount++;
    });

    writeTasks(tasks);
    const result = launchWorkersInternal(1);
    recordScheduleRun(schedule, 'ok', createdCount, result.workers);

  } else if (routine.tasks && routine.tasks.length > 0) {
    routine.tasks.forEach((rt, idx) => {
      const tpl = tplData.templates.find(t => t.id === rt.template_id);
      if (!tpl) { console.warn(`[Scheduler] Template "${rt.template_id}" not found, skipping`); return; }

      const prompt = buildPromptFromTemplate(tpl, rt.variables || {});
      const id = generateId(tasks);
      tasks.push({
        id,
        task: prompt,
        skill: tpl.skill || null,
        status: 'pending',
        priority: idx + 1,
        model: tpl.model || 'sonnet',
        max_turns: tpl.max_turns || 25,
        context: schedule.context || [],
        extra_context: [],
        working_dir: schedule.working_dir || null,
        space_id: schedule.space_id
      });
      createdCount++;
    });

    writeTasks(tasks);
    const wCount = createdCount === 1 ? 1 : createdCount <= 3 ? 2 : 3;
    const result = launchWorkersInternal(wCount);
    recordScheduleRun(schedule, 'ok', createdCount, result.workers);

  } else {
    recordScheduleRun(schedule, 'error', 0, 0, 'Routine has no tasks');
  }
}

function recordScheduleRun(schedule, status, tasksCreated, workers, reason) {
  const data = readSchedules();
  const s = data.schedules.find(sc => sc.id === schedule.id);
  if (!s) return;

  s.last_run = new Date().toISOString();
  s.last_run_status = status;
  if (!s.history) s.history = [];
  s.history.unshift({
    fired_at: s.last_run,
    status,
    tasks_created: tasksCreated,
    workers_launched: workers,
    reason: reason || null
  });
  if (s.history.length > 10) s.history = s.history.slice(0, 10);
  s.next_run = computeNextRun(s);

  writeSchedules(data);
  console.log(`[Scheduler] ${schedule.name}: ${status} (${tasksCreated} tasks, ${workers} workers)${reason ? ' — ' + reason : ''}`);
}

function runSchedulerTick() {
  const data = readSchedules();
  if (data.schedules.length === 0) return;

  data.schedules.forEach(s => {
    if (shouldFireNow(s) || shouldFireCatchUp(s)) {
      fireSchedule(s);
    }
  });
}

module.exports = {
  readSchedules,
  writeSchedules,
  computeNextRun,
  shouldFireNow,
  shouldFireCatchUp,
  fireSchedule,
  recordScheduleRun,
  runSchedulerTick,
  getCurrentTimeInTz,
  getSystemTimezone,
};
