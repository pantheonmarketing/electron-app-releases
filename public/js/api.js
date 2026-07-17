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
  async terminalHistory() { return (await safeFetch('/api/terminal/history')).json(); },
  async resumeTerminal(id) { return (await safeFetch(`/api/terminal/sessions/${id}/resume`, { method:'POST' })).json(); },
  async attachTerminal(taskId) { return (await safeFetch(`/api/tasks/${taskId}/attach-terminal`, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })).json(); },
};

