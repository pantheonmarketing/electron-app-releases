/**
 * run.js — Main Task Runner
 *
 * Spawns N parallel Claude Code workers, waits for all to finish,
 * then prints a summary of results.
 *
 * Usage:
 *   node run.js                  # 2 workers (default)
 *   node run.js --workers 3      # 3 workers
 *   node run.js -w 4             # 4 workers
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const TASKS_FILE = path.join(BASE_DIR, 'tasks.json');

// Parse args
function parseArgs() {
  const args = process.argv.slice(2);
  let workers = 2;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workers' || args[i] === '-w') {
      workers = parseInt(args[i + 1]) || 2;
      i++;
    }
  }

  return { workers };
}

function readTasks() {
  return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
}

function printBanner(workerCount) {
  const tasks = readTasks();
  const pending = tasks.filter(t => t.status === 'pending').length;
  const running = tasks.filter(t => t.status === 'running').length;

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     🤖 Claude Task Manager — Runner         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Workers:  ${String(workerCount).padEnd(34)}║`);
  console.log(`║  Pending:  ${String(pending).padEnd(34)}║`);
  console.log(`║  Running:  ${String(running).padEnd(34)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
}

function printSummary() {
  const tasks = readTasks();

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     📊 Task Results Summary                  ║');
  console.log('╠══════════════════════════════════════════════╣');

  tasks.forEach(t => {
    const icon = t.status === 'done' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'running' ? '🔄' : '⏳';
    const desc = t.task.length > 35 ? t.task.slice(0, 35) + '...' : t.task;
    const skill = t.skill ? `[${t.skill}]` : '';
    console.log(`║  ${icon} ${t.id} ${desc.padEnd(36)} ${skill.padEnd(5)}║`);
  });

  const done = tasks.filter(t => t.status === 'done').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const total = tasks.length;

  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Done: ${done}/${total}   Failed: ${failed}/${total}`.padEnd(47) + '║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
}

// Spawn a worker process
function spawnWorker(workerId) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(BASE_DIR, 'worker.js'), String(workerId)], {
      stdio: 'inherit',
      cwd: BASE_DIR,
      env: { ...process.env }
    });

    child.on('close', (code) => {
      resolve({ workerId, exitCode: code });
    });

    child.on('error', (err) => {
      console.error(`Worker ${workerId} error: ${err.message}`);
      resolve({ workerId, exitCode: 1 });
    });
  });
}

async function main() {
  const { workers: workerCount } = parseArgs();
  const tasks = readTasks();
  const pending = tasks.filter(t => t.status === 'pending').length;

  if (pending === 0) {
    console.log('');
    console.log('📭 No pending tasks. Add tasks first:');
    console.log('   node add-task.js "Your task description" --skill jonny-writer');
    console.log('');
    process.exit(0);
  }

  // Don't spawn more workers than tasks
  const actualWorkers = Math.min(workerCount, pending);

  printBanner(actualWorkers);

  console.log(`🚀 Launching ${actualWorkers} worker(s)...\n`);

  // Spawn all workers in parallel
  const workerPromises = [];
  for (let i = 1; i <= actualWorkers; i++) {
    workerPromises.push(spawnWorker(i));
  }

  // Wait for all workers to finish
  const results = await Promise.all(workerPromises);

  console.log('\n🏁 All workers finished.\n');
  results.forEach(r => {
    const icon = r.exitCode === 0 ? '✅' : '❌';
    console.log(`  ${icon} Worker ${r.workerId} exited with code ${r.exitCode}`);
  });

  printSummary();
}

main().catch(err => {
  console.error(`💥 Runner crashed: ${err.message}`);
  process.exit(1);
});
