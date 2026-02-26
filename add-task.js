/**
 * add-task.js — Add a task to the queue
 *
 * Usage:
 *   node add-task.js "Write a FB post about AI video tools" --skill jonny-writer
 *   node add-task.js "Research trending AI news" --skill ai-news --priority 1
 *   node add-task.js "Create story slides for new course" --skill fb-stories --model opus
 *   node add-task.js "Fix the bug in auth.py" --max-turns 30 --dir /path/to/project
 *   node add-task.js --list-skills   # Show all available skills
 *
 * Options:
 *   --skill <name>         Attach a skill (see --list-skills)
 *   --priority <n>         Priority (1=highest, default=5)
 *   --model <name>         Model: sonnet (default), opus, haiku
 *   --max-turns <n>        Max agentic turns (default: 25)
 *   --max-budget <usd>     Max cost in USD per task
 *   --tools <list>         Allowed tools (e.g. "Read,Edit,Bash")
 *   --dir <path>           Working directory for the task
 *   --list-skills          Show all available skills and exit
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const TASKS_FILE = path.join(BASE_DIR, 'tasks.json');
const SKILLS_FILE = path.join(BASE_DIR, 'skills.json');

const skills = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf-8'));

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    task: null,
    skill: null,
    priority: 5,
    model: 'sonnet',
    max_turns: 25,
    max_budget_usd: null,
    allowed_tools: null,
    working_dir: null,
    list_skills: false
  };

  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case '--skill':
      case '-s':
        result.skill = args[++i];
        break;
      case '--priority':
      case '-p':
        result.priority = parseInt(args[++i]) || 5;
        break;
      case '--model':
      case '-m':
        result.model = args[++i];
        break;
      case '--max-turns':
        result.max_turns = parseInt(args[++i]) || 25;
        break;
      case '--max-budget':
        result.max_budget_usd = parseFloat(args[++i]);
        break;
      case '--tools':
        result.allowed_tools = args[++i];
        break;
      case '--dir':
      case '-d':
        result.working_dir = args[++i];
        break;
      case '--list-skills':
        result.list_skills = true;
        break;
      default:
        if (!args[i].startsWith('--') && !result.task) {
          result.task = args[i];
        }
        break;
    }
    i++;
  }

  return result;
}

function listSkills() {
  console.log('');
  console.log('📚 Available Skills:');
  console.log('─'.repeat(60));

  const maxName = Math.max(...Object.keys(skills).map(k => k.length));

  Object.entries(skills).forEach(([name, info]) => {
    const exists = fs.existsSync(info.file) ? '✅' : '❌';
    console.log(`  ${exists} ${name.padEnd(maxName + 2)} ${info.description}`);
  });

  console.log('');
  console.log('Usage: node add-task.js "Your task" --skill <name>');
  console.log('');
}

function generateId(tasks) {
  if (tasks.length === 0) return '001';
  const maxId = Math.max(...tasks.map(t => parseInt(t.id) || 0));
  return String(maxId + 1).padStart(3, '0');
}

function main() {
  const opts = parseArgs();

  if (opts.list_skills) {
    listSkills();
    return;
  }

  if (!opts.task) {
    console.log('');
    console.log('❌ No task description provided.');
    console.log('');
    console.log('Usage: node add-task.js "Your task description" --skill <skill-name>');
    console.log('       node add-task.js --list-skills');
    console.log('');
    process.exit(1);
  }

  // Validate skill
  if (opts.skill && !skills[opts.skill]) {
    console.log(`❌ Unknown skill: "${opts.skill}"`);
    console.log('   Run: node add-task.js --list-skills');
    process.exit(1);
  }

  // Read existing tasks
  const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));

  // Build new task
  const newTask = {
    id: generateId(tasks),
    task: opts.task,
    skill: opts.skill || null,
    status: 'pending',
    priority: opts.priority,
    model: opts.model,
    max_turns: opts.max_turns,
    worker: null,
    started_at: null,
    completed_at: null,
    result_file: null
  };

  // Add optional fields
  if (opts.max_budget_usd) newTask.max_budget_usd = opts.max_budget_usd;
  if (opts.allowed_tools) newTask.allowed_tools = opts.allowed_tools;
  if (opts.working_dir) newTask.working_dir = opts.working_dir;

  // Append and save
  tasks.push(newTask);
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));

  const skillLabel = opts.skill ? ` [skill: ${opts.skill}]` : '';
  console.log('');
  console.log(`✅ Task ${newTask.id} added${skillLabel}`);
  console.log(`   "${opts.task}"`);
  console.log(`   Priority: ${opts.priority} | Model: ${opts.model} | Max turns: ${opts.max_turns}`);
  console.log('');
  console.log(`📊 Queue: ${tasks.filter(t => t.status === 'pending').length} pending`);
  console.log('   Run: node run.js --workers 2');
  console.log('');
}

main();
