/**
 * lib/requirement-checker.js — Check whether skill requirements are met.
 * Maps requirement strings to tool commands or env var checks.
 */

const { execSync } = require('child_process');
const shared = require('./shared');

// Cached tool check results: { key: { ok, checkedAt } }
const toolCache = {};
const CACHE_TTL = 60000; // 60 seconds

const FIX_INSTRUCTIONS = {
  'Claude CLI':                             'Install from https://docs.anthropic.com/en/docs/claude-code',
  'Node.js':                                'Install from https://nodejs.org',
  'Node.js + Remotion':                     'Install Node.js from nodejs.org, then run: npm i -g @remotion/cli',
  'ffmpeg':                                 'Install from https://ffmpeg.org or run: choco install ffmpeg (Windows) / brew install ffmpeg (Mac)',
  'Whisper (word-level timestamps)':        'Run: pip install faster-whisper',
  'Python + rembg (background removal)':    'Run: pip install rembg',
  'React + Vite + Tailwind CSS':            'Install Node.js from https://nodejs.org (includes npm)',
  'CONVERTKIT_API_KEY (Kit v4 API)':        'Get your API key from Kit (ConvertKit) → Settings → API Keys, then add in Settings → API Keys',
  'TELEGRAM_BOT_TOKEN':                     'Create a bot via @BotFather on Telegram, then add the token in Settings → API Keys',
  'TELEGRAM_CHAT_ID':                       'Message @userinfobot on Telegram to get your chat ID, then add in Settings → API Keys',
  'APIFY_TOKEN':                            'Sign up at https://apify.com and get your API token, then add in Settings → API Keys',
  'Chrome DevTools MCP or Playwright MCP':  'Install a browser automation MCP server in your Claude config',
  'Chrome DevTools MCP':                    'Install Chrome DevTools MCP server in your Claude config',
  'Playwright MCP':                         'Install Playwright MCP server in your Claude config',
  'Playwright MCP (browser automation)':    'Install Playwright MCP server in your Claude config',
  'Facebook Ads Manager access':            'Log into Facebook Ads Manager in your browser first',
  'Facebook login cookies (active session)':'Log into Facebook in your browser first',
  'Skool login cookies (active session)':   'Log into Skool in your browser first',
  'HeyGen account + login cookies':         'Sign up at https://heygen.com and log in via your browser',
  'Ad video/image files':                   'Prepare your ad creative files (video or images) before running',
  'Video clips (stock or AI-generated)':    'Have video clips ready — from stock sites or AI video tools',
  'Veo 3.1 / Google Flow (AI video clips)': 'Access Veo 3.1 via Google AI Studio or Flow for AI video generation',
  'SkillBoss (image generation API)':       'SkillBoss must be installed as a skill — it provides image generation',
  'Web access (Perplexity/ScrapingDog/Firecrawl via SkillBoss)': 'SkillBoss must be installed — it provides web search access',
  'Web access (SkillBoss or browser MCP)':  'Install SkillBoss skill or a browser MCP for web access',
  'course-app project files':               'Clone the course-app project to your local machine',
  'Vercel (deployment)':                    'Sign up at https://vercel.com and install Vercel CLI: npm i -g vercel',
};

const REQUIREMENT_MAP = {
  // Tools (check via shell command)
  'Claude CLI':                             { type: 'tool', key: 'claude',    cmd: 'claude --version' },
  'Node.js':                                { type: 'tool', key: 'node',      cmd: 'node --version' },
  'Node.js + Remotion':                     { type: 'tool', key: 'node',      cmd: 'node --version' },
  'ffmpeg':                                 { type: 'tool', key: 'ffmpeg',    cmd: '{FFMPEG_BIN} -version' },
  'Whisper (word-level timestamps)':        { type: 'tool', key: 'whisper',   cmd: 'python -c "import faster_whisper; print(faster_whisper.__version__)"' },
  'Python + rembg (background removal)':    { type: 'tool', key: 'rembg',     cmd: 'python -c "import rembg; print(rembg.__version__)"' },
  'React + Vite + Tailwind CSS':            { type: 'tool', key: 'node',      cmd: 'node --version' },

  // API keys (check env var)
  'CONVERTKIT_API_KEY (Kit v4 API)':        { type: 'env', key: 'CONVERTKIT_API_KEY' },
  'TELEGRAM_BOT_TOKEN':                     { type: 'env', key: 'TELEGRAM_BOT_TOKEN' },
  'TELEGRAM_CHAT_ID':                       { type: 'env', key: 'TELEGRAM_CHAT_ID' },
  'APIFY_TOKEN':                            { type: 'env', key: 'APIFY_API_TOKEN' },

  // Manual checks (cannot verify automatically)
  'Chrome DevTools MCP or Playwright MCP':  { type: 'manual' },
  'Chrome DevTools MCP':                    { type: 'manual' },
  'Playwright MCP':                         { type: 'manual' },
  'Playwright MCP (browser automation)':    { type: 'manual' },
  'Facebook Ads Manager access':            { type: 'manual' },
  'Facebook login cookies (active session)':{ type: 'manual' },
  'Skool login cookies (active session)':   { type: 'manual' },
  'HeyGen account + login cookies':         { type: 'manual' },
  'Ad video/image files':                   { type: 'manual' },
  'Video clips (stock or AI-generated)':    { type: 'manual' },
  'Veo 3.1 / Google Flow (AI video clips)': { type: 'manual' },
  'SkillBoss (image generation API)':       { type: 'manual' },
  'Web access (Perplexity/ScrapingDog/Firecrawl via SkillBoss)': { type: 'manual' },
  'Web access (SkillBoss or browser MCP)':  { type: 'manual' },
  'course-app project files':               { type: 'manual' },
  'Vercel (deployment)':                    { type: 'manual' },
};

function checkToolCached(key, cmd) {
  const now = Date.now();
  if (toolCache[key] && (now - toolCache[key].checkedAt) < CACHE_TTL) {
    return toolCache[key].ok;
  }
  const resolvedCmd = cmd.replace('{FFMPEG_BIN}', shared.FFMPEG_BIN || 'ffmpeg');
  let ok = false;
  try {
    execSync(resolvedCmd, { stdio: 'pipe', timeout: 8000, windowsHide: true });
    ok = true;
  } catch (_) {}
  toolCache[key] = { ok, checkedAt: now };
  return ok;
}

/**
 * Check all requirements for a skill.
 * @param {string[]} requirements - Array of requirement strings
 * @returns {Object[]} - Array of { name, status: 'ok'|'missing'|'manual' }
 */
function checkAllRequirements(requirements) {
  if (!requirements || requirements.length === 0) return [];

  return requirements.map(name => {
    const fix = FIX_INSTRUCTIONS[name] || null;
    const mapping = REQUIREMENT_MAP[name];
    if (!mapping) {
      // Unknown requirement — try to guess if it looks like an env var
      const upperName = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      if (process.env[upperName]) return { name, status: 'ok', fix };
      if (process.env[name]) return { name, status: 'ok', fix };
      return { name, status: 'manual', fix };
    }

    if (mapping.type === 'manual') {
      return { name, status: 'manual', fix };
    }

    if (mapping.type === 'env') {
      const val = process.env[mapping.key];
      return { name, status: (val && val.length > 0) ? 'ok' : 'missing', fix };
    }

    if (mapping.type === 'tool') {
      const ok = checkToolCached(mapping.key, mapping.cmd);
      return { name, status: ok ? 'ok' : 'missing', fix };
    }

    return { name, status: 'manual', fix };
  });
}

module.exports = { checkAllRequirements };
