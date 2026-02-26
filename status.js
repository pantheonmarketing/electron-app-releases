/**
 * status.js — Task Queue Dashboard
 *
 * Shows the current state of all tasks with colored output.
 *
 * Usage:
 *   node status.js              # Show all tasks
 *   node status.js --watch      # Auto-refresh every 3 seconds
 *   node status.js --results    # Show result excerpts for completed tasks
 *   node status.js --reset      # Reset all tasks to pending (re-run everything)
 *   node status.js --clear      # Remove all tasks
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const TASKS_FILE = path.join(BASE_DIR, 'tasks.json');
const RESULTS_DIR = path.join(BASE_DIR, 'results');
const SKILLS_FILE = path.join(BASE_DIR, 'skills.json');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function readTasks() {
  if (!fs.existsSync(TASKS_FILE)) return [];
  return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
}

function statusIcon(status) {
  switch (status) {
    case 'done': return `${c.green}✅ done${c.reset}`;
    case 'failed': return `${c.red}❌ fail${c.reset}`;
    case 'running': return `${c.yellow}🔄 run ${c.reset}`;
    case 'pending': return `${c.dim}⏳ wait${c.reset}`;
    default: return `${c.dim}? ${status}${c.reset}`;
  }
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function timeSince(isoStr) {
  if (!isoStr) return '-';
  const seconds = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function duration(startIso, endIso) {
  if (!startIso || !endIso) return '-';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function printDashboard(showResults = false) {
  const tasks = readTasks();

  console.log('');
  console.log(`${c.bold}╔══════════════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║     🤖 Claude Task Manager — Dashboard                                 ║${c.reset}`);
  console.log(`${c.bold}╠══════════════════════════════════════════════════════════════════════════╣${c.reset}`);

  if (tasks.length === 0) {
    console.log(`${c.bold}║${c.reset}  ${c.dim}No tasks yet. Add one:${c.reset}`);
    console.log(`${c.bold}║${c.reset}  ${c.cyan}node add-task.js "Your task" --skill jonny-writer${c.reset}`);
    console.log(`${c.bold}╚══════════════════════════════════════════════════════════════════════════╝${c.reset}`);
    return;
  }

  // Header
  console.log(`${c.bold}║${c.reset} ${c.dim}ID  │ Status  │ Worker │ Duration │ Skill            │ Task${c.reset}`);
  console.log(`${c.bold}║${c.reset} ${c.dim}────┼─────────┼────────┼──────────┼──────────────────┼───────────────────────${c.reset}`);

  tasks.forEach(t => {
    const id = t.id.padEnd(3);
    const status = statusIcon(t.status);
    const worker = (t.worker || '-').padEnd(6);
    const dur = duration(t.started_at, t.completed_at).padEnd(8);
    const skill = truncate(t.skill || '-', 16).padEnd(16);
    const desc = truncate(t.task, 40);

    console.log(`${c.bold}║${c.reset} ${id} │ ${status} │ ${worker} │ ${dur} │ ${c.magenta}${skill}${c.reset} │ ${desc}`);

    // Show result excerpt if requested
    if (showResults && t.result_file && fs.existsSync(t.result_file)) {
      try {
        const result = JSON.parse(fs.readFileSync(t.result_file, 'utf-8'));
        let excerpt = '';
        if (result.claude_response?.result) {
          excerpt = truncate(result.claude_response.result, 70);
        } else if (result.raw_output) {
          excerpt = truncate(result.raw_output, 70);
        }
        if (excerpt) {
          console.log(`${c.bold}║${c.reset}     ${c.dim}└─ ${excerpt}${c.reset}`);
        }
      } catch (_) {}
    }
  });

  // Summary bar
  const done = tasks.filter(t => t.status === 'done').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const running = tasks.filter(t => t.status === 'running').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const total = tasks.length;

  console.log(`${c.bold}╠══════════════════════════════════════════════════════════════════════════╣${c.reset}`);
  console.log(`${c.bold}║${c.reset}  ${c.green}✅ ${done} done${c.reset}  │  ${c.red}❌ ${failed} failed${c.reset}  │  ${c.yellow}🔄 ${running} running${c.reset}  │  ${c.dim}⏳ ${pending} pending${c.reset}  │  Total: ${total}`);
  console.log(`${c.bold}╚══════════════════════════════════════════════════════════════════════════╝${c.reset}`);
  console.log('');
}

function resetTasks() {
  const tasks = readTasks();
  tasks.forEach(t => {
    t.status = 'pending';
    t.worker = null;
    t.started_at = null;
    t.completed_at = null;
    t.result_file = null;
    t.error = null;
  });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
  console.log(`\n🔄 Reset ${tasks.length} task(s) to pending.\n`);
}

function clearTasks() {
  fs.writeFileSync(TASKS_FILE, '[]');
  console.log('\n🗑️  All tasks cleared.\n');
}

// Parse args
const args = process.argv.slice(2);
const watch = args.includes('--watch') || args.includes('-w');
const showResults = args.includes('--results') || args.includes('-r');
const reset = args.includes('--reset');
const clear = args.includes('--clear');

if (reset) {
  resetTasks();
  printDashboard();
} else if (clear) {
  clearTasks();
} else if (watch) {
  // Auto-refresh mode
  const refresh = () => {
    console.clear();
    printDashboard(showResults);
    console.log(`${c.dim}  Auto-refreshing every 3s... (Ctrl+C to stop)${c.reset}`);
  };
  refresh();
  setInterval(refresh, 3000);
} else {
  printDashboard(showResults);
}
