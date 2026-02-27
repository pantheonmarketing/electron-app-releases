// Test 2: Try spawning claude.cmd directly without shell
const { execSync, spawn } = require('child_process');

const env = { ...process.env };
delete env.CLAUDECODE;

// Test 1: execSync (blocking)
console.log('=== Test: execSync ===');
try {
  const result = execSync('claude -p "Say hi" --dangerously-skip-permissions --output-format text --model haiku --max-turns 1', {
    env,
    timeout: 30000,
    encoding: 'utf-8',
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  console.log('Result:', result);
} catch (err) {
  console.log('execSync error:', err.message?.slice(0, 200));
  console.log('stdout:', err.stdout?.slice(0, 200));
  console.log('stderr:', err.stderr?.slice(0, 200));
}
