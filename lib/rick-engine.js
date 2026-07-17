const crypto = require('crypto');

const STAGES = Object.freeze(['brief', 'ideas', 'script', 'personalize']);
const FUNNELS = Object.freeze(['auto', 'tof', 'mof', 'bof']);
/**
 * The funnel choice, in the words the user sees. The acronym and its meaning
 * always travel together: the acronym alone teaches nothing, and the meaning
 * alone never teaches the vocabulary the course uses.
 */
const FUNNEL_CHOICES = Object.freeze([
  { id: 'tof', label: 'TOF', title: 'Get discovered', blurb: 'Reach new people who do not know you yet' },
  { id: 'mof', label: 'MOF', title: 'Build trust', blurb: 'Win over people who are already interested' },
  { id: 'bof', label: 'BOF', title: 'Get action', blurb: 'Turn warm people into customers' },
  { id: 'auto', label: 'Auto', title: 'Let Rick pick', blurb: 'Rick chooses the stage that fits your brief' },
]);
const MODELS = Object.freeze(['auto', 'claude', 'codex', 'openai']);
// Versions are small (a script is a few KB), so keep enough that a normal
// session never loses v1. Numbers are stable, so if the oldest is ever evicted
// the chips honestly start at v2 rather than silently renumbering.
const SCRIPT_VERSION_LIMIT = 20;
// Sessions written before versioning shipped get their script adopted as v1
// under a fixed id, so the id a client sees always resolves on the server.
const ORIGINAL_VERSION_ID = 'script-version-original';
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
    funnelChoices: Array.isArray(payload.funnelChoices) ? payload.funnelChoices : undefined,
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
    // Null means the user has not chosen yet, which is different from choosing
    // Auto. The funnel decides what the ideas are, so it is asked, not assumed.
    funnel: null,
    model: 'auto',
    brief: { niche: '', audience: '', contentType: '' },
    ideas: [],
    selectedIdea: null,
    script: null,
    scriptVersions: [],
    scriptVersionId: null,
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

function normalizeScriptVersions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((version, index) => {
      const script = copyScript(version?.script);
      if (!script) return null;
      const number = Number(version.number);
      return {
        id: cleanText(version.id, 120) || createId('script-version'),
        number: Number.isInteger(number) && number > 0 ? number : index + 1,
        source: cleanText(version.source, 40) || 'revision',
        script,
        createdAt: cleanText(version.createdAt, 40),
      };
    })
    .filter(Boolean)
    .slice(-SCRIPT_VERSION_LIMIT);
}

/**
 * Adopts the script of a session written before versioning as v1, so an
 * existing draft shows up as v1 straight away instead of appearing only once
 * the user next edits it.
 */
function ensureScriptVersions(session) {
  const versions = normalizeScriptVersions(session?.scriptVersions);
  if (versions.length || !session) {
    if (session) session.scriptVersions = versions;
    return versions;
  }
  const script = copyScript(session.script);
  if (!script) {
    session.scriptVersions = [];
    return session.scriptVersions;
  }
  session.scriptVersions = [{
    id: ORIGINAL_VERSION_ID,
    number: 1,
    source: 'original',
    script,
    createdAt: cleanText(session.updatedAt, 40) || nowIso(),
  }];
  session.scriptVersionId = ORIGINAL_VERSION_ID;
  return session.scriptVersions;
}

/**
 * Appends the session's current script as the newest version and selects it.
 * Nothing is ever removed, so moving between versions stays lossless. An edit
 * made while an older version is selected lands at the end rather than
 * truncating what came after it.
 */
function addScriptVersion(session, source = 'revision') {
  const script = copyScript(session?.script);
  if (!script) throw new Error('Build a script before saving a version');
  const versions = ensureScriptVersions(session);
  const last = versions[versions.length - 1];
  // An unchanged script is not a new version; a v2 that reads exactly like v1
  // is noise in the picker.
  if (last && SCRIPT_SECTIONS.every((section) => last.script[section] === script[section])) {
    session.scriptVersionId = last.id;
    return last;
  }
  const version = {
    id: createId('script-version'),
    number: (last?.number || 0) + 1,
    source: cleanText(source, 40) || 'revision',
    script,
    createdAt: nowIso(),
  };
  session.scriptVersions = [...versions, version].slice(-SCRIPT_VERSION_LIMIT);
  session.scriptVersionId = version.id;
  return version;
}

/**
 * Points the session at an existing version. Non-destructive: every other
 * version survives, so the user can move back and forth freely.
 */
function selectScriptVersion(session, versionId) {
  const versions = ensureScriptVersions(session);
  const wanted = cleanText(versionId, 120);
  const version = versions.find((item) => item.id === wanted);
  if (!version) return null;
  session.script = copyScript(version.script);
  session.scriptVersionId = version.id;
  return version;
}

/**
 * The funnel question's cards for a given session. Auto is earned rather than
 * given: it only appears once a real stage has been chosen at least once, so
 * the first run through always teaches the choice. Earlier sessions are the
 * record of that, so there is no extra state to keep in step.
 */
function funnelChoicesFor(session, earlierSessions = []) {
  const earlier = earlierSessions
    .filter((item) => item && item.id !== session?.id && item.funnel && item.funnel !== 'auto');
  const lastUsed = earlier[0]?.funnel || null;
  return FUNNEL_CHOICES
    .filter((choice) => choice.id !== 'auto' || earlier.length > 0)
    .map((choice) => ({ ...choice, last: choice.id === lastUsed }));
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
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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
  const safe = JSON.parse(JSON.stringify({
    model: 'auto',
    critique: null,
    scriptVersionId: null,
    ...session,
    scriptVersions: normalizeScriptVersions(session?.scriptVersions),
  }));
  // Mutates the copy, never the stored session, so an older draft still reads
  // as v1 in the picker before it is next edited.
  ensureScriptVersions(safe);
  return safe;
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
  FUNNEL_CHOICES,
  funnelChoicesFor,
  MODELS,
  SCRIPT_VERSION_LIMIT,
  STAGES,
  addScriptVersion,
  cleanText,
  createRecordingScenes,
  createMessage,
  createSession,
  ensureScriptVersions,
  isBriefReady,
  publicSession,
  sanitizeBrief,
  selectScriptVersion,
  sessionSummary,
  setFunnel,
  setModel,
  setUpdated,
  validateCriticFeedback,
  validateCritiqueSummary,
  validateIdeas,
  validateRecordingFramings,
  validateRecordingSelection,
  validateScript,
};
