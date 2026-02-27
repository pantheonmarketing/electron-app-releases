// Quick test: can we run claude -p from Node.js?
const { spawn } = require('child_process');

// Remove CLAUDECODE
const env = { ...process.env };
delete env.CLAUDECODE;

console.log('Testing claude -p...');
console.log('CLAUDECODE env:', env.CLAUDECODE || '(unset)');

const child = spawn('claude', [
  '-p', 'Say hello in exactly 5 words',
  '--dangerously-skip-permissions',
  '--output-format', 'text',
  '--model', 'haiku',
  '--max-turns', '1'
], {
  env,
  shell: true,
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

child.stdout.on('data', d => {
  stdout += d.toString();
  process.stdout.write('[STDOUT] ' + d.toString());
});

child.stderr.on('data', d => {
  stderr += d.toString();
  process.stderr.write('[STDERR] ' + d.toString());
});

child.on('close', code => {
  console.log(`\n\nExit code: ${code}`);
  console.log('STDOUT:', stdout || '(empty)');
  console.log('STDERR:', stderr || '(empty)');
});

child.on('error', err => {
  console.error('Spawn error:', err.message);
});

// Timeout after 60s
setTimeout(() => {
  console.log('\n⏰ Timeout after 60s - killing process');
  child.kill();
  process.exit(1);
}, 60000);
