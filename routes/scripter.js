const express = require('express');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { shellEscape } = require('../lib/helpers');
const RickStore = require('../lib/rick-store');
const {
  addScriptVersion,
  cleanText,
  createRecordingScenes,
  createMessage,
  ensureScriptVersions,
  funnelChoicesFor,
  isBriefReady,
  publicSession,
  sanitizeBrief,
  selectScriptVersion,
  setFunnel,
  setModel,
  setUpdated,
  validateCriticFeedback,
  validateCritiqueSummary,
  validateIdeas,
  validateRecordingFramings,
  validateRecordingSelection,
  validateScript,
} = require('../lib/rick-engine');
const router = express.Router();

const busySessions = new Set();
const cliStatusCache = new Map();

function getStore() {
  return new RickStore(shared.BASE_DIR);
}

function resolveSkillFile(name) {
  const localPath = path.join(shared.BASE_DIR, 'skills', name);
  if (fs.existsSync(localPath)) return localPath;
  return path.join(shared.APP_DIR, 'skills', name);
}

function readRickInstructions() {
  const prompt = fs.readFileSync(resolveSkillFile('rick-prompt.md'), 'utf-8');
  const knowledge = fs.readFileSync(resolveSkillFile('rick-knowledge.md'), 'utf-8');
  return `${prompt}\n\n<private_strategy_notes>\n${knowledge}\n</private_strategy_notes>`;
}

function cliReady(binary) {
  const cached = cliStatusCache.get(binary);
  if (cached && Date.now() - cached.checkedAt < 30000) return cached.ready;
  let ready = false;
  try {
    const result = require('child_process').spawnSync(binary, ['--version'], {
      shell: process.platform === 'win32',
      windowsHide: true,
      timeout: 5000,
      stdio: 'ignore',
    });
    ready = result.status === 0;
  } catch (_) {
    ready = false;
  }
  cliStatusCache.set(binary, { checkedAt: Date.now(), ready });
  return ready;
}

function claudeCliReady() {
  return cliReady('claude');
}

/**
 * The workers that can write a script. `blurb` and `hint` are shown to users
 * verbatim, so they stay plain-language and jargon-free.
 */
const WORKERS = [
  {
    id: 'claude',
    label: 'Claude',
    tagline: 'Best for scripts',
    blurb: 'Writes the most natural sounding scripts. Start here.',
    recommended: true,
    setupHint: 'Install the Claude app and sign in, then reopen this menu.',
    isReady: () => claudeCliReady(),
  },
  {
    id: 'codex',
    label: 'Codex',
    tagline: 'A second opinion',
    blurb: 'Runs on your ChatGPT sign in. Try it when a script feels flat.',
    recommended: false,
    setupHint: 'Install the Codex app and sign in, then reopen this menu.',
    isReady: () => cliReady('codex'),
  },
  {
    id: 'openai',
    label: 'OpenAI key',
    tagline: 'Pay per script',
    blurb: 'Uses your own OpenAI key and bills your OpenAI account.',
    recommended: false,
    setupHint: 'Add an OpenAI API key in Settings to turn this on.',
    isReady: () => Boolean(process.env.OPENAI_API_KEY),
  },
];

function findWorker(id) {
  return WORKERS.find((worker) => worker.id === id) || null;
}

/**
 * Resolve 'auto' the way the scripter behaved before the picker existed:
 * an OpenAI key wins, then the Claude CLI. Codex is opt-in only, so an
 * existing session's output never changes just because Codex is installed.
 */
function resolveAutoWorker() {
  if (process.env.OPENAI_API_KEY) return findWorker('openai');
  if (claudeCliReady()) return findWorker('claude');
  return null;
}

function resolveWorker(session) {
  const choice = session?.model || 'auto';
  if (choice === 'auto') return resolveAutoWorker();
  const worker = findWorker(choice);
  // A picked worker that has since been uninstalled falls back rather than dead-ends.
  if (worker && worker.isReady()) return worker;
  return resolveAutoWorker();
}

function getModelCatalog(session) {
  const resolved = resolveWorker(session);
  // Describes what Automatic itself would pick, which is not the same as what
  // the current selection resolves to once the user has chosen a worker.
  const autoWorker = resolveAutoWorker();
  const auto = {
    id: 'auto',
    label: 'Automatic',
    tagline: 'Recommended',
    blurb: autoWorker
      ? `Rick picks whichever is set up. Right now that is ${autoWorker.label}.`
      : 'Rick picks whichever is set up. Nothing is set up yet.',
    recommended: true,
    available: Boolean(autoWorker),
    setupHint: 'Set up Claude, Codex, or an OpenAI key to turn this on.',
  };
  const options = WORKERS.map((worker) => ({
    id: worker.id,
    label: worker.label,
    tagline: worker.tagline,
    blurb: worker.blurb,
    recommended: worker.recommended,
    available: worker.isReady(),
    setupHint: worker.setupHint,
  }));
  return {
    selected: session?.model || 'auto',
    resolved: resolved ? resolved.id : null,
    resolvedLabel: resolved ? resolved.label : null,
    options: [auto, ...options],
  };
}

function getProviderStatus() {
  const worker = resolveAutoWorker();
  if (!worker) {
    return { ready: false, provider: 'none', label: 'Connect an AI provider', model: null };
  }
  if (worker.id === 'openai') {
    return {
      ready: true,
      provider: 'openai',
      label: 'OpenAI connected',
      model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
    };
  }
  return { ready: true, provider: 'claude-cli', label: 'Local AI connected', model: 'sonnet' };
}

const briefSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    niche: { type: 'string' },
    audience: { type: 'string' },
    content_type: { type: 'string' },
    ready: { type: 'boolean' },
    reply: { type: 'string' },
    ideas: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 10 },
  },
  required: ['niche', 'audience', 'content_type', 'ready', 'reply', 'ideas'],
};

const ideasSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    ideas: { type: 'array', items: { type: 'string' }, minItems: 10, maxItems: 10 },
  },
  required: ['reply', 'ideas'],
};

const scriptSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    hook: { type: 'string' },
    body: { type: 'string' },
    conclusion: { type: 'string' },
    cta: { type: 'string' },
    caption: { type: 'string' },
  },
  required: ['reply', 'hook', 'body', 'conclusion', 'cta', 'caption'],
};

const criticFeedbackSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    improvements: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
  },
  required: ['verdict', 'strengths', 'improvements'],
};

const critiqueSummarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    improvements: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
    disagreements: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 3 },
  },
  required: ['summary', 'improvements', 'disagreements'],
};

const CRITIC_PROFILES = [
  {
    id: 'hook-doctor',
    name: 'Hook Doctor',
    focus: 'Hook strength audience relevance and short-form retention',
  },
  {
    id: 'story-editor',
    name: 'Story Editor',
    focus: 'Clarity specificity structure and natural spoken delivery',
  },
  {
    id: 'funnel-strategist',
    name: 'Funnel Strategist',
    focus: 'Funnel fit payoff credibility and call to action',
  },
];

function actionContract(action) {
  if (action === 'brief') {
    return {
      schema: briefSchema,
      // Ideas are not written here any more: they depend on the funnel stage,
      // which the user is asked for once the brief is complete. Writing them
      // now would only produce ten ideas aimed at nothing in particular.
      instruction: 'Extract and update the niche audience and content type from the full conversation. Preserve known details. Always return zero ideas. If any field is unclear set ready false and ask one direct question for the missing detail. If all three are clear set ready true and confirm the brief back in one short line without asking another question.',
    };
  }
  if (action === 'ideas') {
    return {
      schema: ideasSchema,
      instruction: 'Generate exactly 10 distinct one-line hook ideas for the brief. Apply the latest feedback and selected funnel stage. The reply is one short energetic introduction.',
    };
  }
  if (action === 'script') {
    return {
      schema: scriptSchema,
      instruction: 'Write the selected idea as a complete spoken short-form script with Hook Body Conclusion CTA and Caption. Keep spoken sections free of production directions and use minimal punctuation. The reply should briefly introduce the finished script and ask whether it brings a personal experience to mind.',
    };
  }
  if (action === 'critique') {
    return {
      schema: criticFeedbackSchema,
      instruction: 'Act only as the critic described in the latest user instruction. Review the current script independently. Give a concise verdict, one to three real strengths, and one to four specific improvements. Do not rewrite the script and do not defer to other critics.',
    };
  }
  if (action === 'critique_merge') {
    return {
      schema: critiqueSummarySchema,
      instruction: 'Compare the supplied independent critiques. Return a concise overall summary and a prioritized list of no more than five concrete improvements. Call out genuine disagreements or incompatible recommendations. Do not invent a disagreement when the critics agree.',
    };
  }
  if (action === 'critique_apply') {
    return {
      schema: scriptSchema,
      instruction: 'Rewrite the complete current script by applying the supplied prioritized critique improvements. Resolve disagreements using the brief selected idea and funnel intent. Return every script field and preserve the core message. Keep spoken sections natural with minimal punctuation and no production directions.',
    };
  }
  if (action === 'personalize') {
    return {
      schema: scriptSchema,
      instruction: 'Rewrite the full script around the personal experience in the latest user message. Keep the selected idea and funnel intent recognizable. The reply should briefly say what changed.',
    };
  }
  return {
    schema: scriptSchema,
    instruction: 'Revise the existing script according to the latest instruction. Return every script field. Keep fields outside the requested section unchanged unless a small consistency edit is required. The reply should briefly describe the revision.',
  };
}

function providerContext(session, action, userInstruction = '') {
  return {
    action,
    funnel: session.funnel,
    brief: session.brief,
    ideas: session.ideas,
    selectedIdea: session.selectedIdea,
    currentScript: session.script,
    currentCritique: session.critique || null,
    userInstruction,
    conversation: session.messages.slice(-14).map((message) => ({
      role: message.role,
      text: message.text,
    })),
  };
}

function extractResponseText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

function parseJsonOutput(text) {
  const cleaned = cleanText(text, 50000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI returned an unreadable response');
  }
}

async function callOpenAI(action, session, userInstruction) {
  const { schema, instruction } = actionContract(action);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
    store: false,
    max_output_tokens: 4000,
    reasoning: { effort: 'low' },
    instructions: readRickInstructions(),
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: `${instruction}\n\nSession context:\n${JSON.stringify(providerContext(session, action, userInstruction))}`,
      }],
    }],
    text: {
      format: {
        type: 'json_schema',
        name: `rick_${action}`,
        strict: true,
        schema,
      },
    },
  };
  if (process.env.OPENAI_VECTOR_STORE_ID) {
    body.tools = [{ type: 'file_search', vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID] }];
  }
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `OpenAI request failed with ${response.status}`);
    }
    return parseJsonOutput(extractResponseText(data));
  } finally {
    clearTimeout(timeout);
  }
}

function callClaudeCli(action, session, userInstruction) {
  const { schema, instruction } = actionContract(action);
  const prompt = `${readRickInstructions()}\n\n<task>\n${instruction}\nReturn JSON matching this schema exactly:\n${JSON.stringify(schema)}\n</task>\n\n<session_context>\n${JSON.stringify(providerContext(session, action, userInstruction))}\n</session_context>`;
  return new Promise((resolve, reject) => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    const child = spawn('claude', ['-p', '--output-format', 'text', '--model', 'sonnet'], {
      cwd: shared.BASE_DIR,
      env: cleanEnv,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) return reject(new Error('The local AI timed out'));
      if (code !== 0) return reject(new Error(stderr.trim() || `Local AI exited with code ${code}`));
      try { resolve(parseJsonOutput(stdout)); }
      catch (error) { reject(error); }
    });
    child.stdin.end(prompt);
  });
}

function callCodexCli(action, session, userInstruction) {
  const { schema, instruction } = actionContract(action);
  const prompt = `${readRickInstructions()}\n\n<task>\n${instruction}\n</task>\n\n<session_context>\n${JSON.stringify(providerContext(session, action, userInstruction))}\n</session_context>`;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const schemaFile = path.join(shared.LOGS_DIR, `rick-codex-schema-${stamp}.json`);
  const outputFile = path.join(shared.LOGS_DIR, `rick-codex-out-${stamp}.json`);
  fs.mkdirSync(shared.LOGS_DIR, { recursive: true });
  fs.writeFileSync(schemaFile, JSON.stringify(schema));
  const cleanup = () => {
    try { fs.unlinkSync(schemaFile); } catch (_) {}
    try { fs.unlinkSync(outputFile); } catch (_) {}
  };
  return new Promise((resolve, reject) => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    // Rick only writes text, so the sandbox stays read-only and nothing is persisted.
    const child = spawn('codex', [
      'exec',
      '--sandbox', 'read-only',
      '--skip-git-repo-check',
      '--ephemeral',
      '--color', 'never',
      '--output-schema', schemaFile,
      '--output-last-message', outputFile,
    ], {
      cwd: shared.BASE_DIR,
      env: cleanEnv,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) return reject(new Error('The local AI timed out'));
      // Codex logs warnings to stderr on success, so only the exit code decides.
      if (code !== 0) return reject(new Error(stderr.trim() || `Codex exited with code ${code}`));
      try {
        resolve(parseJsonOutput(fs.readFileSync(outputFile, 'utf-8')));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(prompt);
  }).finally(cleanup);
}

async function callRick(action, session, userInstruction = '') {
  const worker = resolveWorker(session);
  if (!worker) throw new Error('Connect OpenAI in Settings or sign in to the local Claude CLI');
  console.log(`[Rick] ${action} via ${worker.id} (choice: ${session?.model || 'auto'})`);
  if (worker.id === 'openai') return callOpenAI(action, session, userInstruction);
  if (worker.id === 'codex') return callCodexCli(action, session, userInstruction);
  return callClaudeCli(action, session, userInstruction);
}

const AI_ERROR_RULES = [
  { test: /abort|took too long|timed? ?out|ETIMEDOUT/i, message: 'That request took too long and stopped before Rick finished. Retry and it usually goes through.' },
  { test: /invalid[_ ]api[_ ]key|incorrect api key|unauthorized|\b401\b/i, message: 'Your OpenAI key was rejected. Update it in Settings then retry.' },
  { test: /insufficient_quota|exceeded your current quota|billing/i, message: 'Your OpenAI account is out of credit. Top it up or check your billing then retry.' },
  { test: /rate[_ ]?limit|quota|\b429\b/i, message: 'OpenAI is rate limiting this account right now. Wait a moment then retry.' },
  { test: /\b50[0234]\b|server_error|overloaded|service unavailable/i, message: 'The AI provider is having a temporary problem. Retry in a moment.' },
  { test: /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN/i, message: 'Could not reach the AI provider. Check your internet connection then retry.' },
  { test: /ENOENT|spawn|not recognized|command not found/i, message: 'The local AI could not start. Check it is installed and signed in then retry.' },
  { test: /exited with code|local ai/i, message: 'The local AI stopped before finishing. Check it is signed in then retry.' },
  { test: /unreadable response|exactly 10 ideas|duplicate ideas|incomplete script|production directions|incomplete critic|incomplete critique/i, message: 'Rick sent back an answer in the wrong shape. Retry usually clears it up.' },
];

/**
 * Turns a provider or validation error into something a user can act on.
 * The raw text still goes to the server log and the response detail field.
 */
function friendlyAiError(error, fallback) {
  const raw = cleanText(error?.message, 400);
  if (/^Connect OpenAI/i.test(raw)) return raw;
  const haystack = `${error?.name || ''} ${raw}`;
  const rule = AI_ERROR_RULES.find((item) => item.test.test(haystack));
  return rule ? rule.message : fallback;
}

/**
 * A failed turn is never saved, so the stored session still holds the
 * pre-request state and the client can safely resend the same payload.
 */
function sendAiFailure(res, error, fallback) {
  res.status(500).json({
    error: friendlyAiError(error, fallback),
    detail: cleanText(error?.message, 400) || undefined,
    retryable: true,
  });
}

function findSessionOr404(req, res) {
  const session = getStore().get(req.params.id);
  if (!session) res.status(404).json({ error: 'Session not found' });
  return session;
}

function missingBriefReply(brief) {
  const missing = [];
  if (!brief.niche) missing.push('what the content is about');
  if (!brief.audience) missing.push('who it is for');
  if (!brief.contentType) missing.push('the kind of content you want to make');
  return `Tell me ${missing.join(' and ')} and I can make the ideas specific`;
}

function runFfmpeg(args, timeoutMs = 5 * 60 * 1000) {
  const binary = String(shared.FFMPEG_BIN || 'ffmpeg').replace(/^"|"$/g, '');
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      finish(new Error('Video combination took too long'));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => { stderr += chunk.toString().slice(-1200); });
    child.on('error', finish);
    child.on('close', (code) => finish(code === 0 ? null : new Error(stderr.trim() || `FFmpeg exited with code ${code}`)));
  });
}

function removeFiles(files) {
  for (const file of files) {
    try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
  }
}

async function createCritique(session, criticCount) {
  // A previous critique must not anchor a fresh independent review.
  const critiqueSession = { ...session, critique: null };
  const profiles = CRITIC_PROFILES.slice(0, criticCount);
  const critics = await Promise.all(profiles.map(async (profile) => {
    const instruction = JSON.stringify({
      critic: profile.name,
      focus: profile.focus,
      requirement: 'Review independently and return only your own assessment',
    });
    const feedback = validateCriticFeedback(await callRick('critique', critiqueSession, instruction));
    return { ...profile, ...feedback };
  }));
  const merged = validateCritiqueSummary(await callRick('critique_merge', critiqueSession, JSON.stringify({ critics })));
  return {
    criticCount,
    critics,
    ...merged,
    applied: false,
    createdAt: new Date().toISOString(),
  };
}

router.get('/scripter/status', (req, res) => {
  res.json(getProviderStatus());
});

router.get('/scripter/models', (req, res) => {
  const session = req.query.sessionId ? getStore().get(String(req.query.sessionId)) : null;
  res.json(getModelCatalog(session));
});

router.get('/scripter/sessions', (req, res) => {
  res.json({ sessions: getStore().list() });
});

router.post('/scripter/sessions', (req, res) => {
  const session = getStore().create();
  res.status(201).json({ session: publicSession(session) });
});

router.get('/scripter/sessions/:id', (req, res) => {
  const session = findSessionOr404(req, res);
  if (session) res.json({ session: publicSession(session) });
});

router.get('/scripter/sessions/:id/teleprompter', (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  if (!session.script) return res.status(400).json({ error: 'Build a script before opening the teleprompter' });
  try {
    res.json({ scenes: createRecordingScenes(session.script), output: session.recording || null });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/scripter/sessions/:id/recordings/combine', (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  if (!session.script) return res.status(400).json({ error: 'Build a script before recording it' });
  let scenes;
  try { scenes = createRecordingScenes(session.script); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  req.params.projectId = session.id;
  shared.reelUpload.array('scenes', 40)(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ error: uploadError.message });
    const files = req.files || [];
    let selection;
    try {
      selection = validateRecordingSelection(
        JSON.parse(String(req.body.recordedIndexes || '[]')),
        JSON.parse(String(req.body.skippedIndexes || '[]')),
        scenes.length,
      );
    } catch (error) {
      removeFiles(files.map((file) => file.path));
      return res.status(400).json({ error: error.message });
    }
    if (files.length !== selection.recordedIndexes.length) {
      removeFiles(files.map((file) => file.path));
      return res.status(400).json({ error: 'The uploaded recordings do not match the completed scenes' });
    }
    let framings;
    try {
      const framingInput = req.body.framings
        ? JSON.parse(String(req.body.framings))
        : new Array(files.length).fill({ zoom: 1, x: 0, y: 0 });
      framings = validateRecordingFramings(framingInput, files.length);
    } catch (error) {
      removeFiles(files.map((file) => file.path));
      return res.status(400).json({ error: error.message });
    }

    const outputDir = path.join(shared.UPLOADS_DIR, session.id);
    const stamp = Date.now();
    const outputName = `rick-recording-${stamp}.mp4`;
    const outputPath = path.join(outputDir, outputName);
    const inputArgs = files.flatMap((file) => ['-i', path.resolve(file.path)]);
    const normalizedStreams = files.map((_, index) => {
      const framing = framings[index];
      const width = Math.round((1080 * framing.zoom) / 2) * 2;
      const height = Math.round((1920 * framing.zoom) / 2) * 2;
      const cropX = ((framing.x + 1) / 2).toFixed(4);
      const cropY = ((framing.y + 1) / 2).toFixed(4);
      return `[${index}:v:0]scale=${width}:${height}:force_original_aspect_ratio=increase,`
      + `crop=1080:1920:'(iw-1080)*${cropX}':'(ih-1920)*${cropY}',setsar=1,fps=30,setpts=PTS-STARTPTS[v${index}];`
      + `[${index}:a:0]aresample=48000,asetpts=PTS-STARTPTS[a${index}]`
    }).join(';');
    const concatInputs = files.map((_, index) => `[v${index}][a${index}]`).join('');
    const filter = `${normalizedStreams};${concatInputs}concat=n=${files.length}:v=1:a=1[v][a]`;

    try {
      await runFfmpeg([
        '-hide_banner', '-loglevel', 'error',
        ...inputArgs,
        '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', outputPath,
      ]);
      const recording = {
        url: `/uploads/${session.id}/${outputName}`,
        path: `uploads/${session.id}/${outputName}`,
        filename: outputName,
        sceneCount: scenes.length,
        recordedSceneCount: files.length,
        skippedSceneCount: selection.skippedIndexes.length,
        sceneFiles: files.map((file, index) => ({
          sceneIndex: selection.recordedIndexes[index],
          label: scenes[selection.recordedIndexes[index]].label,
          path: `uploads/${session.id}/${file.filename}`,
          framing: framings[index],
        })),
        skippedScenes: selection.skippedIndexes.map((sceneIndex) => ({
          sceneIndex,
          label: scenes[sceneIndex].label,
        })),
        createdAt: new Date().toISOString(),
      };
      session.recording = recording;
      setUpdated(session);
      getStore().save(session);
      res.json({ ok: true, recording, session: publicSession(session) });
    } catch (error) {
      console.error('[Rick] Recording combine failed:', error.message);
      removeFiles([outputPath, ...files.map((file) => file.path)]);
      res.status(500).json({ error: 'Rick could not combine those scenes. Check FFmpeg in Setup and try again.' });
    }
  });
});

router.delete('/scripter/sessions/:id', (req, res) => {
  const deleted = getStore().delete(req.params.id);
  res.status(deleted ? 200 : 404).json(deleted ? { ok: true } : { error: 'Session not found' });
});

router.patch('/scripter/sessions/:id/funnel', (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  try {
    setFunnel(session, req.body.funnel);
    session.critique = null;
    getStore().save(session);
    res.json({ session: publicSession(session) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Answers the funnel question and writes the ideas for that stage in one turn,
 * because choosing the stage is only meaningful when it changes the ideas.
 * Nothing is saved if the ideas fail, so Retry replays the same choice safely.
 */
router.post('/scripter/sessions/:id/funnel/choose', async (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  if (!isBriefReady(session.brief)) return res.status(400).json({ error: 'Tell Rick the topic audience and content type first' });
  if (busySessions.has(session.id)) return res.status(409).json({ error: 'Rick is already working on this session' });
  try {
    setFunnel(session, req.body.funnel);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  busySessions.add(session.id);
  try {
    const result = await callRick('ideas', session, `The user chose the ${session.funnel} funnel stage`);
    session.ideas = validateIdeas(result);
    session.selectedIdea = null;
    session.stage = 'ideas';
    session.messages.push(createMessage('assistant', 'ideas', {
      text: cleanText(result.reply, 800) || 'Nice this has some heat Pick the idea you want to build',
      ideas: session.ideas,
    }));
    setUpdated(session);
    getStore().save(session);
    res.json({ session: publicSession(session) });
  } catch (error) {
    console.error('[Rick] Funnel choice failed:', error.message);
    sendAiFailure(res, error, 'Rick could not write the ideas for that stage. Retry and it usually goes through.');
  } finally {
    busySessions.delete(session.id);
  }
});

router.patch('/scripter/sessions/:id/model', (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  try {
    setModel(session, req.body.model);
    getStore().save(session);
    res.json({ session: publicSession(session), models: getModelCatalog(session) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/scripter/sessions/:id/message', async (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  const message = cleanText(req.body.message, 3000);
  if (!message) return res.status(400).json({ error: 'Message required' });
  if (busySessions.has(session.id)) return res.status(409).json({ error: 'Rick is still working on the previous message' });
  busySessions.add(session.id);
  try {
    session.messages.push(createMessage('user', 'text', { text: message }));
    if (session.stage === 'brief') {
      const result = await callRick('brief', session, message);
      session.brief = sanitizeBrief({ ...session.brief, ...result });
      if (isBriefReady(session.brief) && result.ready) {
        session.title = session.brief.niche.slice(0, 54) || session.title;
        if (session.funnel) {
          // Already chosen from the header, so do not ask the same thing twice.
          session.ideas = validateIdeas(await callRick('ideas', session, message));
          session.stage = 'ideas';
          session.messages.push(createMessage('assistant', 'ideas', {
            text: 'Nice this has some heat Pick the idea you want to build',
            ideas: session.ideas,
          }));
        } else {
          // The brief is settled but the ideas are not written yet: what makes
          // a good idea depends entirely on what the video is meant to do, so
          // the user picks that first.
          session.messages.push(createMessage('assistant', 'funnel', {
            text: cleanText(result.reply, 800) || `Got it: ${session.brief.niche} for ${session.brief.audience}`,
            funnelChoices: funnelChoicesFor(session, getStore().list()),
          }));
        }
      } else {
        session.messages.push(createMessage('assistant', 'text', {
          text: cleanText(result.reply, 1000) || missingBriefReply(session.brief),
        }));
      }
    } else if (session.stage === 'ideas') {
      const result = await callRick('ideas', session, message);
      session.ideas = validateIdeas(result);
      session.selectedIdea = null;
      session.messages.push(createMessage('assistant', 'ideas', {
        text: cleanText(result.reply, 800) || 'Fresh batch Pick the one that feels hottest',
        ideas: session.ideas,
      }));
    } else if (session.script) {
      if (/^(no|nope|skip|nothing|all good|done)$/i.test(message.trim())) {
        session.completed = true;
        session.messages.push(createMessage('assistant', 'text', {
          text: 'Nice this one is ready Copy it or keep refining whenever you want',
        }));
      } else {
        // Capture the draft that is currently visible before replacing it.
        // This is especially important for sessions created before versions
        // existed: their current script must become v1, not the rewrite.
        ensureScriptVersions(session);
        const result = await callRick('personalize', session, message);
        session.script = validateScript(result);
        addScriptVersion(session, 'personalized');
        session.recording = null;
        session.critique = null;
        session.completed = false;
        session.messages.push(createMessage('assistant', 'script', {
          text: cleanText(result.reply, 800) || 'That personal detail makes it hit harder Here is the rewrite',
          script: session.script,
        }));
      }
    }
    setUpdated(session);
    getStore().save(session);
    res.json({ session: publicSession(session) });
  } catch (error) {
    console.error('[Rick] Message failed:', error.message);
    sendAiFailure(res, error, 'Rick could not finish that turn. Retry and it usually goes through.');
  } finally {
    busySessions.delete(session.id);
  }
});

router.post('/scripter/sessions/:id/build', async (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  const index = Number(req.body.ideaIndex);
  if (!Number.isInteger(index) || index < 0 || index >= session.ideas.length) {
    return res.status(400).json({ error: 'Choose one of the 10 ideas' });
  }
  if (busySessions.has(session.id)) return res.status(409).json({ error: 'Rick is already building something' });
  busySessions.add(session.id);
  try {
    // Preserve an existing draft before building a different idea over it.
    // For the first build there is no script yet, so this is a harmless no-op.
    ensureScriptVersions(session);
    session.selectedIdea = { index, text: session.ideas[index] };
    session.stage = 'script';
    session.messages.push(createMessage('user', 'text', {
      text: `Build idea ${index + 1} ${session.ideas[index]}`,
    }));
    const result = await callRick('script', session, session.ideas[index]);
    session.script = validateScript(result);
    // Building another idea appends rather than resetting, so the earlier
    // script stays reachable from the version picker.
    addScriptVersion(session, session.scriptVersions?.length ? 'rebuild' : 'original');
    session.recording = null;
    session.critique = null;
    session.stage = 'personalize';
    session.completed = false;
    session.messages.push(createMessage('assistant', 'script', {
      text: cleanText(result.reply, 1000) || 'Fire Here is the full script Does this bring any personal experience to mind',
      script: session.script,
    }));
    setUpdated(session);
    getStore().save(session);
    res.json({ session: publicSession(session) });
  } catch (error) {
    session.stage = 'ideas';
    console.error('[Rick] Build failed:', error.message);
    sendAiFailure(res, error, 'Rick could not build that script. Retry and it usually goes through.');
  } finally {
    busySessions.delete(session.id);
  }
});

router.post('/scripter/sessions/:id/revise', async (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  if (!session.script) return res.status(400).json({ error: 'Build a script first' });
  const section = cleanText(req.body.section, 40).toLowerCase();
  const instruction = cleanText(req.body.instruction, 1500) || `Make the ${section || 'script'} stronger`;
  if (busySessions.has(session.id)) return res.status(409).json({ error: 'Rick is already revising the script' });
  busySessions.add(session.id);
  try {
    const fullInstruction = section ? `Revise only the ${section} section ${instruction}` : instruction;
    session.messages.push(createMessage('user', 'text', { text: fullInstruction }));
    // Adopt legacy/current wording as v1 before the AI result replaces it.
    ensureScriptVersions(session);
    const result = await callRick('revise', session, fullInstruction);
    session.script = validateScript(result);
    addScriptVersion(session, 'revision');
    session.recording = null;
    session.critique = null;
    session.completed = false;
    session.messages.push(createMessage('assistant', 'script', {
      text: cleanText(result.reply, 800) || 'Updated That version lands cleaner',
      script: session.script,
    }));
    setUpdated(session);
    getStore().save(session);
    res.json({ session: publicSession(session) });
  } catch (error) {
    console.error('[Rick] Revision failed:', error.message);
    sendAiFailure(res, error, 'Rick could not revise that section. Retry and it usually goes through.');
  } finally {
    busySessions.delete(session.id);
  }
});

router.post('/scripter/sessions/:id/critique', async (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  if (!session.script) return res.status(400).json({ error: 'Build a script first' });
  const criticCount = Number(req.body.criticCount);
  if (!Number.isInteger(criticCount) || criticCount < 1 || criticCount > 3) {
    return res.status(400).json({ error: 'Choose between one and three critics' });
  }
  if (busySessions.has(session.id)) return res.status(409).json({ error: 'Rick is already working on this script' });
  busySessions.add(session.id);
  try {
    session.critique = await createCritique(session, criticCount);
    setUpdated(session);
    getStore().save(session);
    res.json({ session: publicSession(session) });
  } catch (error) {
    console.error('[Rick] Critique failed:', error.message);
    sendAiFailure(res, error, 'Rick could not finish the critique. Retry and it usually goes through.');
  } finally {
    busySessions.delete(session.id);
  }
});

router.post('/scripter/sessions/:id/critique/apply', async (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  if (!session.script || !session.critique) {
    return res.status(400).json({ error: 'Ask for a critique first' });
  }
  if (session.critique.applied) return res.status(400).json({ error: 'Those improvements are already applied' });
  if (busySessions.has(session.id)) return res.status(409).json({ error: 'Rick is already working on this script' });
  busySessions.add(session.id);
  try {
    const instruction = JSON.stringify({
      summary: session.critique.summary,
      improvements: session.critique.improvements,
      disagreements: session.critique.disagreements,
    });
    const result = await callRick('critique_apply', session, instruction);
    // The pre-critique script is already a version, so only the improved one
    // needs adding. The user reaches the old wording from the version picker.
    ensureScriptVersions(session);
    session.script = validateScript(result);
    addScriptVersion(session, 'critique');
    session.recording = null;
    session.critique.applied = true;
    session.critique.appliedAt = new Date().toISOString();
    session.completed = false;
    session.messages.push(createMessage('assistant', 'script', {
      text: cleanText(result.reply, 800) || 'I applied the strongest critique points and tightened the script',
      script: session.script,
    }));
    setUpdated(session);
    getStore().save(session);
    res.json({ session: publicSession(session) });
  } catch (error) {
    console.error('[Rick] Critique apply failed:', error.message);
    sendAiFailure(res, error, 'Rick could not apply those improvements. Retry and it usually goes through.');
  } finally {
    busySessions.delete(session.id);
  }
});

router.post('/scripter/sessions/:id/critique/skip', (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  if (busySessions.has(session.id)) return res.status(409).json({ error: 'Rick is already working on this script' });
  session.critique = null;
  setUpdated(session);
  getStore().save(session);
  res.json({ session: publicSession(session) });
});

/**
 * Switches which stored version is the working draft. Nothing is written over
 * and no AI call is made, so moving between versions is free and reversible.
 */
router.post('/scripter/sessions/:id/script/version', (req, res) => {
  const session = findSessionOr404(req, res);
  if (!session) return;
  if (busySessions.has(session.id)) return res.status(409).json({ error: 'Rick is already working on this script' });
  const current = session.scriptVersionId;
  const version = selectScriptVersion(session, req.body.versionId);
  if (!version) return res.status(400).json({ error: 'That script version is no longer available' });
  if (version.id !== current) {
    // A recording and a critique both describe the words they were made from,
    // so they do not survive a switch to different words.
    session.recording = null;
    session.critique = null;
    session.completed = false;
    session.messages.push(createMessage('assistant', 'script', {
      text: `Switched to v${version.number} of the script`,
      script: session.script,
    }));
  }
  setUpdated(session);
  getStore().save(session);
  res.json({ session: publicSession(session) });
});

router.post('/scripter/generate', (req, res) => {
  const { framework, topic, rewriteScript, mode, voice, durationSecs } = req.body;
  if (!framework || !topic) return res.status(400).json({ error: 'Framework and topic required' });
  const startTime = Date.now();
  const scriptMode = mode || 'ads';
  const targetSecs = durationSecs || 30;
  const wordsLow = Math.round(targetSecs * 2.5);
  const wordsHigh = Math.round(targetSecs * 3);
  let frameworksPath = path.join(shared.BASE_DIR, 'skills', 'scripter-frameworks.md');
  if (!fs.existsSync(frameworksPath)) frameworksPath = path.join(shared.APP_DIR, 'skills', 'scripter-frameworks.md');
  if (!fs.existsSync(frameworksPath)) return res.status(500).json({ error: 'Frameworks file not found' });
  const frameworksDoc = fs.readFileSync(frameworksPath, 'utf-8');
  const modeInstruction = scriptMode === 'social'
    ? `Generate a viral SOCIAL MEDIA script (organic content for TikTok/Reels/Shorts) using the "${framework}" style.\n\nThis is NOT an ad. The goal is maximum watch time, saves, shares, and comments — NOT selling a product.\n- NO product pitch, NO "link in bio", NO sales CTA\n- End with an ENGAGEMENT prompt: a question, challenge, hot take, "comment if...", or cliffhanger that makes people respond\n- Structure for retention: strong hook (first 2 seconds), curiosity loop or escalating value, satisfying payoff\n- Feel like real content a creator would post, not a brand`
    : `Generate a complete video ad script using the "${framework}" framework.`;
  let userPrompt = `${modeInstruction}\n\nTopic${scriptMode === 'ads' ? '/Product' : ''}: ${topic}\n\nTARGET LENGTH: ${targetSecs} seconds (~${wordsLow}-${wordsHigh} words). This is important — write the script body to fit this duration when read aloud at a natural pace.`;
  if (voice) {
    userPrompt += `\n\nVOICE/PERSONA: Write the entire script in this voice and tone:\n${voice}\nMatch the word choice, slang, sentence structure, and energy of this persona. The script should sound like THIS person actually wrote and would say it — not a generic AI voice.`;
  }
  if (rewriteScript) {
    userPrompt += `\n\nREWRITE MODE: Take the following existing script and rewrite it using the "${framework}" ${scriptMode === 'social' ? 'style' : 'framework structure'}. Preserve the best hooks and proof points but restructure the flow to follow the ${scriptMode === 'social' ? 'style' : 'framework'} exactly.\n\nExisting script to rewrite:\n---\n${rewriteScript}\n---`;
  }
  userPrompt += `\n\nOutput the script in the exact format specified in the system prompt. Include 5 hook variations and all ${scriptMode === 'social' ? 'sections' : 'framework sections'}.${scriptMode === 'social' ? ' Use ENGAGEMENT: instead of CTA: for the ending.' : ''}`;
  const fullPrompt = `<system>\n${frameworksDoc}\n</system>\n\n<user>\n${userPrompt}\n</user>`;
  const promptFile = path.join(shared.LOGS_DIR, `scripter-prompt-${Date.now()}.txt`);
  fs.writeFileSync(promptFile, fullPrompt);
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  const escapedPromptFile = shellEscape(promptFile);
  const catCmd = process.platform === 'win32' ? 'type' : 'cat';
  const cmd = `${catCmd} ${escapedPromptFile} | claude -p --dangerously-skip-permissions --output-format text --model sonnet --max-turns 1`;
  console.log(`[Scripter] Generating ${scriptMode}/${framework}/${targetSecs}s script for: "${topic.slice(0, 60)}..."`);
  try {
    const output = execSync(cmd, {
      env: cleanEnv, cwd: shared.BASE_DIR, shell: true, encoding: 'utf-8',
      timeout: 2 * 60 * 1000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    const genTime = Date.now() - startTime;
    console.log(`[Scripter] Script generated in ${genTime}ms`);
    res.json({ ok: true, script: output.trim(), framework, topic, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[Scripter] Generation failed:', err.message);
    const details = err.stdout ? err.stdout.slice(0, 500) : err.message;
    res.status(500).json({ ok: false, error: 'Script generation failed', details });
  } finally {
    try { fs.unlinkSync(promptFile); } catch (_) {}
  }
});

router.post('/scripter/transcribe', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const startTime = Date.now();
  const tmpId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const tmpDir = path.join(shared.WHISPER_CACHE_DIR, tmpId);
  fs.mkdirSync(tmpDir, { recursive: true });
  const audioFile = path.join(tmpDir, 'audio.wav');
  console.log(`[Transcribe] Downloading audio from: ${url.slice(0, 80)}...`);
  const runCmd = (cmd, opts) => new Promise((resolve, reject) => {
    const { exec: execCb } = require('child_process');
    execCb(cmd, opts, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      resolve({ stdout, stderr });
    });
  });
  try {
    await new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', ['-x', '--audio-format', 'wav', '--no-playlist', '-o', audioFile, url], {
        cwd: tmpDir, shell: false, windowsHide: true, timeout: 120 * 1000
      });
      let stderr = '';
      ytdlp.stderr.on('data', d => { stderr += d.toString(); });
      ytdlp.on('close', code => {
        if (code === 0) resolve();
        else { const err = new Error(`yt-dlp exited with code ${code}`); err.stderr = stderr; reject(err); }
      });
      ytdlp.on('error', reject);
    });
    let actualAudio = audioFile;
    if (!fs.existsSync(audioFile)) {
      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.wav'));
      if (files.length > 0) actualAudio = path.join(tmpDir, files[0]);
      else throw new Error('Audio download failed — no .wav file produced');
    }
    const dlTime = Date.now() - startTime;
    console.log(`[Transcribe] Downloaded in ${dlTime}ms, transcribing with faster-whisper...`);
    let transcribeScript = path.join(shared.BASE_DIR, 'transcribe.py');
    if (!fs.existsSync(transcribeScript)) transcribeScript = path.join(shared.APP_DIR, 'transcribe.py');
    const whisperCmd = `python "${transcribeScript}" "${actualAudio}" base`;
    const whisperEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    const { stdout: whisperOut } = await runCmd(whisperCmd, {
      cwd: tmpDir, shell: true, encoding: 'utf-8',
      timeout: 5 * 60 * 1000, windowsHide: true, env: whisperEnv, maxBuffer: 10 * 1024 * 1024
    });
    const result = JSON.parse(whisperOut.trim());
    if (!result.ok) throw new Error(result.error || 'Transcription failed');
    const transcript = result.transcript;
    const totalTime = Date.now() - startTime;
    console.log(`[Transcribe] Done in ${totalTime}ms — ${transcript.length} chars (lang: ${result.language})`);
    res.json({ ok: true, transcript, url, language: result.language, duration_ms: totalTime });
  } catch (err) {
    console.error('[Transcribe] Failed:', err.message?.slice(0, 300));
    const details = err.stderr ? err.stderr.slice(0, 500) : err.message;
    res.status(500).json({ ok: false, error: 'Transcription failed', details });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

module.exports = router;
