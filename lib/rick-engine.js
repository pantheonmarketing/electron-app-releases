const crypto = require('crypto');

const STAGES = Object.freeze(['brief', 'ideas', 'script', 'personalize']);
const FUNNELS = Object.freeze(['auto', 'tof', 'mof', 'bof']);
const MODELS = Object.freeze(['auto', 'claude', 'codex', 'openai']);
const SCRIPT_HISTORY_LIMIT = 5;
const SCRIPT_SECTIONS = Object.freeze(['hook', 'body', 'conclusion', 'cta', 'caption']);
const RECORDING_SECTIONS = Object.freeze([
  ['hook', 'Hook'],
  ['body', 'Body'],
  ['conclusion', 'Conclusion'],
  ['cta', 'Call to action'],
]);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  const value = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}

function cleanText(value, maxLength = 4000) {
  return typeof value === 'string'
    ? value.replace(/\r\n/g, '\n').trim().slice(0, maxLength)
    : '';
}

function createMessage(role, type, payload = {}) {
  return {
    id: createId('msg'),
    role,
    type,
    text: cleanText(payload.text || '', 12000),
    ideas: Array.isArray(payload.ideas) ? payload.ideas : undefined,
    script: payload.script || undefined,
    createdAt: nowIso(),
  };
}

function createSession() {
  const createdAt = nowIso();
  return {
    id: createId('rick'),
    title: 'New content session',
    stage: 'brief',
    funnel: 'auto',
    model: 'auto',
    brief: { niche: '', audience: '', contentType: '' },
    ideas: [],
    selectedIdea: null,
    script: null,
    scriptHistory: [],
    recording: null,
    critique: null,
    completed: false,
    messages: [createMessage('assistant', 'text', {
      text: 'What are we creating content about who is it for and what kind of short form content do you want to make',
    })],
    createdAt,
    updatedAt: createdAt,
  };
}

function copyScript(script) {
  if (!script || typeof script !== 'object') return null;
  if (SCRIPT_SECTIONS.some((section) => typeof script[section] !== 'string' || !script[section].trim())) {
    return null;
  }
  return Object.fromEntries(SCRIPT_SECTIONS.map((section) => [section, script[section]]));
}

function normalizeScriptHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((version) => {
      const script = copyScript(version?.script);
      if (!script) return null;
      return {
        id: cleanText(version.id, 120),
        source: cleanText(version.source, 40) || 'revision',
        script,
        createdAt: cleanText(version.createdAt, 40),
      };
    })
    .filter(Boolean)
    .slice(-SCRIPT_HISTORY_LIMIT);
}

function storeScriptVersion(session, source = 'revision') {
  const script = copyScript(session?.script);
  if (!script) throw new Error('Build a script before saving a version');
  const history = normalizeScriptHistory(session.scriptHistory);
  const version = {
    id: createId('script-version'),
    source: cleanText(source, 40) || 'revision',
    script,
    createdAt: nowIso(),
  };
  session.scriptHistory = [...history, version].slice(-SCRIPT_HISTORY_LIMIT);
  return version;
}

function restoreLatestScriptVersion(session) {
  const history = normalizeScriptHistory(session?.scriptHistory);
  const version = history.pop();
  if (!version) return null;
  session.script = copyScript(version.script);
  session.scriptHistory = history;
  return version;
}

function sanitizeBrief(value = {}) {
  return {
    niche: cleanText(value.niche, 300),
    audience: cleanText(value.audience, 300),
    contentType: cleanText(value.contentType || value.content_type, 300),
  };
}

function isBriefReady(brief) {
  const safe = sanitizeBrief(brief);
  return Boolean(safe.niche && safe.audience && safe.contentType);
}

function validateIdeas(value) {
  const source = Array.isArray(value) ? value : value?.ideas;
  if (!Array.isArray(source) || source.length !== 10) {
    throw new Error('Rick must return exactly 10 ideas');
  }
  const ideas = source.map((idea) => cleanText(idea, 280)).filter(Boolean);
  if (ideas.length !== 10 || new Set(ideas.map((idea) => idea.toLowerCase())).size !== 10) {
    throw new Error('Rick returned missing or duplicate ideas');
  }
  return ideas;
}

function cleanSpokenText(value) {
  return cleanText(value, 6000)
    .replace(/[.,!?;:()[\]{}"“”]/g, '')
    .replace(/[—–]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function hasProductionDirections(script) {
  const combined = Object.values(script || {}).join(' ').toLowerCase();
  return /\b(camera angle|camera pans?|camera zoom|zoom in|zoom out|b[ -]?roll|cut to|jump cut|shot list|editing note|transition to|text overlay|on[ -]?screen text|film this|visual direction)\b/.test(combined);
}

function validateScript(value = {}) {
  const script = {
    hook: cleanSpokenText(value.hook),
    body: cleanSpokenText(value.body),
    conclusion: cleanSpokenText(value.conclusion),
    cta: cleanSpokenText(value.cta),
    caption: cleanText(value.caption, 1200),
  };
  if (Object.values(script).some((part) => !part)) {
    throw new Error('Rick returned an incomplete script');
  }
  if (hasProductionDirections(script)) {
    throw new Error('Rick returned production directions instead of spoken content');
  }
  return script;
}

function createRecordingScenes(script = {}, maxWords = 42) {
  const limit = Math.max(20, Math.min(80, Number(maxWords) || 42));
  const scenes = [];
  for (const [section, sectionLabel] of RECORDING_SECTIONS) {
    const words = cleanText(script[section], 6000).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!words.length) continue;
    const chunks = [];
    for (let index = 0; index < words.length; index += limit) {
      chunks.push(words.slice(index, index + limit).join(' '));
    }
    chunks.forEach((text, index) => {
      scenes.push({
        id: `${section}-${index + 1}`,
        section,
        label: chunks.length > 1 ? `${sectionLabel} ${index + 1}` : sectionLabel,
        text,
        wordCount: text.split(' ').length,
      });
    });
  }
  if (!scenes.length) throw new Error('Build a script before opening the teleprompter');
  if (scenes.length > 40) throw new Error('This script is too long for one recording session');
  return scenes;
}

function validateRecordingSelection(recordedIndexes, skippedIndexes, sceneCount) {
  const total = Number(sceneCount);
  if (!Number.isInteger(total) || total < 1 || total > 40) {
    throw new Error('Invalid recording scene count');
  }
  const normalize = (value, label) => {
    if (!Array.isArray(value)) throw new Error(`${label} scenes must be a list`);
    const indexes = value.map(Number);
    if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= total)) {
      throw new Error(`${label} scene selection is invalid`);
    }
    if (new Set(indexes).size !== indexes.length) throw new Error(`${label} scenes contain duplicates`);
    if (indexes.some((index, position) => position > 0 && index <= indexes[position - 1])) {
      throw new Error(`${label} scenes must stay in script order`);
    }
    return indexes;
  };
  const recorded = normalize(recordedIndexes, 'Recorded');
  const skipped = normalize(skippedIndexes, 'Skipped');
  if (!recorded.length) throw new Error('Record at least one scene before combining the video');
  if (recorded.some((index) => skipped.includes(index))) {
    throw new Error('A scene cannot be both recorded and skipped');
  }
  if (new Set([...recorded, ...skipped]).size !== total) {
    throw new Error('Record or skip every scene before combining the video');
  }
  return { recordedIndexes: recorded, skippedIndexes: skipped };
}

function validateRecordingFramings(value, recordingCount) {
  const count = Number(recordingCount);
  if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error('Invalid recording count');
  if (!Array.isArray(value) || value.length !== count) {
    throw new Error('Camera framing does not match the recorded scenes');
  }
  const clamp = (number, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(number) || 0));
  return value.map((framing = {}) => ({
    zoom: clamp(framing.zoom || 1, 1, 3),
    x: clamp(framing.x, -1, 1),
    y: clamp(framing.y, -1, 1),
  }));
}

function cleanTextList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function validateCriticFeedback(value = {}) {
  const feedback = {
    verdict: cleanText(value.verdict, 900),
    strengths: cleanTextList(value.strengths, 3, 360),
    improvements: cleanTextList(value.improvements, 4, 420),
  };
  if (!feedback.verdict || !feedback.improvements.length) {
    throw new Error('Rick returned incomplete critic feedback');
  }
  return feedback;
}

function validateCritiqueSummary(value = {}) {
  const summary = {
    summary: cleanText(value.summary, 900),
    improvements: cleanTextList(value.improvements, 5, 420),
    disagreements: cleanTextList(value.disagreements, 3, 520),
  };
  if (!summary.summary || !summary.improvements.length) {
    throw new Error('Rick returned an incomplete critique summary');
  }
  return summary;
}

function setUpdated(session) {
  session.updatedAt = nowIso();
  return session;
}

function setFunnel(session, funnel) {
  const normalized = cleanText(funnel, 12).toLowerCase();
  if (!FUNNELS.includes(normalized)) throw new Error('Invalid funnel stage');
  session.funnel = normalized;
  return setUpdated(session);
}

function setModel(session, model) {
  const normalized = cleanText(model, 12).toLowerCase();
  if (!MODELS.includes(normalized)) throw new Error('Invalid model choice');
  session.model = normalized;
  return setUpdated(session);
}

function publicSession(session) {
  // Sessions saved before the model picker shipped have no model field.
  return JSON.parse(JSON.stringify({
    model: 'auto',
    critique: null,
    ...session,
    scriptHistory: normalizeScriptHistory(session?.scriptHistory),
  }));
}

function sessionSummary(session) {
  return {
    id: session.id,
    title: session.title,
    stage: session.stage,
    funnel: session.funnel,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
  };
}

module.exports = {
  FUNNELS,
  MODELS,
  SCRIPT_HISTORY_LIMIT,
  STAGES,
  cleanText,
  createRecordingScenes,
  createMessage,
  createSession,
  isBriefReady,
  publicSession,
  restoreLatestScriptVersion,
  sanitizeBrief,
  sessionSummary,
  setFunnel,
  setModel,
  setUpdated,
  storeScriptVersion,
  validateCriticFeedback,
  validateCritiqueSummary,
  validateIdeas,
  validateRecordingFramings,
  validateRecordingSelection,
  validateScript,
};
