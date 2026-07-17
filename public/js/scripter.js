/**
 * Rick — guided short-form content consultant.
 * The server owns conversation state; this file renders it without injecting HTML from AI output.
 */

const rickState = {
  initialized: false,
  busy: false,
  activeSession: null,
  sessions: [],
  provider: null,
  models: null,
  // The last AI operation that failed and can be resent as-is. Null whenever
  // there is nothing safe to retry, which is what gates the Retry button.
  lastFailure: null,
  // A typed message is rendered from here immediately while the server is
  // still generating Rick's answer. It is replaced by the saved copy in the
  // returned session, so the conversation never shows it twice.
  pendingMessage: null,
  // Set when the funnel stage changes under an existing script, which makes the
  // script stale for the new stage. Cleared once rewritten or dismissed.
  funnelRewrite: null,
  critiqueChooserSessionId: null,
  criticCount: 3,
  importingScript: false,
  teleprompter: {
    open: false,
    choosingMode: false,
    recordingMode: null,
    sessionId: null,
    scriptVersionId: null,
    scriptVersions: [],
    scenes: [],
    clips: [],
    skipped: [],
    activeIndex: 0,
    editingSceneIndex: null,
    stream: null,
    recorder: null,
    chunks: [],
    startedAt: 0,
    timerId: null,
    audioContext: null,
    audioFrame: null,
    frameTimerId: null,
    framingDrag: null,
    framing: { zoom: 1, x: 0, y: 0 },
    scriptPanel: null,
    scriptPanelInteraction: null,
    scriptPanelLayoutFrame: null,
    scriptPanelResizeHandler: null,
    mediaRequest: 0,
    cameraId: null,
    microphoneId: null,
    switchingDevices: false,
    switchingVersion: false,
    switchingLayout: false,
    switchingPromptStyle: false,
    sceneLayout: 'standard',
    promptStyle: 'script',
    talkingPoints: null,
    takePreviewReady: false,
    countdownActive: false,
    countdownRemaining: 0,
    countdownTimerId: null,
    scrollFrameId: null,
    scrollLastFrameAt: 0,
    scrollProgress: 0,
    scrollPaused: false,
    scrollEndHoldId: null,
    continuousPreferences: {
      wpm: 130,
      fontSize: 42,
      lineHeight: 1.5,
      opacity: 0.75,
      mirror: false,
      focusGuide: true,
      countdown: 3,
      autoStop: true,
    },
    combining: false,
    output: null,
    outputReady: false,
  },
};

const RICK_STAGE_ORDER = ['brief', 'ideas', 'script', 'personalize', 'record'];
const RICK_FUNNEL_LABELS = {
  auto: 'Auto',
  tof: 'TOF',
  mof: 'MOF',
  bof: 'BOF',
};
const RICK_FUNNEL_INTENT = {
  auto: 'whichever stage fits the brief best',
  tof: 'getting discovered by new people',
  mof: 'building trust with interested viewers',
  bof: 'driving one clear action',
};
const RICK_SCRIPT_SECTIONS = [
  ['hook', 'Hook'],
  ['body', 'Body'],
  ['conclusion', 'Conclusion'],
  ['cta', 'Call to action'],
  ['caption', 'Caption'],
];
const RICK_DURATION_PRESETS = Object.freeze({
  short: Object.freeze({ id: 'short', label: 'Super short', seconds: 20, minWords: 40, maxWords: 50 }),
  standard: Object.freeze({ id: 'standard', label: 'Standard reel', seconds: 40, minWords: 80, maxWords: 100 }),
  full: Object.freeze({ id: 'full', label: 'Full reel', seconds: 60, minWords: 120, maxWords: 140 }),
  long: Object.freeze({ id: 'long', label: 'Long-form', seconds: 90, minWords: 160, maxWords: 220 }),
});

async function rickRequest(path, options = {}) {
  let response;
  try {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = { ...(options.headers || {}) };
    if (!isFormData && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    response = await fetch(`/api/scripter${path}`, {
      ...options,
      headers,
    });
  } catch (_) {
    // The request never reached the server, so nothing was started and resending is safe.
    throw rickError('Could not reach the task manager server. Check it is running then retry.', true);
  }
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    if (data.error === 'upgrade_required' && typeof showTierModal === 'function') showTierModal();
    throw rickError(
      data.message || data.error || `Request failed with ${response.status}`,
      data.retryable === true,
    );
  }
  return data;
}

function rickError(message, retryable) {
  const error = new Error(message);
  error.retryable = Boolean(retryable);
  return error;
}

function rickEl(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function rickFormatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function scrInit() {
  if (rickState.initialized) {
    scrRefreshProvider();
    return;
  }
  rickState.initialized = true;
  const composer = document.getElementById('rickComposer');
  if (!composer) return;
  try {
    const [status, list] = await Promise.all([
      rickRequest('/status'),
      rickRequest('/sessions'),
    ]);
    rickState.provider = status;
    rickState.sessions = list.sessions || [];
    scrRenderProvider();
    scrRenderSessions();
    const rememberedId = localStorage.getItem('rick_active_session_id');
    const initial = rickState.sessions.find((session) => session.id === rememberedId) || rickState.sessions[0];
    if (initial) await scrOpenSession(initial.id);
    else await scrNewSession();
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#rickModel')) scrCloseModelMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        scrCloseModelMenu();
        if (!document.getElementById('rickScriptImporter')?.hidden) scrCloseScriptImporter();
        else if (rickState.teleprompter.countdownActive) scrCancelContinuousCountdown();
        else if (rickState.teleprompter.open) scrCloseTeleprompter();
      }
      scrHandleContinuousShortcut(event);
    });
    document.addEventListener('visibilitychange', () => {
      const state = rickState.teleprompter;
      if (document.hidden && state.open && state.recordingMode === 'continuous' && state.recorder?.state === 'recording') {
        state.scrollPaused = true;
        state.scrollLastFrameAt = 0;
        scrRenderTeleprompter();
      }
    });
    await scrRefreshModels();
  } catch (error) {
    scrShowError(error.message);
  }
}

async function scrRefreshProvider() {
  try {
    rickState.provider = await rickRequest('/status');
    scrRenderProvider();
  } catch (_) {}
}

/**
 * The catalog is re-fetched per session because availability is detected live
 * and the Automatic blurb names whichever worker is currently set up.
 */
async function scrRefreshModels() {
  const id = rickState.activeSession?.id;
  try {
    rickState.models = await rickRequest(`/models${id ? `?sessionId=${encodeURIComponent(id)}` : ''}`);
    scrRenderModel();
  } catch (_) {}
}

function scrRenderModel() {
  const button = document.getElementById('rickModelCurrent');
  const menu = document.getElementById('rickModelMenu');
  if (!button || !menu) return;
  const catalog = rickState.models;
  if (!catalog) return;
  // The session is the source of truth; the catalog can lag a session switch.
  const selectedId = rickState.activeSession?.model || catalog.selected || 'auto';
  const selected = catalog.options.find((option) => option.id === selectedId);
  button.textContent = selected ? selected.label : 'Automatic';

  menu.replaceChildren();
  menu.append(rickEl('p', 'rick-model-lead', 'Choose which AI writes your script. You can change this any time.'));
  catalog.options.forEach((option) => {
    const item = rickEl('button', 'rick-model-option');
    item.type = 'button';
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', option.id === selectedId ? 'true' : 'false');
    if (option.id === selectedId) item.classList.add('selected');
    if (!option.available) item.classList.add('unavailable');

    const head = rickEl('span', 'rick-model-option-head');
    head.append(rickEl('strong', '', option.label));
    if (option.tagline) {
      const badge = rickEl('span', 'rick-model-badge', option.tagline);
      if (option.recommended) badge.classList.add('is-recommended');
      head.append(badge);
    }
    item.append(head);
    item.append(rickEl('span', 'rick-model-blurb', option.available ? option.blurb : option.setupHint));

    if (option.available) {
      item.addEventListener('click', () => scrSetModel(option.id));
    } else {
      item.disabled = true;
      item.title = option.setupHint;
    }
    menu.append(item);
  });

  // Surface the fallback so a picked-then-uninstalled worker is never silent.
  if (selectedId !== 'auto' && catalog.resolved && catalog.resolved !== selectedId) {
    menu.append(rickEl('p', 'rick-model-note', `${selected ? selected.label : 'That choice'} is not set up right now, so Rick is using ${catalog.resolvedLabel}.`));
  }
}

function scrToggleModelMenu(event) {
  event?.stopPropagation();
  const wrap = document.getElementById('rickModel');
  const button = document.getElementById('rickModelBtn');
  if (!wrap || !button) return;
  const open = wrap.classList.toggle('open');
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) scrRefreshModels();
}

function scrCloseModelMenu() {
  document.getElementById('rickModel')?.classList.remove('open');
  document.getElementById('rickModelBtn')?.setAttribute('aria-expanded', 'false');
}

async function scrSetModel(model) {
  const session = rickState.activeSession;
  // Mid-request switching is blocked so the in-flight turn cannot save over the choice.
  if (!session || rickState.busy || session.model === model) {
    scrCloseModelMenu();
    return;
  }
  scrCloseModelMenu();
  try {
    const data = await rickRequest(`/sessions/${encodeURIComponent(session.id)}/model`, {
      method: 'PATCH',
      body: JSON.stringify({ model }),
    });
    rickState.activeSession = data.session;
    rickState.models = data.models;
    scrRenderModel();
  } catch (error) {
    scrShowError(error.message);
  }
}

function scrRenderProvider() {
  const status = document.getElementById('rickProviderStatus');
  const label = document.getElementById('rickProviderLabel');
  if (!status || !label) return;
  const ready = Boolean(rickState.provider?.ready);
  status.classList.toggle('offline', !ready);
  label.textContent = rickState.provider?.label || 'Connect an AI provider';
  document.getElementById('rickLiveDot')?.classList.toggle('offline', !ready);
}

async function scrRefreshSessions() {
  const data = await rickRequest('/sessions');
  rickState.sessions = data.sessions || [];
  scrRenderSessions();
}

function scrRenderSessions() {
  const list = document.getElementById('rickSessionList');
  if (!list) return;
  list.replaceChildren();
  if (!rickState.sessions.length) {
    list.append(rickEl('div', 'rick-session-empty', 'Your content sessions will live here'));
    return;
  }
  rickState.sessions.forEach((session) => {
    const button = rickEl('button', 'rick-session-item');
    button.type = 'button';
    if (session.id === rickState.activeSession?.id) button.classList.add('active');
    button.addEventListener('click', () => scrOpenSession(session.id));
    button.append(rickEl('strong', '', session.title || 'New content session'));
    const stageLabel = session.stage === 'personalize' ? 'Script ready' : `${session.stage.charAt(0).toUpperCase()}${session.stage.slice(1)}`;
    button.append(rickEl('small', '', `${stageLabel} · ${rickFormatDate(session.updatedAt)}`));
    const remove = rickEl('span', 'rick-session-delete', '×');
    remove.title = 'Delete session';
    remove.setAttribute('role', 'button');
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      scrDeleteSession(session.id);
    });
    button.append(remove);
    list.append(button);
  });
}

async function scrOpenSession(id) {
  if (rickState.busy) return;
  scrClearError();
  rickState.pendingMessage = null;
  rickState.funnelRewrite = null;
  try {
    const data = await rickRequest(`/sessions/${encodeURIComponent(id)}`);
    if (rickState.teleprompter.sessionId && rickState.teleprompter.sessionId !== id) scrResetTeleprompter();
    rickState.activeSession = data.session;
    localStorage.setItem('rick_active_session_id', id);
    scrRender();
    scrCloseSessions();
  } catch (error) {
    scrShowError(error.message);
  }
}

async function scrNewSession() {
  if (rickState.busy) return;
  scrClearError();
  rickState.pendingMessage = null;
  rickState.funnelRewrite = null;
  scrSetBusy(true, 'Starting a fresh session');
  try {
    const data = await rickRequest('/sessions', { method: 'POST', body: '{}' });
    scrResetTeleprompter();
    rickState.activeSession = data.session;
    localStorage.setItem('rick_active_session_id', data.session.id);
    await scrRefreshSessions();
    scrRender();
    scrCloseSessions();
    setTimeout(() => document.getElementById('rickComposer')?.focus(), 60);
  } catch (error) {
    scrShowError(error.message);
  } finally {
    scrSetBusy(false);
  }
}

function scrSetScriptImportError(message = '') {
  const error = document.getElementById('rickScriptImportError');
  if (!error) return;
  error.textContent = message;
  error.classList.toggle('visible', Boolean(message));
}

function scrOpenScriptImporter(text) {
  const importer = document.getElementById('rickScriptImporter');
  const input = document.getElementById('rickScriptImportText');
  const name = document.getElementById('rickScriptImportName');
  if (!importer || !input || !name || rickState.importingScript) return;
  const imported = typeof text === 'string' ? text : rickState.activeSession?.script?.importedText || '';
  input.value = imported;
  name.value = imported ? rickState.activeSession?.title || '' : '';
  const file = document.getElementById('rickScriptFile');
  if (file) file.value = '';
  importer.hidden = false;
  scrSetScriptImportError();
  scrUpdateScriptImportState();
  requestAnimationFrame(() => (imported ? input : name).focus());
}

function scrCloseScriptImporter(event) {
  if (event && event.target !== event.currentTarget) return;
  if (rickState.importingScript) return;
  const importer = document.getElementById('rickScriptImporter');
  if (importer) importer.hidden = true;
  document.getElementById('rickScriptDropzone')?.classList.remove('dragging');
}

function scrUpdateScriptImportState() {
  const text = document.getElementById('rickScriptImportText')?.value || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const count = document.getElementById('rickScriptImportCount');
  const action = document.getElementById('rickUseImportedScript');
  const valid = Boolean(text.trim()) && text.length <= 24000 && words <= 3200;
  if (count) count.textContent = `${words.toLocaleString()} words · ${text.length.toLocaleString()} characters`;
  if (action) action.disabled = !valid || rickState.importingScript;
  return { text, words, valid };
}

function scrHandleScriptImportDrag(event) {
  event.preventDefault();
  if (rickState.importingScript) return;
  document.getElementById('rickScriptDropzone')?.classList.toggle('dragging', event.type === 'dragover');
}

function scrHandleScriptImportDrop(event) {
  event.preventDefault();
  document.getElementById('rickScriptDropzone')?.classList.remove('dragging');
  if (rickState.importingScript) return;
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length !== 1) {
    scrSetScriptImportError('Drop one .txt or .md file at a time');
    return;
  }
  scrLoadScriptFile(files[0]);
}

async function scrLoadScriptFile(file) {
  if (!file || rickState.importingScript) return;
  const extension = String(file.name || '').toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!['.txt', '.md'].includes(extension)) {
    scrSetScriptImportError('Choose a plain-text .txt or .md file');
    return;
  }
  if (file.size > 256000) {
    scrSetScriptImportError('That file is too large. Keep the script under 256 KB');
    return;
  }
  try {
    const text = await file.text();
    if (text.length > 24000) {
      scrSetScriptImportError('Keep imported scripts under 24,000 characters');
      return;
    }
    const input = document.getElementById('rickScriptImportText');
    const name = document.getElementById('rickScriptImportName');
    if (input) input.value = text;
    if (name && !name.value.trim()) name.value = file.name.replace(/\.(txt|md)$/i, '').slice(0, 80);
    scrSetScriptImportError();
    scrUpdateScriptImportState();
  } catch (_) {
    scrSetScriptImportError('Rick could not read that file. Try saving it as UTF-8 text');
  }
}

async function scrPasteScriptFromClipboard() {
  if (rickState.importingScript) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) throw new Error('empty');
    const input = document.getElementById('rickScriptImportText');
    if (input) input.value = text.slice(0, 24000);
    scrSetScriptImportError(text.length > 24000 ? 'Only the first 24,000 characters were pasted' : '');
    scrUpdateScriptImportState();
  } catch (_) {
    scrSetScriptImportError('Clipboard access was unavailable. Paste into the text box instead');
    document.getElementById('rickScriptImportText')?.focus();
  }
}

async function scrImportScript() {
  const session = rickState.activeSession;
  const state = scrUpdateScriptImportState();
  if (!session || !state.valid || rickState.importingScript) return;
  const currentText = session.script?.importedText || '';
  if (session.script && currentText !== state.text.trim() && !window.confirm('Use this imported script? Your current script stays available in version history.')) return;
  rickState.importingScript = true;
  scrSetScriptImportError();
  scrUpdateScriptImportState();
  const action = document.getElementById('rickUseImportedScript');
  if (action) action.textContent = 'Loading script...';
  try {
    const data = await rickRequest(`/sessions/${encodeURIComponent(session.id)}/import-script`, {
      method: 'POST',
      body: JSON.stringify({
        text: state.text,
        title: document.getElementById('rickScriptImportName')?.value || '',
      }),
    });
    scrResetTeleprompter();
    rickState.activeSession = data.session;
    await scrRefreshSessions();
    rickState.importingScript = false;
    scrCloseScriptImporter();
    scrRender();
    if (typeof showToast === 'function') showToast('Your script is ready to record', 'success');
    await scrOpenTeleprompter();
  } catch (error) {
    rickState.importingScript = false;
    scrSetScriptImportError(error.message);
  } finally {
    if (action) action.textContent = 'Use this script';
    scrUpdateScriptImportState();
  }
}

async function scrDeleteSession(id) {
  if (rickState.busy || !confirm('Delete this Rick session?')) return;
  try {
    await rickRequest(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const deletingActive = rickState.activeSession?.id === id;
    await scrRefreshSessions();
    if (deletingActive) {
      scrResetTeleprompter();
      rickState.activeSession = null;
      const next = rickState.sessions[0];
      if (next) await scrOpenSession(next.id);
      else await scrNewSession();
    }
  } catch (error) {
    scrShowError(error.message);
  }
}

function scrRender() {
  const session = rickState.activeSession;
  if (!session) return;
  scrRenderProgress();
  scrRenderFunnel();
  scrRenderModel();
  scrRenderContext();
  scrRenderDurationControls();
  scrRenderMessages();
  scrRenderScript();
  scrRenderComposer();
  scrRenderSessions();
}

function scrRenderProgress() {
  const session = rickState.activeSession;
  if (!session) return;
  const stage = rickState.teleprompter.open ? 'record' : session.stage;
  const activeIndex = Math.max(0, RICK_STAGE_ORDER.indexOf(stage));
  const steps = Array.from(document.querySelectorAll('#rickProgress .rick-progress-step'));
  const lines = Array.from(document.querySelectorAll('#rickProgress .rick-progress-line'));
  steps.forEach((step, index) => {
    step.classList.toggle('active', index === activeIndex);
    step.classList.toggle('complete', index < activeIndex);
    const circle = step.querySelector('span');
    if (circle) circle.textContent = index < activeIndex ? '✓' : String(index + 1);
  });
  lines.forEach((line, index) => line.classList.toggle('complete', index < activeIndex));
}

/**
 * The header is where the chosen stage is shown and changed, not where it is
 * decided. Until the funnel question has been answered in the conversation
 * there is nothing to change, and a live Auto button here would be a way to
 * skip the choice without ever making it.
 */
function scrRenderFunnel() {
  const session = rickState.activeSession;
  const control = document.getElementById('rickFunnel');
  if (!control) return;
  const chosen = Boolean(session.funnel);
  control.classList.toggle('unchosen', !chosen);
  control.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.funnel === session.funnel);
    button.disabled = rickState.busy || !chosen;
    button.title = chosen ? '' : 'Rick asks this once your brief is done';
  });
}

function scrRenderContext() {
  const strip = document.getElementById('rickContextStrip');
  const brief = rickState.activeSession?.brief || {};
  strip.replaceChildren();
  const entries = [
    ['Topic', brief.niche],
    ['Audience', brief.audience],
    ['Format', brief.contentType],
  ].filter((entry) => entry[1]);
  strip.classList.toggle('visible', entries.length > 0);
  entries.forEach(([label, value]) => {
    const pill = rickEl('span', 'rick-context-pill');
    const strong = rickEl('strong', '', `${label}: `);
    pill.append(strong, document.createTextNode(value));
    strip.append(pill);
  });
}

function scrRenderMessages() {
  const container = document.getElementById('rickMessages');
  const session = rickState.activeSession;
  container.replaceChildren();
  const messages = [...session.messages];
  if (rickState.pendingMessage?.sessionId === session.id) {
    messages.push({ role: 'user', text: rickState.pendingMessage.text, pending: true });
  }
  messages.forEach((message) => {
    const row = rickEl('article', `rick-message ${message.role}`);
    if (message.pending) {
      row.classList.add('pending');
      row.dataset.rickPendingMessage = 'true';
    }
    if (message.role === 'assistant') row.append(rickEl('div', 'rick-message-avatar', 'R'));
    const content = rickEl('div', 'rick-message-content');
    if (message.role === 'assistant') content.append(rickEl('div', 'rick-message-name', 'Rick'));
    if (message.text) content.append(rickEl('div', 'rick-message-text', message.text));
    if (message.type === 'ideas' && Array.isArray(message.ideas)) {
      content.append(scrCreateIdeas(message.ideas));
    }
    if (message.type === 'funnel' && Array.isArray(message.funnelChoices)) {
      content.append(scrCreateFunnelChoices(message.funnelChoices));
    }
    if (message.type === 'script') {
      content.append(rickEl('div', 'rick-inline-script', 'The latest draft is open in the script panel'));
    }
    row.append(content);
    container.append(row);
  });
  requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}

/**
 * The funnel question, answered in the conversation rather than from a toggle
 * in the header. The acronym and its meaning sit on the same card so the
 * vocabulary is learned by using it, not looked up.
 */
function scrCreateFunnelChoices(choices) {
  const session = rickState.activeSession;
  const grid = rickEl('div', 'rick-funnel-choices');
  choices.forEach((choice) => {
    const card = rickEl('button', 'rick-funnel-choice');
    card.type = 'button';
    card.dataset.funnelChoice = choice.id;
    card.disabled = rickState.busy;
    // Answered choices stay on screen as a record of the decision.
    const answered = Boolean(session?.funnel);
    card.classList.toggle('chosen', answered && session.funnel === choice.id);
    card.classList.toggle('spent', answered && session.funnel !== choice.id);
    card.setAttribute('aria-label', `${choice.label}: ${choice.title}. ${choice.blurb}`);

    const head = rickEl('span', 'rick-funnel-choice-head');
    head.append(rickEl('strong', '', choice.label));
    head.append(rickEl('span', 'rick-funnel-choice-title', choice.title));
    if (choice.last) head.append(rickEl('span', 'rick-funnel-choice-last', 'Last time'));
    card.append(head, rickEl('span', 'rick-funnel-choice-blurb', choice.blurb));
    card.addEventListener('click', () => scrChooseFunnel(choice.id));
    grid.append(card);
  });
  return grid;
}

async function scrChooseFunnel(funnel) {
  const session = rickState.activeSession;
  if (!session || rickState.busy || session.funnel) return;
  await scrRunOperation({ kind: 'funnelChoice', sessionId: session.id, payload: { funnel } });
}

function scrCreateIdeas(ideas) {
  const grid = rickEl('div', 'rick-ideas-grid');
  ideas.forEach((idea, index) => {
    const card = rickEl('button', 'rick-idea-card');
    card.type = 'button';
    card.disabled = rickState.busy;
    card.setAttribute('aria-label', `Build idea ${index + 1}: ${idea}`);
    card.addEventListener('click', () => scrBuildIdea(index));
    card.append(rickEl('span', 'rick-idea-number', index + 1));
    card.append(rickEl('span', 'rick-idea-text', idea));
    card.append(rickEl('span', 'rick-idea-action', 'Build →'));
    grid.append(card);
  });
  return grid;
}

const RICK_VERSION_SOURCES = {
  original: 'the first draft',
  rebuild: 'built from another idea',
  personalized: 'your personal experience',
  revision: 'a revision',
  critique: 'critique improvements',
  imported: 'your imported script',
  duration: 'timed for your target',
};

/**
 * Version chips live in the panel header rather than the scrolling body so they
 * stay reachable while reading a long script. Built here instead of in
 * index.html to keep the markup owned by whoever renders it.
 */
function scrRenderScriptVersions(session) {
  const head = document.querySelector('.rick-script-head');
  if (!head) return;
  let strip = head.querySelector('[data-rick-versions]');
  const versions = session.scriptVersions || [];
  // Show v1 immediately. Besides making versioning discoverable, this makes
  // it unambiguous which wording is open before the first revision creates v2.
  if (!versions.length) {
    strip?.remove();
    return;
  }
  if (!strip) {
    strip = rickEl('div', 'rick-versions');
    strip.dataset.rickVersions = 'true';
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Script versions');
    head.insertBefore(strip, head.querySelector('.rick-copy-all'));
  }
  strip.replaceChildren();
  versions.forEach((version) => {
    const current = version.id === session.scriptVersionId;
    const chip = rickEl('button', 'rick-version-chip', `v${version.number}`);
    chip.type = 'button';
    chip.disabled = rickState.busy;
    chip.classList.toggle('active', current);
    chip.setAttribute('aria-pressed', current ? 'true' : 'false');
    const from = RICK_VERSION_SOURCES[version.source] || version.source;
    chip.title = current ? `v${version.number}, showing now (${from})` : `Open v${version.number} (${from})`;
    chip.addEventListener('click', () => scrSelectScriptVersion(version.id));
    strip.append(chip);
  });
}

function scrRenderScript() {
  const session = rickState.activeSession;
  const workspace = document.getElementById('rickWorkspace');
  const content = document.getElementById('rickScriptContent');
  workspace.classList.toggle('has-script', Boolean(session.script));
  workspace.classList.toggle('has-imported-script', Boolean(session.script?.importedText));
  content.replaceChildren();
  scrRenderCritiqueTrigger(session);
  scrRenderScriptVersions(session);
  if (!session.script) return;
  if (session.script.importedText) {
    const section = rickEl('section', 'rick-script-section imported');
    const head = rickEl('div', 'rick-script-section-head');
    head.append(rickEl('h3', '', 'Imported script'));
    const edit = rickEl('button', '', 'Edit text');
    edit.type = 'button';
    edit.disabled = rickState.busy;
    edit.addEventListener('click', () => scrOpenScriptImporter(session.script.importedText));
    head.append(edit);
    section.append(head, rickEl('p', '', session.script.importedText));
    content.append(section);
    return;
  }
  if (rickState.funnelRewrite?.sessionId === session.id) {
    content.append(scrCreateFunnelRewrite(rickState.funnelRewrite.funnel));
  }
  if (session.critique || rickState.critiqueChooserSessionId === session.id) {
    content.append(scrCreateCritiquePanel(session));
  }
  RICK_SCRIPT_SECTIONS.forEach(([key, label]) => {
    const section = rickEl('section', `rick-script-section ${key === 'caption' ? 'caption' : ''}`);
    const head = rickEl('div', 'rick-script-section-head');
    head.append(rickEl('h3', '', label));
    const regenerate = rickEl('button', '', 'Regenerate');
    regenerate.type = 'button';
    regenerate.disabled = rickState.busy;
    regenerate.addEventListener('click', () => scrRegenerateSection(key));
    head.append(regenerate);
    section.append(head, rickEl('p', '', session.script[key] || ''));
    content.append(section);
  });
}

function scrRenderCritiqueTrigger(session) {
  const footer = document.querySelector('.rick-script-footer');
  if (!footer) return;
  let trigger = footer.querySelector('[data-rick-critique-trigger]');
  if (!session.script || session.script.importedText) {
    trigger?.remove();
    return;
  }
  if (!trigger) {
    trigger = rickEl('button', 'rick-critique-trigger', 'Ask for Critique');
    trigger.type = 'button';
    trigger.dataset.rickCritiqueTrigger = 'true';
    trigger.addEventListener('click', scrAskForCritique);
    footer.insertBefore(trigger, footer.firstElementChild);
  }
  trigger.disabled = rickState.busy;
  trigger.textContent = session.critique ? 'Critique again' : 'Ask for Critique';
}

function scrCreateCritiquePanel(session) {
  if (!session.critique || rickState.critiqueChooserSessionId === session.id) {
    return scrCreateCritiqueChooser(session);
  }
  return scrCreateCritiqueResults(session);
}

function scrCreateCritiqueChooser(session) {
  const panel = rickEl('section', 'rick-critique-panel chooser');
  const head = rickEl('div', 'rick-critique-head');
  const title = rickEl('div');
  title.append(rickEl('strong', '', 'Script critique'));
  title.append(rickEl('span', '', 'Choose how many independent perspectives you want'));
  const close = rickEl('button', 'rick-critique-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close critique');
  close.addEventListener('click', () => {
    rickState.critiqueChooserSessionId = null;
    scrRenderScript();
  });
  head.append(title, close);

  const choices = rickEl('div', 'rick-critic-choices');
  [1, 2, 3].forEach((count) => {
    const button = rickEl('button', count === rickState.criticCount ? 'active' : '', count === 1 ? '1 critic' : `${count} critics`);
    button.type = 'button';
    button.disabled = rickState.busy;
    button.setAttribute('aria-pressed', count === rickState.criticCount ? 'true' : 'false');
    button.addEventListener('click', () => {
      rickState.criticCount = count;
      rickState.critiqueChooserSessionId = session.id;
      scrRenderScript();
    });
    choices.append(button);
  });

  const note = rickEl('p', 'rick-critique-note', 'Each critic reviews the same script independently before Rick compares their feedback');
  const action = rickEl('button', 'rick-critique-request', `Ask ${rickState.criticCount} ${rickState.criticCount === 1 ? 'critic' : 'critics'}`);
  action.type = 'button';
  action.disabled = rickState.busy;
  action.addEventListener('click', scrRequestCritique);
  panel.append(head, choices, note, action);
  return panel;
}

function scrCreateCritiqueResults(session) {
  const critique = session.critique;
  const panel = rickEl('section', `rick-critique-panel results${critique.applied ? ' applied' : ''}`);
  const head = rickEl('div', 'rick-critique-head');
  const title = rickEl('div');
  title.append(rickEl('strong', '', 'Script critique'));
  title.append(rickEl('span', '', critique.applied ? 'Improvements applied to the script' : `${critique.criticCount} independent ${critique.criticCount === 1 ? 'review' : 'reviews'} compared`));
  head.append(title);
  if (critique.applied) head.append(rickEl('span', 'rick-critique-applied', 'Applied'));
  panel.append(head);

  const critics = rickEl('div', 'rick-critic-grid');
  (critique.critics || []).forEach((critic) => {
    const card = rickEl('article', 'rick-critic-card');
    const cardHead = rickEl('div', 'rick-critic-card-head');
    cardHead.append(rickEl('strong', '', critic.name));
    cardHead.append(rickEl('span', '', critic.focus));
    card.append(cardHead, rickEl('p', 'rick-critic-verdict', critic.verdict));
    const points = rickEl('ul', 'rick-critic-points');
    (critic.improvements || []).forEach((item) => points.append(rickEl('li', '', item)));
    card.append(points);
    critics.append(card);
  });
  panel.append(critics);

  const merged = rickEl('div', 'rick-critique-merged');
  merged.append(rickEl('div', 'rick-critique-label', 'Rick’s merged read'));
  merged.append(rickEl('p', 'rick-critique-summary', critique.summary));
  merged.append(rickEl('div', 'rick-critique-label', 'Prioritized improvements'));
  const improvements = rickEl('ol', 'rick-critique-improvements');
  (critique.improvements || []).forEach((item) => improvements.append(rickEl('li', '', item)));
  merged.append(improvements);
  panel.append(merged);

  if (Array.isArray(critique.disagreements) && critique.disagreements.length) {
    const conflicts = rickEl('div', 'rick-critique-conflicts');
    conflicts.append(rickEl('div', 'rick-critique-label', 'Where critics disagree'));
    const list = rickEl('ul');
    critique.disagreements.forEach((item) => list.append(rickEl('li', '', item)));
    conflicts.append(list);
    panel.append(conflicts);
  }

  const actions = rickEl('div', 'rick-critique-actions');
  if (!critique.applied) {
    const apply = rickEl('button', 'primary', `Apply ${critique.improvements?.length || ''} improvements`.replace('  ', ' '));
    apply.type = 'button';
    apply.disabled = rickState.busy;
    apply.addEventListener('click', scrApplyCritique);
    actions.append(apply);
  }
  // Going back to the pre-critique wording is the version picker's job now, so
  // there is no separate restore action to keep in step.
  const skip = rickEl('button', '', critique.applied ? 'Done' : 'Skip');
  skip.type = 'button';
  skip.disabled = rickState.busy;
  skip.addEventListener('click', scrSkipCritique);
  actions.append(skip);
  panel.append(actions);
  return panel;
}

/**
 * Shown when the stage changed under a finished script. The rewrite is offered
 * rather than automatic because it costs a turn and replaces the user's draft.
 */
function scrCreateFunnelRewrite(funnel) {
  const label = RICK_FUNNEL_LABELS[funnel] || funnel;
  const panel = rickEl('section', 'rick-funnel-rewrite');
  panel.append(rickEl('strong', '', `Now aiming at ${label}`));
  panel.append(rickEl('p', '', `This script was written for the previous stage. Rewriting focuses it on ${RICK_FUNNEL_INTENT[funnel] || label} and keeps your topic and any personal experience.`));
  const actions = rickEl('div', 'rick-funnel-rewrite-actions');
  const rewrite = rickEl('button', 'primary', `Rewrite for ${label}`);
  rewrite.type = 'button';
  rewrite.disabled = rickState.busy;
  rewrite.addEventListener('click', scrRewriteForFunnel);
  const keep = rickEl('button', '', 'Keep as is');
  keep.type = 'button';
  keep.disabled = rickState.busy;
  keep.addEventListener('click', () => {
    rickState.funnelRewrite = null;
    scrRenderScript();
  });
  actions.append(rewrite, keep);
  panel.append(actions);
  return panel;
}

async function scrRewriteForFunnel() {
  const session = rickState.activeSession;
  const pending = rickState.funnelRewrite;
  if (!session?.script || !pending || pending.sessionId !== session.id || rickState.busy) return;
  const label = RICK_FUNNEL_LABELS[pending.funnel] || pending.funnel;
  const intent = RICK_FUNNEL_INTENT[pending.funnel] || label;
  await scrRunOperation({
    kind: 'refunnel',
    sessionId: session.id,
    payload: {
      funnel: pending.funnel,
      instruction: `Rewrite the whole script for the ${label} funnel stage so it focuses on ${intent}. Keep the topic and any personal experience the user shared and adapt the framing and the call to action to that stage.`,
    },
  });
}

function scrRenderComposer() {
  const session = rickState.activeSession;
  const composer = document.getElementById('rickComposer');
  const hint = document.getElementById('rickComposerHint');
  if (session.stage === 'brief') {
    composer.placeholder = 'Tell Rick the topic audience and kind of content...';
    hint.textContent = session.funnel === 'auto'
      ? 'Rick needs your niche audience and content type · Funnel is on Auto, or pick a stage above'
      : `Rick needs your niche audience and content type · Aiming at ${RICK_FUNNEL_LABELS[session.funnel]} for ${RICK_FUNNEL_INTENT[session.funnel]}`;
  } else if (session.stage === 'ideas') {
    composer.placeholder = 'Ask for a new angle or add a constraint...';
    hint.textContent = 'Choose an idea above or ask Rick for a fresh batch';
  } else {
    composer.placeholder = 'Share a personal experience or ask for a revision...';
    hint.textContent = 'A real experience can make this script uniquely yours';
  }
  composer.disabled = rickState.busy;
  document.getElementById('rickSendBtn').disabled = rickState.busy;
}

function scrOperationRequest(operation) {
  const base = `/sessions/${encodeURIComponent(operation.sessionId)}`;
  if (operation.kind === 'message') return { path: `${base}/message`, body: { message: operation.payload.message } };
  if (operation.kind === 'build') return { path: `${base}/build`, body: { ideaIndex: operation.payload.ideaIndex, targetDuration: operation.payload.targetDuration } };
  if (operation.kind === 'durationResize') return {
    path: `${base}/revise`,
    body: { section: '', instruction: operation.payload.instruction, targetDuration: operation.payload.targetDuration },
  };
  if (operation.kind === 'refunnel') return { path: `${base}/revise`, body: { section: '', instruction: operation.payload.instruction } };
  if (operation.kind === 'critique') return { path: `${base}/critique`, body: { criticCount: operation.payload.criticCount } };
  if (operation.kind === 'critiqueApply') return { path: `${base}/critique/apply`, body: {} };
  if (operation.kind === 'critiqueSkip') return { path: `${base}/critique/skip`, body: {} };
  if (operation.kind === 'scriptVersion') return { path: `${base}/script/version`, body: { versionId: operation.payload.versionId } };
  if (operation.kind === 'funnelChoice') return { path: `${base}/funnel/choose`, body: { funnel: operation.payload.funnel } };
  return {
    path: `${base}/revise`,
    body: { section: operation.payload.section, instruction: operation.payload.instruction },
  };
}

function scrBusyLabel(operation) {
  if (operation.kind === 'build') return 'Rick is building the full script';
  if (operation.kind === 'durationResize') return `Rick is fitting the script to ${operation.payload.label}`;
  if (operation.kind === 'revise') return `Rick is sharpening the ${operation.payload.section}`;
  if (operation.kind === 'refunnel') return `Rick is rewriting this for ${RICK_FUNNEL_LABELS[operation.payload.funnel] || operation.payload.funnel}`;
  if (operation.kind === 'critique') return `Rick is gathering ${operation.payload.criticCount} independent ${operation.payload.criticCount === 1 ? 'critique' : 'critiques'}`;
  if (operation.kind === 'critiqueApply') return 'Rick is applying the strongest improvements';
  if (operation.kind === 'critiqueSkip') return 'Closing the critique';
  if (operation.kind === 'scriptVersion') return `Opening v${operation.payload.number}`;
  if (operation.kind === 'funnelChoice') return 'Rick is finding angles for that stage';
  const stage = rickState.activeSession?.stage;
  if (stage === 'brief') return 'Rick is reading the room';
  if (stage === 'ideas') return 'Rick is finding hotter angles';
  return 'Rick is rewriting the draft';
}

/**
 * Runs one AI operation and, when it fails in a way the server says is safe to
 * resend, keeps the payload so the Retry button can replay the same request.
 * A failed turn is never persisted server side, so replaying cannot double up.
 */
async function scrRunOperation(operation) {
  if (rickState.busy) return false;
  const session = rickState.activeSession;
  if (!session || session.id !== operation.sessionId) return false;
  const request = scrOperationRequest(operation);
  scrClearError();
  if (operation.kind === 'message') {
    rickState.pendingMessage = {
      sessionId: operation.sessionId,
      text: operation.payload.message,
    };
    // Render before the first network await so the user's bubble appears on
    // the same click/keypress that sends it. The thinking state follows below.
    scrRenderMessages();
  }
  scrSetBusy(true, scrBusyLabel(operation));
  try {
    const data = await rickRequest(request.path, {
      method: 'POST',
      body: JSON.stringify(request.body),
    });
    rickState.activeSession = data.session;
    if (operation.kind === 'message') rickState.pendingMessage = null;
    if (operation.kind === 'critique' || operation.kind === 'critiqueSkip' || operation.kind === 'scriptVersion') {
      rickState.critiqueChooserSessionId = null;
    }
    // Both produce a script that already reflects the current stage.
    if (operation.kind === 'refunnel' || operation.kind === 'build') rickState.funnelRewrite = null;
    await scrRefreshSessions();
    // Clear busy before rendering, never after. A render is what stamps
    // `disabled = rickState.busy` onto controls, so rendering while still busy
    // hands scrSetBusy's selector list the job of reviving every one of them,
    // and anything missing from that list stays dead until a page refresh.
    scrSetBusy(false);
    scrRender();
    return true;
  } catch (error) {
    if (error.retryable) rickState.lastFailure = { sessionId: operation.sessionId, operation };
    if (operation.kind === 'message') {
      rickState.pendingMessage = null;
      scrRenderMessages();
      scrRestoreComposer(operation.payload.message);
    }
    scrShowError(error.message);
    return false;
  } finally {
    scrSetBusy(false);
    scrRenderComposer();
  }
}

async function scrRetryFailure() {
  const failure = rickState.lastFailure;
  if (!failure || rickState.busy) return;
  if (failure.sessionId !== rickState.activeSession?.id) {
    scrClearError();
    return;
  }
  const { operation } = failure;
  // The failed message is sitting in the composer. Take it back so a retry and a
  // manual send cannot both post it.
  if (operation.kind === 'message') scrConsumeComposer(operation.payload.message);
  await scrRunOperation(operation);
  if (operation.kind === 'message') document.getElementById('rickComposer')?.focus();
}

function scrRestoreComposer(message) {
  const composer = document.getElementById('rickComposer');
  if (!composer || composer.value.trim()) return;
  composer.value = message;
  scrResizeComposer();
}

function scrConsumeComposer(message) {
  const composer = document.getElementById('rickComposer');
  if (!composer || composer.value.trim() !== message) return;
  composer.value = '';
  scrResizeComposer();
}

async function scrSendMessage() {
  const session = rickState.activeSession;
  const composer = document.getElementById('rickComposer');
  const message = composer.value.trim();
  if (!session || !message || rickState.busy) return;
  composer.value = '';
  scrResizeComposer();
  await scrRunOperation({ kind: 'message', sessionId: session.id, payload: { message } });
  composer.focus();
}

async function scrBuildIdea(index) {
  const session = rickState.activeSession;
  if (!session) return;
  await scrRunOperation({
    kind: 'build',
    sessionId: session.id,
    payload: { ideaIndex: index, targetDuration: scrDurationPreset(session.targetDuration).id },
  });
}

async function scrReloadTeleprompterScript() {
  const state = rickState.teleprompter;
  const session = rickState.activeSession;
  if (!state.open || !session?.script) return;
  state.switchingVersion = true;
  scrRenderTeleprompter();
  try {
    let data = await scrRequestTeleprompterVersion(session.id, session.scriptVersionId);
    if (state.recordingMode === 'continuous') data = scrContinuousTeleprompterData(data);
    document.getElementById('rickTeleprompterOutputVideo')?.pause();
    scrApplyTeleprompterVersion(data, true);
    state.outputReady = false;
    state.takePreviewReady = false;
  } catch (error) {
    scrShowTeleprompterError(error.message);
  } finally {
    state.switchingVersion = false;
    scrRenderTeleprompter();
  }
}

async function scrFitScriptToDuration(fromTeleprompter = false) {
  const session = rickState.activeSession;
  const state = rickState.teleprompter;
  if (!session?.script || session.script.importedText || rickState.busy) return;
  if (state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout) return;
  if (state.open && scrTeleprompterHasProgress(state)
    && !window.confirm('Fit this script to the new length? Your existing takes and skipped scenes will be cleared, but the current script stays in version history.')) return;
  const preset = scrDurationPreset(session.targetDuration);
  const targetLabel = preset.seconds === 90 ? '1 minute+' : `about ${preset.seconds} seconds`;
  const instruction = `Resize the complete spoken script to ${targetLabel}, with ${preset.minWords} to ${preset.maxWords} total spoken words across Hook, Body, Conclusion, and CTA. Preserve the core idea and strongest specific details. Do not pad, rush, or count the caption. Keep natural punctuation and useful line breaks.`;
  const completed = await scrRunOperation({
    kind: 'durationResize',
    sessionId: session.id,
    payload: { targetDuration: preset.id, label: targetLabel, instruction },
  });
  if (completed && state.open) await scrReloadTeleprompterScript();
  else if (!completed && fromTeleprompter) scrRenderDurationControls();
}

async function scrRegenerateSection(section) {
  const session = rickState.activeSession;
  if (!session) return;
  await scrRunOperation({
    kind: 'revise',
    sessionId: session.id,
    payload: { section, instruction: `Make the ${section} more specific natural and compelling` },
  });
}

function scrAskForCritique() {
  const session = rickState.activeSession;
  if (!session?.script || rickState.busy) return;
  rickState.critiqueChooserSessionId = session.id;
  scrRenderScript();
  document.querySelector('.rick-critique-panel')?.scrollIntoView({ block: 'nearest' });
}

async function scrRequestCritique() {
  const session = rickState.activeSession;
  if (!session?.script || rickState.busy) return;
  await scrRunOperation({
    kind: 'critique',
    sessionId: session.id,
    payload: { criticCount: rickState.criticCount },
  });
}

async function scrApplyCritique() {
  const session = rickState.activeSession;
  if (!session?.critique || rickState.busy) return;
  await scrRunOperation({ kind: 'critiqueApply', sessionId: session.id, payload: {} });
}

async function scrSkipCritique() {
  const session = rickState.activeSession;
  if (!session?.critique || rickState.busy) return;
  await scrRunOperation({ kind: 'critiqueSkip', sessionId: session.id, payload: {} });
}

async function scrSelectScriptVersion(versionId) {
  const session = rickState.activeSession;
  if (!session || rickState.busy || session.scriptVersionId === versionId) return;
  const version = (session.scriptVersions || []).find((item) => item.id === versionId);
  if (!version) return;
  await scrRunOperation({
    kind: 'scriptVersion',
    sessionId: session.id,
    payload: { versionId, number: version.number },
  });
}

async function scrSetFunnel(funnel) {
  const session = rickState.activeSession;
  if (!session || rickState.busy || session.funnel === funnel) return;
  const hadScript = Boolean(session.script);
  try {
    const data = await rickRequest(`/sessions/${encodeURIComponent(session.id)}/funnel`, {
      method: 'PATCH',
      body: JSON.stringify({ funnel }),
    });
    rickState.activeSession = data.session;
    // An existing script was written for the old stage, so offer the rewrite
    // rather than silently changing a setting or spending a turn unasked.
    rickState.funnelRewrite = hadScript && data.session.selectedIdea
      ? { sessionId: session.id, funnel }
      : null;
    scrRenderFunnel();
    scrRenderComposer();
    if (hadScript) scrRenderScript();
  } catch (error) {
    scrShowError(error.message);
  }
}

function scrReviseScript() {
  const composer = document.getElementById('rickComposer');
  composer.focus();
  composer.placeholder = 'Tell Rick exactly what you want changed...';
}

function scrFormatScript(script) {
  if (!script) return '';
  if (script.importedText) return script.importedText;
  return RICK_SCRIPT_SECTIONS
    .map(([key, label]) => `${label.toUpperCase()}\n${script[key] || ''}`)
    .join('\n\n');
}

async function scrCopyScript() {
  const text = scrFormatScript(rickState.activeSession?.script);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (typeof showToast === 'function') showToast('Script copied', 'success');
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    if (typeof showToast === 'function') showToast('Script copied', 'success');
  }
}

function scrShowTeleprompterError(message = '') {
  const element = document.getElementById('rickTeleprompterError');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('visible', Boolean(message));
}

function scrFormatRecordingTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function scrGetTeleprompterPanelSafeArea(frameWidth, frameHeight) {
  const width = Math.max(0, Number(frameWidth) || 0);
  const height = Math.max(0, Number(frameHeight) || 0);
  const sideInset = Math.min(12, width * 0.04);
  const topInset = Math.min(54, height * 0.16);
  const bottomInset = Math.min(70, height * 0.2);
  const right = Math.max(sideInset, width - sideInset);
  const bottom = Math.max(topInset, height - bottomInset);
  const availableWidth = Math.max(0, right - sideInset);
  const availableHeight = Math.max(0, bottom - topInset);
  return {
    left: sideInset,
    top: topInset,
    right,
    bottom,
    minWidth: Math.min(220, availableWidth),
    minHeight: Math.min(110, availableHeight),
    availableWidth,
    availableHeight,
  };
}

function scrConstrainTeleprompterPanelGeometry(geometry = {}, frameWidth, frameHeight) {
  const safe = scrGetTeleprompterPanelSafeArea(frameWidth, frameHeight);
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), value));
  const width = clamp(finite(geometry.width, safe.availableWidth * 0.84), safe.minWidth, safe.availableWidth);
  const height = clamp(finite(geometry.height, safe.availableHeight * 0.3), safe.minHeight, safe.availableHeight);
  return {
    x: clamp(finite(geometry.x, (Number(frameWidth) - width) / 2), safe.left, safe.right - width),
    y: clamp(finite(geometry.y, Number(frameHeight) * 0.17), safe.top, safe.bottom - height),
    width,
    height,
  };
}

function scrTeleprompterPanelPixels(frame) {
  const state = rickState.teleprompter;
  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  const saved = state.scriptPanel;
  const geometry = saved ? {
    x: saved.x * frameWidth,
    y: saved.y * frameHeight,
    width: saved.width * frameWidth,
    height: saved.height * frameHeight,
  } : {
    x: frameWidth * 0.08,
    y: frameHeight * 0.17,
    width: frameWidth * 0.84,
    height: Math.min(220, frameHeight * 0.3),
  };
  return scrConstrainTeleprompterPanelGeometry(geometry, frameWidth, frameHeight);
}

function scrStoreTeleprompterPanelGeometry(geometry, frame) {
  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  if (!frameWidth || !frameHeight) return;
  rickState.teleprompter.scriptPanel = {
    x: geometry.x / frameWidth,
    y: geometry.y / frameHeight,
    width: geometry.width / frameWidth,
    height: geometry.height / frameHeight,
  };
}

function scrSetTeleprompterPanelGeometry(geometry, frame = document.getElementById('rickCameraFrame')) {
  const panel = document.getElementById('rickTeleprompterCopy');
  if (!frame || !panel || !frame.clientWidth || !frame.clientHeight) return null;
  const constrained = scrConstrainTeleprompterPanelGeometry(geometry, frame.clientWidth, frame.clientHeight);
  panel.style.left = `${constrained.x}px`;
  panel.style.top = `${constrained.y}px`;
  panel.style.width = `${constrained.width}px`;
  panel.style.height = `${constrained.height}px`;
  scrStoreTeleprompterPanelGeometry(constrained, frame);
  return constrained;
}

function scrApplyTeleprompterPanelLayout() {
  const state = rickState.teleprompter;
  const frame = document.getElementById('rickCameraFrame');
  if (!state.open || !frame?.clientWidth || !frame?.clientHeight) return;
  scrSetTeleprompterPanelGeometry(scrTeleprompterPanelPixels(frame), frame);
}

function scrScheduleTeleprompterPanelLayout() {
  const state = rickState.teleprompter;
  if (!state.open) return;
  if (state.scriptPanelLayoutFrame) cancelAnimationFrame(state.scriptPanelLayoutFrame);
  state.scriptPanelLayoutFrame = requestAnimationFrame(() => {
    state.scriptPanelLayoutFrame = null;
    scrApplyTeleprompterPanelLayout();
  });
  if (!state.scriptPanelResizeHandler) {
    state.scriptPanelResizeHandler = () => scrScheduleTeleprompterPanelLayout();
    window.addEventListener('resize', state.scriptPanelResizeHandler);
  }
}

function scrStartTeleprompterPanelInteraction(event, mode) {
  if (event.button !== undefined && event.button !== 0) return;
  const state = rickState.teleprompter;
  const frame = document.getElementById('rickCameraFrame');
  const panel = document.getElementById('rickTeleprompterCopy');
  if (!state.open || state.outputReady || !frame || !panel) return;
  const geometry = scrSetTeleprompterPanelGeometry(scrTeleprompterPanelPixels(frame), frame);
  if (!geometry) return;
  event.preventDefault();
  event.stopPropagation();
  scrEndTeleprompterPanelInteraction();
  state.scriptPanelInteraction = {
    mode,
    pointerX: event.clientX,
    pointerY: event.clientY,
    geometry,
  };
  panel.classList.add('adjusting');
  document.documentElement.classList.add('rick-panel-adjusting');
  window.addEventListener('pointermove', scrMoveTeleprompterPanelInteraction, { passive: false });
  window.addEventListener('pointerup', scrEndTeleprompterPanelInteraction);
  window.addEventListener('pointercancel', scrEndTeleprompterPanelInteraction);
}

function scrMoveTeleprompterPanelInteraction(event) {
  const state = rickState.teleprompter;
  const interaction = state.scriptPanelInteraction;
  const frame = document.getElementById('rickCameraFrame');
  if (!interaction || !frame) return;
  event.preventDefault();
  const dx = event.clientX - interaction.pointerX;
  const dy = event.clientY - interaction.pointerY;
  const start = interaction.geometry;
  const next = { ...start };
  if (interaction.mode === 'move') {
    next.x += dx;
    next.y += dy;
  } else {
    const safe = scrGetTeleprompterPanelSafeArea(frame.clientWidth, frame.clientHeight);
    const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), value));
    if (interaction.mode.includes('w')) {
      const right = start.x + start.width;
      next.width = clamp(start.width - dx, safe.minWidth, right - safe.left);
      next.x = right - next.width;
    }
    if (interaction.mode.includes('e')) {
      next.width = clamp(start.width + dx, safe.minWidth, safe.right - start.x);
    }
    if (interaction.mode.includes('n')) {
      const bottom = start.y + start.height;
      next.height = clamp(start.height - dy, safe.minHeight, bottom - safe.top);
      next.y = bottom - next.height;
    }
    if (interaction.mode.includes('s')) {
      next.height = clamp(start.height + dy, safe.minHeight, safe.bottom - start.y);
    }
  }
  scrSetTeleprompterPanelGeometry(next, frame);
}

function scrEndTeleprompterPanelInteraction() {
  const state = rickState.teleprompter;
  if (!state.scriptPanelInteraction) return;
  state.scriptPanelInteraction = null;
  document.getElementById('rickTeleprompterCopy')?.classList.remove('adjusting');
  document.documentElement.classList.remove('rick-panel-adjusting');
  window.removeEventListener('pointermove', scrMoveTeleprompterPanelInteraction);
  window.removeEventListener('pointerup', scrEndTeleprompterPanelInteraction);
  window.removeEventListener('pointercancel', scrEndTeleprompterPanelInteraction);
}

function scrResetTeleprompterPanel() {
  rickState.teleprompter.scriptPanel = null;
  scrScheduleTeleprompterPanelLayout();
}

function scrReleaseTeleprompterMedia(state = rickState.teleprompter) {
  if (state.audioFrame) cancelAnimationFrame(state.audioFrame);
  state.audioFrame = null;
  if (state.frameTimerId) clearInterval(state.frameTimerId);
  state.frameTimerId = null;
  state.framingDrag = null;
  scrEndTeleprompterPanelInteraction();
  if (state.audioContext) state.audioContext.close().catch(() => {});
  state.audioContext = null;
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  const preview = document.getElementById('rickTeleprompterPreview');
  if (preview) preview.srcObject = null;
  const canvas = document.getElementById('rickTeleprompterCanvas');
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('rickCameraFrame')?.classList.remove('has-stream', 'framing-active', 'reframing');
  const meter = document.getElementById('rickAudioLevelFill');
  if (meter) meter.style.width = '0%';
}

function scrResetTeleprompter() {
  const state = rickState.teleprompter;
  state.mediaRequest += 1;
  scrStopContinuousScroll();
  scrCancelContinuousCountdown(false);
  clearInterval(state.timerId);
  state.timerId = null;
  if (state.scriptPanelLayoutFrame) cancelAnimationFrame(state.scriptPanelLayoutFrame);
  state.scriptPanelLayoutFrame = null;
  if (state.recorder && state.recorder.state !== 'inactive') {
    state.recorder.ondataavailable = null;
    state.recorder.onstop = null;
    try { state.recorder.stop(); } catch (_) {}
  }
  state.clips.forEach((clip) => { if (clip?.url) URL.revokeObjectURL(clip.url); });
  scrReleaseTeleprompterMedia(state);
  Object.assign(state, {
    open: false,
    choosingMode: false,
    recordingMode: null,
    sessionId: null,
    scriptVersionId: null,
    scriptVersions: [],
    scenes: [],
    clips: [],
    skipped: [],
    activeIndex: 0,
    editingSceneIndex: null,
    recorder: null,
    chunks: [],
    startedAt: 0,
    framingDrag: null,
    switchingDevices: false,
    switchingVersion: false,
    switchingLayout: false,
    switchingPromptStyle: false,
    sceneLayout: 'standard',
    promptStyle: 'script',
    talkingPoints: null,
    takePreviewReady: false,
    scrollProgress: 0,
    scrollPaused: false,
    combining: false,
    output: null,
    outputReady: false,
  });
  const overlay = document.getElementById('rickTeleprompter');
  overlay?.classList.remove('open', 'recording', 'output-ready', 'has-output', 'choosing-mode', 'continuous-mode', 'take-preview');
  overlay?.setAttribute('aria-hidden', 'true');
  const sceneBuilder = document.getElementById('rickSceneBuilder');
  if (sceneBuilder) sceneBuilder.hidden = true;
  scrRenderProgress();
}

function scrDurationPreset(value) {
  return RICK_DURATION_PRESETS[value] || RICK_DURATION_PRESETS.standard;
}

function scrSpokenScriptText(script = {}) {
  if (script.importedText) return String(script.importedText).trim();
  return ['hook', 'body', 'conclusion', 'cta']
    .map((key) => String(script[key] || '').trim())
    .filter(Boolean)
    .join(' ');
}

function scrScriptWordCount(script = {}) {
  const text = scrSpokenScriptText(script);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function scrEstimatedScriptSeconds(script = {}, wordsPerMinute = 135) {
  return Math.max(0, Math.round((scrScriptWordCount(script) / Math.max(60, Number(wordsPerMinute) || 135)) * 60));
}

function scrFormatDurationEstimate(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

function scrRenderDurationControls() {
  const session = rickState.activeSession;
  if (!session) return;
  const preset = scrDurationPreset(session.targetDuration);
  const script = session.script;
  const words = scrScriptWordCount(script);
  const seconds = scrEstimatedScriptSeconds(script);
  const inRange = Boolean(script && words >= preset.minWords && words <= preset.maxWords);
  const locked = rickState.busy
    || rickState.teleprompter.recorder?.state === 'recording'
    || rickState.teleprompter.combining
    || rickState.teleprompter.switchingVersion
    || rickState.teleprompter.switchingLayout
    || rickState.teleprompter.switchingPromptStyle;

  document.querySelectorAll('[data-rick-duration]').forEach((button) => {
    const selected = button.dataset.rickDuration === preset.id;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = locked;
  });

  const statusText = !script
    ? `Rick will aim for about ${preset.seconds === 90 ? '1 minute+' : `${preset.seconds} seconds`} · ${preset.minWords}-${preset.maxWords} spoken words`
    : `${inRange ? 'On target' : 'Current script'} · about ${scrFormatDurationEstimate(seconds)} · ${words} spoken words`;
  const mainStatus = document.getElementById('rickDurationStatus');
  const teleprompterStatus = document.getElementById('rickTeleprompterDurationStatus');
  if (mainStatus) mainStatus.textContent = statusText;
  if (teleprompterStatus) teleprompterStatus.textContent = statusText;

  const canFit = Boolean(script && !script.importedText && !inRange);
  const targetLabel = preset.seconds === 90 ? '1 minute+' : `${preset.seconds}s`;
  [document.getElementById('rickDurationFit'), document.getElementById('rickTeleprompterDurationFit')].forEach((button) => {
    if (!button) return;
    button.hidden = !canFit;
    button.disabled = locked;
    button.textContent = `Fit script to ${targetLabel}`;
  });
}

async function scrChooseTargetDuration(targetDuration) {
  const session = rickState.activeSession;
  const preset = RICK_DURATION_PRESETS[targetDuration];
  if (!session || !preset || rickState.busy || session.targetDuration === targetDuration) return;
  try {
    const data = await rickRequest(`/sessions/${encodeURIComponent(session.id)}/duration`, {
      method: 'PATCH',
      body: JSON.stringify({ targetDuration }),
    });
    rickState.activeSession = data.session;
    scrRenderDurationControls();
  } catch (error) {
    if (rickState.teleprompter.open) scrShowTeleprompterError(error.message);
    else scrShowError(error.message);
  }
}

function scrTeleprompterHasProgress(state = rickState.teleprompter) {
  return state.clips.some(Boolean) || state.skipped.some(Boolean);
}

function scrClearTeleprompterProgress(state, sceneCount) {
  state.clips.forEach((clip) => { if (clip?.url) URL.revokeObjectURL(clip.url); });
  state.clips = new Array(sceneCount).fill(null);
  state.skipped = new Array(sceneCount).fill(false);
}

function scrApplyTeleprompterVersion(data, forceReset = false) {
  const state = rickState.teleprompter;
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  const activeSceneId = state.scenes[state.activeIndex]?.id;
  const sameScenes = state.scenes.length === scenes.length
    && state.scenes.every((scene, index) => scene.id === scenes[index].id && scene.text === scenes[index].text);
  if (forceReset || !sameScenes) {
    scrClearTeleprompterProgress(state, scenes.length);
    state.editingSceneIndex = null;
    const matchingIndex = scenes.findIndex((scene) => scene.id === activeSceneId);
    state.activeIndex = matchingIndex >= 0 ? matchingIndex : 0;
    state.outputReady = false;
    state.takePreviewReady = false;
    state.scrollProgress = 0;
    state.scrollPaused = false;
    state.promptStyle = 'script';
    state.talkingPoints = null;
  }
  state.scenes = scenes;
  state.sceneLayout = data.layout || 'standard';
  state.scriptVersionId = data.versionId || null;
  state.scriptVersions = Array.isArray(data.versions) ? data.versions : [];
  state.output = data.output || null;
}

async function scrRequestTeleprompterVersion(sessionId, versionId) {
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
  return rickRequest(`/sessions/${encodeURIComponent(sessionId)}/teleprompter${query}`);
}

async function scrOpenTeleprompter() {
  const session = rickState.activeSession;
  if (!session?.script || rickState.busy) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    scrShowError('This browser cannot record video. Update Chrome or use the desktop app browser.');
    return;
  }

  if (rickState.teleprompter.sessionId && rickState.teleprompter.sessionId !== session.id) {
    scrResetTeleprompter();
  }
  const state = rickState.teleprompter;
  state.open = true;
  state.sessionId = session.id;
  state.outputReady = false;
  state.choosingMode = true;
  state.continuousPreferences = scrLoadTeleprompterPreferences().continuous;
  const overlay = document.getElementById('rickTeleprompter');
  overlay?.classList.add('open', 'choosing-mode');
  overlay?.setAttribute('aria-hidden', 'false');
  const title = document.getElementById('rickTeleprompterTitle');
  if (title) title.textContent = session.selectedIdea?.text || session.title || 'Record your script';
  scrShowTeleprompterError();
  scrRenderProgress();
  scrRenderRecordingModeChooser();
}

function scrShowRecordingModeChooser() {
  const state = rickState.teleprompter;
  if (!state.open || state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout) return;
  scrCancelContinuousCountdown(false);
  scrPauseContinuousScroll(true);
  state.choosingMode = true;
  document.getElementById('rickTeleprompter')?.classList.add('choosing-mode');
  scrRenderRecordingModeChooser();
}

function scrRenderRecordingModeChooser() {
  const state = rickState.teleprompter;
  const saved = scrLoadTeleprompterPreferences();
  const highlighted = state.recordingMode || saved.lastMode || 'scenes';
  document.querySelectorAll('[data-recording-mode]').forEach((button) => {
    const selected = button.dataset.recordingMode === highlighted;
    button.classList.toggle('recommended', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function scrContinuousTeleprompterData(data) {
  const text = String(data.fullText || (Array.isArray(data.scenes) ? data.scenes : [])
    .map((scene) => String(scene?.text || '').trim())
    .filter(Boolean)
    .join(' '))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    ...data,
    layout: 'continuous',
    scenes: text ? [{ id: 'continuous-1', section: 'continuous', label: 'Full script', text, wordCount: text.split(/\s+/).length }] : [],
  };
}

async function scrChooseRecordingMode(mode) {
  const session = rickState.activeSession;
  const state = rickState.teleprompter;
  if (!['scenes', 'continuous'].includes(mode) || !state.open || !session?.script || state.recorder?.state === 'recording' || state.combining) return;
  const changingMode = Boolean(state.recordingMode && state.recordingMode !== mode);
  if (changingMode && scrTeleprompterHasProgress(state) && !window.confirm('Change recording mode? The takes from this recording session will be cleared.')) return;
  if (changingMode) {
    scrClearTeleprompterProgress(state, 0);
    state.outputReady = false;
    state.takePreviewReady = false;
  }
  state.recordingMode = mode;
  state.choosingMode = false;
  state.scrollProgress = 0;
  state.scrollPaused = false;
  state.continuousPreferences = scrLoadTeleprompterPreferences().continuous;
  scrSaveTeleprompterPreferences({ lastMode: mode });
  const overlay = document.getElementById('rickTeleprompter');
  overlay?.classList.remove('choosing-mode');
  overlay?.classList.toggle('continuous-mode', mode === 'continuous');
  scrScheduleTeleprompterPanelLayout();

  try {
    const visibleVersionId = session.scriptVersionId || session.scriptVersions?.[session.scriptVersions.length - 1]?.id;
    let requestedVersionId = visibleVersionId;
    if (state.scriptVersionId && visibleVersionId && state.scriptVersionId !== visibleVersionId && scrTeleprompterHasProgress(state)) {
      const keepTakes = !window.confirm('Use the script showing in the editor? Existing takes from the other version will be cleared.');
      if (keepTakes) requestedVersionId = state.scriptVersionId;
    }
    let data = await scrRequestTeleprompterVersion(session.id, requestedVersionId);
    if (mode === 'continuous') data = scrContinuousTeleprompterData(data);
    scrApplyTeleprompterVersion(data, Boolean(state.scriptVersionId && state.scriptVersionId !== data.versionId));
    scrRenderTeleprompter();
    const preferences = scrLoadMediaPreferences();
    state.cameraId = state.cameraId || preferences.cameraId;
    state.microphoneId = state.microphoneId || preferences.microphoneId;
    state.framing = scrNormalizeFraming(preferences.framing || state.framing);
    await scrPrepareTeleprompterMedia(state.cameraId, state.microphoneId);
  } catch (error) {
    scrShowTeleprompterError(error.message);
  }
}

function scrCloseTeleprompter() {
  const state = rickState.teleprompter;
  if (state.countdownActive) scrCancelContinuousCountdown(false);
  if (state.recorder?.state === 'recording') {
    scrShowTeleprompterError('Stop the current recording before returning to the script.');
    return;
  }
  if (state.combining) {
    scrShowTeleprompterError('Rick is combining the scenes. Keep this screen open until it finishes.');
    return;
  }
  state.open = false;
  state.choosingMode = false;
  state.outputReady = false;
  scrStopContinuousScroll();
  state.editingSceneIndex = null;
  scrCloseSceneBuilder();
  scrReleaseTeleprompterMedia(state);
  const outputVideo = document.getElementById('rickTeleprompterOutputVideo');
  outputVideo?.pause();
  const overlay = document.getElementById('rickTeleprompter');
  overlay?.classList.remove('open', 'recording', 'output-ready', 'choosing-mode', 'take-preview');
  overlay?.setAttribute('aria-hidden', 'true');
  scrRenderProgress();
}

function scrPopulateMediaDevices(devices, cameraId, microphoneId) {
  const camera = document.getElementById('rickTeleprompterCamera');
  const microphone = document.getElementById('rickTeleprompterMic');
  if (!camera || !microphone) return;
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  const microphones = devices.filter((device) => device.kind === 'audioinput');
  camera.replaceChildren();
  microphone.replaceChildren();
  if (!cameras.length) {
    const option = rickEl('option', '', 'No cameras found');
    option.disabled = true;
    camera.append(option);
  }
  if (!microphones.length) {
    const option = rickEl('option', '', 'No microphones found');
    option.disabled = true;
    microphone.append(option);
  }
  cameras.forEach((device, index) => {
    const option = rickEl('option', '', device.label || `Camera ${index + 1}`);
    option.value = device.deviceId;
    camera.append(option);
  });
  microphones.forEach((device, index) => {
    const option = rickEl('option', '', device.label || `Microphone ${index + 1}`);
    option.value = device.deviceId;
    microphone.append(option);
  });
  if (cameraId && cameras.some((device) => device.deviceId === cameraId)) camera.value = cameraId;
  if (microphoneId && microphones.some((device) => device.deviceId === microphoneId)) microphone.value = microphoneId;
}

function scrLoadMediaPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('rick-recording-devices') || '{}');
    return {
      cameraId: typeof saved.cameraId === 'string' ? saved.cameraId : null,
      microphoneId: typeof saved.microphoneId === 'string' ? saved.microphoneId : null,
      framing: scrNormalizeFraming(saved.framing),
    };
  } catch (_) {
    return { cameraId: null, microphoneId: null, framing: scrNormalizeFraming() };
  }
}

function scrSaveMediaPreferences(cameraId, microphoneId, framing = rickState.teleprompter.framing) {
  try { localStorage.setItem('rick-recording-devices', JSON.stringify({ cameraId, microphoneId, framing: scrNormalizeFraming(framing) })); }
  catch (_) {}
}

function scrNormalizeContinuousPreferences(value = {}) {
  const clamp = (number, minimum, maximum, fallback) => {
    const parsed = Number(number);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback));
  };
  return {
    wpm: Math.round(clamp(value.wpm, 60, 240, 130) / 5) * 5,
    fontSize: clamp(value.fontSize, 28, 64, 42),
    lineHeight: clamp(value.lineHeight, 1.25, 1.8, 1.5),
    opacity: clamp(value.opacity, 0.4, 0.95, 0.75),
    mirror: value.mirror === true,
    focusGuide: value.focusGuide !== false,
    countdown: [0, 3, 5, 10].includes(Number(value.countdown)) ? Number(value.countdown) : 3,
    autoStop: value.autoStop !== false,
  };
}

function scrLoadTeleprompterPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('rick-teleprompter-preferences') || '{}');
    return {
      lastMode: ['scenes', 'continuous'].includes(saved.lastMode) ? saved.lastMode : 'scenes',
      continuous: scrNormalizeContinuousPreferences(saved.continuous),
    };
  } catch (_) {
    return { lastMode: 'scenes', continuous: scrNormalizeContinuousPreferences() };
  }
}

function scrSaveTeleprompterPreferences(change = {}) {
  const current = scrLoadTeleprompterPreferences();
  const next = {
    lastMode: ['scenes', 'continuous'].includes(change.lastMode) ? change.lastMode : current.lastMode,
    continuous: scrNormalizeContinuousPreferences(change.continuous || current.continuous),
  };
  try { localStorage.setItem('rick-teleprompter-preferences', JSON.stringify(next)); }
  catch (_) {}
  return next;
}

function scrSetContinuousPreference(key, value) {
  const state = rickState.teleprompter;
  if (!(key in state.continuousPreferences)) return;
  const booleanKeys = ['mirror', 'focusGuide', 'autoStop'];
  state.continuousPreferences = scrNormalizeContinuousPreferences({
    ...state.continuousPreferences,
    [key]: booleanKeys.includes(key) ? Boolean(value) : Number(value),
  });
  scrSaveTeleprompterPreferences({ continuous: state.continuousPreferences });
  scrRenderContinuousControls();
  scrApplyContinuousPromptPosition();
}

function scrContinuousWordCount(state = rickState.teleprompter) {
  return String(state.scenes[0]?.text || '').split(/\s+/).filter(Boolean).length;
}

function scrContinuousDurationMs(state = rickState.teleprompter) {
  const words = scrContinuousWordCount(state);
  return words ? (words / state.continuousPreferences.wpm) * 60_000 : 0;
}

function scrApplyContinuousPromptPosition() {
  const state = rickState.teleprompter;
  if (state.recordingMode !== 'continuous') return;
  const panel = document.getElementById('rickTeleprompterCopy');
  const windowElement = document.getElementById('rickTeleprompterPromptWindow');
  const prompt = document.getElementById('rickTeleprompterPromptText');
  if (!windowElement || !prompt) return;
  panel?.style.setProperty('--rick-prompt-opacity', String(state.continuousPreferences.opacity));
  prompt.style.fontSize = `${state.continuousPreferences.fontSize}px`;
  prompt.style.lineHeight = String(state.continuousPreferences.lineHeight);
  windowElement.classList.toggle('mirrored', state.continuousPreferences.mirror);
  windowElement.classList.toggle('show-focus-guide', state.continuousPreferences.focusGuide);
  const verticalPadding = Math.max(0, windowElement.clientHeight * 0.5 - state.continuousPreferences.fontSize * state.continuousPreferences.lineHeight * 0.5);
  prompt.style.paddingTop = `${verticalPadding}px`;
  prompt.style.paddingBottom = `${verticalPadding}px`;
  const maximum = Math.max(0, prompt.scrollHeight - windowElement.clientHeight);
  windowElement.scrollTop = maximum * Math.min(1, Math.max(0, state.scrollProgress));
  const progress = document.getElementById('rickContinuousProgress');
  if (progress) progress.value = String(Math.round(state.scrollProgress * 1000));
}

function scrRenderContinuousControls() {
  const state = rickState.teleprompter;
  const continuous = state.recordingMode === 'continuous';
  const section = document.getElementById('rickContinuousControls');
  if (section) section.hidden = !continuous;
  if (!continuous) return;
  const preferences = state.continuousPreferences;
  const values = {
    rickContinuousWpm: preferences.wpm,
    rickContinuousFontSize: preferences.fontSize,
    rickContinuousLineHeight: preferences.lineHeight,
    rickContinuousCountdownSetting: preferences.countdown,
    rickContinuousOpacity: preferences.opacity,
  };
  Object.entries(values).forEach(([id, value]) => {
    const control = document.getElementById(id);
    if (control) control.value = String(value);
  });
  const booleans = {
    rickContinuousMirror: preferences.mirror,
    rickContinuousFocusGuide: preferences.focusGuide,
    rickContinuousAutoStop: preferences.autoStop,
  };
  Object.entries(booleans).forEach(([id, checked]) => {
    const control = document.getElementById(id);
    if (control) control.checked = checked;
  });
  const wpmValue = document.getElementById('rickContinuousWpmValue');
  if (wpmValue) wpmValue.textContent = `${preferences.wpm} WPM`;
  const estimate = document.getElementById('rickContinuousEstimate');
  if (estimate) estimate.textContent = `Estimated read time ${scrFormatRecordingTime(scrContinuousDurationMs(state))}`;
  const locked = state.combining || state.switchingVersion || state.editingSceneIndex !== null;
  section.querySelectorAll('input, select, button').forEach((control) => { control.disabled = locked; });
  scrApplyContinuousPromptPosition();
}

function scrPauseContinuousScroll(paused = true) {
  const state = rickState.teleprompter;
  if (state.recordingMode !== 'continuous') return;
  state.scrollPaused = paused;
  state.scrollLastFrameAt = 0;
  scrRenderTeleprompter();
}

function scrStopContinuousScroll() {
  const state = rickState.teleprompter;
  if (state.scrollFrameId) cancelAnimationFrame(state.scrollFrameId);
  if (state.scrollEndHoldId) clearTimeout(state.scrollEndHoldId);
  state.scrollFrameId = null;
  state.scrollEndHoldId = null;
  state.scrollLastFrameAt = 0;
}

function scrContinuousScrollFrame(timestamp) {
  const state = rickState.teleprompter;
  if (state.recordingMode !== 'continuous' || state.recorder?.state !== 'recording') {
    scrStopContinuousScroll();
    return;
  }
  if (!state.scrollLastFrameAt) state.scrollLastFrameAt = timestamp;
  const delta = Math.max(0, Math.min(250, timestamp - state.scrollLastFrameAt));
  state.scrollLastFrameAt = timestamp;
  if (!state.scrollPaused) {
    const duration = Math.max(1, scrContinuousDurationMs(state));
    state.scrollProgress = Math.min(1, state.scrollProgress + delta / duration);
    scrApplyContinuousPromptPosition();
    const percent = document.getElementById('rickTeleprompterProgressPercent');
    const fill = document.getElementById('rickTeleprompterProgressFill');
    if (percent) percent.textContent = `${Math.round(state.scrollProgress * 100)}%`;
    if (fill) fill.style.width = `${state.scrollProgress * 100}%`;
  }
  if (state.scrollProgress >= 1) {
    state.scrollPaused = true;
    if (state.continuousPreferences.autoStop && !state.scrollEndHoldId) {
      state.scrollEndHoldId = setTimeout(() => {
        state.scrollEndHoldId = null;
        if (state.recorder?.state === 'recording') state.recorder.stop();
      }, 2000);
    }
  }
  state.scrollFrameId = requestAnimationFrame(scrContinuousScrollFrame);
}

function scrStartContinuousScroll() {
  const state = rickState.teleprompter;
  scrStopContinuousScroll();
  state.scrollPaused = false;
  state.scrollLastFrameAt = 0;
  scrApplyContinuousPromptPosition();
  state.scrollFrameId = requestAnimationFrame(scrContinuousScrollFrame);
}

function scrCancelContinuousCountdown(render = true) {
  const state = rickState.teleprompter;
  clearInterval(state.countdownTimerId);
  state.countdownTimerId = null;
  state.countdownActive = false;
  state.countdownRemaining = 0;
  if (render) scrRenderTeleprompter();
}

function scrStartContinuousCountdown() {
  const state = rickState.teleprompter;
  if (!state.stream || state.countdownActive || state.takePreviewReady) return;
  const seconds = state.continuousPreferences.countdown;
  if (!seconds) {
    scrStartSceneRecording();
    return;
  }
  state.countdownActive = true;
  state.countdownRemaining = seconds;
  scrRenderTeleprompter();
  state.countdownTimerId = setInterval(() => {
    state.countdownRemaining -= 1;
    if (state.countdownRemaining <= 0) {
      scrCancelContinuousCountdown(false);
      scrStartSceneRecording();
    } else {
      scrRenderTeleprompter();
    }
  }, 1000);
}

function scrScrubContinuousPrompt(value) {
  const state = rickState.teleprompter;
  if (state.recordingMode !== 'continuous') return;
  state.scrollProgress = Math.min(1, Math.max(0, Number(value) / 1000));
  if (state.recorder?.state === 'recording') state.scrollPaused = true;
  state.scrollLastFrameAt = 0;
  scrApplyContinuousPromptPosition();
  scrRenderTeleprompter();
}

function scrJumpContinuousPrompt(seconds = -5) {
  const state = rickState.teleprompter;
  const duration = scrContinuousDurationMs(state);
  if (!duration) return;
  state.scrollProgress = Math.min(1, Math.max(0, state.scrollProgress + (Number(seconds) * 1000) / duration));
  state.scrollLastFrameAt = 0;
  scrApplyContinuousPromptPosition();
  scrRenderTeleprompter();
}

function scrResetContinuousPrompt() {
  const state = rickState.teleprompter;
  if (state.recorder?.state === 'recording') return;
  state.scrollProgress = 0;
  state.scrollPaused = false;
  scrApplyContinuousPromptPosition();
  scrRenderTeleprompter();
}

function scrHandleContinuousManualScroll() {
  const state = rickState.teleprompter;
  if (state.recordingMode !== 'continuous') return;
  requestAnimationFrame(() => {
    const windowElement = document.getElementById('rickTeleprompterPromptWindow');
    const prompt = document.getElementById('rickTeleprompterPromptText');
    if (!windowElement || !prompt) return;
    const maximum = Math.max(1, prompt.scrollHeight - windowElement.clientHeight);
    state.scrollProgress = Math.min(1, Math.max(0, windowElement.scrollTop / maximum));
    if (state.recorder?.state === 'recording') state.scrollPaused = true;
    scrRenderTeleprompter();
  });
}

function scrHandleContinuousShortcut(event) {
  const state = rickState.teleprompter;
  if (!state.open || state.choosingMode || state.recordingMode !== 'continuous' || state.editingSceneIndex !== null) return;
  const tag = event.target?.tagName?.toLowerCase();
  if (['input', 'select', 'textarea', 'button'].includes(tag) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === ' ' || event.key === 'ArrowRight' || event.key === 'PageDown') {
    if (state.recorder?.state !== 'recording') return;
    event.preventDefault();
    scrPauseContinuousScroll(!state.scrollPaused);
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    scrJumpContinuousPrompt(-5);
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    scrSetContinuousPreference('wpm', state.continuousPreferences.wpm + (event.key === 'ArrowUp' ? 5 : -5));
  }
}

function scrNormalizeFraming(value = {}) {
  const clamp = (number, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(number) || 0));
  return {
    zoom: clamp(value.zoom || 1, 1, 3),
    x: clamp(value.x, -1, 1),
    y: clamp(value.y, -1, 1),
  };
}

function scrGetFramingGeometry() {
  const state = rickState.teleprompter;
  const preview = document.getElementById('rickTeleprompterPreview');
  const canvas = document.getElementById('rickTeleprompterCanvas');
  if (!preview || !canvas || !preview.videoWidth || !preview.videoHeight) return null;
  const coverScale = Math.max(canvas.width / preview.videoWidth, canvas.height / preview.videoHeight);
  const scale = coverScale * state.framing.zoom;
  const width = preview.videoWidth * scale;
  const height = preview.videoHeight * scale;
  return {
    preview,
    canvas,
    width,
    height,
    availableX: Math.max(0, width - canvas.width),
    availableY: Math.max(0, height - canvas.height),
  };
}

function scrDrawFramedPreview() {
  const state = rickState.teleprompter;
  const geometry = scrGetFramingGeometry();
  if (!geometry || !state.stream) return;
  const { preview, canvas, width, height, availableX, availableY } = geometry;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;
  const x = -(availableX * (state.framing.x + 1)) / 2;
  const y = -(availableY * (state.framing.y + 1)) / 2;
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  try { context.drawImage(preview, x, y, width, height); } catch (_) {}
}

function scrStartFramingPreview() {
  const state = rickState.teleprompter;
  if (state.frameTimerId) clearInterval(state.frameTimerId);
  scrDrawFramedPreview();
  state.frameTimerId = setInterval(scrDrawFramedPreview, 1000 / 30);
}

function scrFramingLocked() {
  const state = rickState.teleprompter;
  return !state.stream || state.recorder?.state === 'recording' || state.combining || state.outputReady || state.switchingDevices || state.switchingVersion || state.switchingLayout;
}

function scrUpdateFraming(next) {
  if (scrFramingLocked()) return;
  const state = rickState.teleprompter;
  state.framing = scrNormalizeFraming({ ...state.framing, ...next });
  scrSaveMediaPreferences(state.cameraId, state.microphoneId, state.framing);
  scrDrawFramedPreview();
  scrRenderFramingControls();
}

function scrSetFramingZoom(value) {
  scrUpdateFraming({ zoom: Number(value) });
}

function scrNudgeFraming(x, y) {
  const state = rickState.teleprompter;
  scrUpdateFraming({ x: state.framing.x + x, y: state.framing.y + y });
}

function scrRecenterFraming() {
  scrUpdateFraming({ x: 0, y: 0 });
}

function scrStartFramingDrag(event) {
  if (scrFramingLocked()) return;
  const state = rickState.teleprompter;
  state.framingDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  document.getElementById('rickCameraFrame')?.classList.add('reframing');
  event.preventDefault();
}

function scrMoveFramingDrag(event) {
  const state = rickState.teleprompter;
  const drag = state.framingDrag;
  if (!drag || drag.pointerId !== event.pointerId || scrFramingLocked()) return;
  const canvas = event.currentTarget;
  const geometry = scrGetFramingGeometry();
  const rect = canvas.getBoundingClientRect();
  if (!geometry || !rect.width || !rect.height) return;
  const moveX = event.clientX - drag.x;
  const moveY = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  const x = geometry.availableX > 1
    ? state.framing.x + (moveX * 2 * geometry.canvas.width) / (geometry.availableX * rect.width)
    : state.framing.x;
  const y = geometry.availableY > 1
    ? state.framing.y - (moveY * 2 * geometry.canvas.height) / (geometry.availableY * rect.height)
    : state.framing.y;
  state.framing = scrNormalizeFraming({ ...state.framing, x, y });
  scrDrawFramedPreview();
  scrRenderFramingControls();
  event.preventDefault();
}

function scrEndFramingDrag(event) {
  const state = rickState.teleprompter;
  if (!state.framingDrag || state.framingDrag.pointerId !== event.pointerId) return;
  state.framingDrag = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  document.getElementById('rickCameraFrame')?.classList.remove('reframing');
  scrSaveMediaPreferences(state.cameraId, state.microphoneId, state.framing);
}

async function scrPrepareTeleprompterMedia(cameraId, microphoneId) {
  const state = rickState.teleprompter;
  const requestId = ++state.mediaRequest;
  state.switchingDevices = true;
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  try {
    const knownDevices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const selectedCameraId = cameraId && knownDevices.some((device) => device.kind === 'videoinput' && device.deviceId === cameraId)
      ? cameraId
      : null;
    const selectedMicrophoneId = microphoneId && knownDevices.some((device) => device.kind === 'audioinput' && device.deviceId === microphoneId)
      ? microphoneId
      : null;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: selectedCameraId
        ? { deviceId: { exact: selectedCameraId }, width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 } }
        : { width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 } },
      audio: selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId }, echoCancellation: true } : { echoCancellation: true },
    });
    if (requestId !== state.mediaRequest || !state.open) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    scrReleaseTeleprompterMedia(state);
    state.stream = stream;
    const preview = document.getElementById('rickTeleprompterPreview');
    if (preview) {
      preview.srcObject = stream;
      await preview.play().catch(() => {});
    }
    scrStartFramingPreview();
    document.getElementById('rickCameraFrame')?.classList.add('has-stream');
    const videoId = stream.getVideoTracks()[0]?.getSettings().deviceId || selectedCameraId;
    const audioId = stream.getAudioTracks()[0]?.getSettings().deviceId || selectedMicrophoneId;
    state.cameraId = videoId || null;
    state.microphoneId = audioId || null;
    scrSaveMediaPreferences(state.cameraId, state.microphoneId);
    const devices = await navigator.mediaDevices.enumerateDevices();
    scrPopulateMediaDevices(devices, videoId, audioId);
    scrStartAudioMeter(stream);
  } catch (error) {
    const message = error.name === 'NotAllowedError'
      ? 'Camera or microphone access was blocked. Allow access in the browser and try again.'
      : error.name === 'NotFoundError'
        ? 'Rick could not find both a camera and microphone on this device.'
        : 'Rick could not start the selected camera and microphone. Choose another device and try again.';
    scrShowTeleprompterError(message);
  } finally {
    if (requestId === state.mediaRequest) {
      state.switchingDevices = false;
      scrRenderTeleprompter();
    }
  }
}

function scrStartAudioMeter(stream) {
  const state = rickState.teleprompter;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !stream.getAudioTracks().length) return;
  const context = new AudioContextClass();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  state.audioContext = context;
  const samples = new Uint8Array(analyser.frequencyBinCount);
  const update = () => {
    if (state.audioContext !== context || !state.stream) return;
    analyser.getByteTimeDomainData(samples);
    const average = samples.reduce((sum, value) => sum + Math.abs(value - 128), 0) / samples.length;
    const percent = Math.min(100, Math.round(average * 5));
    const fill = document.getElementById('rickAudioLevelFill');
    if (fill) fill.style.width = `${percent}%`;
    state.audioFrame = requestAnimationFrame(update);
  };
  update();
}

function scrChangeMediaDevices() {
  const state = rickState.teleprompter;
  if (!state.open || state.recorder?.state === 'recording' || state.switchingDevices || state.switchingVersion || state.switchingLayout) return;
  const cameraId = document.getElementById('rickTeleprompterCamera')?.value;
  const microphoneId = document.getElementById('rickTeleprompterMic')?.value;
  scrPrepareTeleprompterMedia(cameraId, microphoneId);
}

function scrRenderFramingControls() {
  const state = rickState.teleprompter;
  const locked = scrFramingLocked();
  const zoom = document.getElementById('rickFramingZoom');
  const value = document.getElementById('rickFramingZoomValue');
  if (zoom) {
    zoom.value = String(state.framing.zoom);
    zoom.disabled = locked;
  }
  if (value) value.textContent = `${state.framing.zoom.toFixed(1)}×`;
  document.querySelectorAll('#rickFramingControls button').forEach((button) => { button.disabled = locked; });
  const recenter = document.getElementById('rickRecenterFraming');
  if (recenter) recenter.disabled = locked || (Math.abs(state.framing.x) < 0.001 && Math.abs(state.framing.y) < 0.001);
  const frame = document.getElementById('rickCameraFrame');
  frame?.classList.toggle('framing-active', state.framing.zoom > 1.001 || Math.abs(state.framing.x) > 0.001 || Math.abs(state.framing.y) > 0.001);
}

function scrRenderTeleprompterVersionControl() {
  const state = rickState.teleprompter;
  const select = document.getElementById('rickTeleprompterVersion');
  const status = document.getElementById('rickTeleprompterVersionStatus');
  if (!select) return;
  select.replaceChildren();
  state.scriptVersions.forEach((version) => {
    const option = document.createElement('option');
    const source = RICK_VERSION_SOURCES[version.source] || version.source || 'script version';
    option.value = version.id;
    option.textContent = `v${version.number} - ${source}`;
    select.append(option);
  });
  if (state.scriptVersionId) select.value = state.scriptVersionId;
  const recording = state.recorder?.state === 'recording';
  select.disabled = !state.scriptVersions.length || recording || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.editingSceneIndex !== null;
  const active = state.scriptVersions.find((version) => version.id === state.scriptVersionId);
  if (status) {
    const source = active ? (RICK_VERSION_SOURCES[active.source] || active.source || 'script version') : '';
    status.textContent = state.switchingVersion
      ? 'Loading that script version...'
      : active
        ? `Showing v${active.number} - ${source}`
        : 'Showing the script open when you clicked Record';
  }
}

function scrTalkingPointsKey(state = rickState.teleprompter) {
  return `${state.scriptVersionId || ''}|${state.scenes.map((scene) => `${scene.id || ''}:${scene.text || ''}`).join('\u241e')}`;
}

function scrPromptTextForScene(index, state = rickState.teleprompter) {
  const scene = state.scenes[index];
  if (!scene) return '';
  const points = state.promptStyle === 'points' && state.talkingPoints?.key === scrTalkingPointsKey(state)
    ? state.talkingPoints.scenes[index]?.bullets
    : null;
  return Array.isArray(points) && points.length
    ? points.map((point) => `• ${point}`).join('\n\n')
    : scene.text;
}

function scrRenderPromptStyleControls() {
  const state = rickState.teleprompter;
  const recording = state.recorder?.state === 'recording';
  const locked = recording || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.editingSceneIndex !== null;
  document.querySelectorAll('[data-prompt-style]').forEach((button) => {
    const selected = button.dataset.promptStyle === state.promptStyle;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = locked;
  });
  const status = document.getElementById('rickPromptStyleStatus');
  if (!status) return;
  status.textContent = state.switchingPromptStyle
    ? 'Rick is making concise speaking cues...'
    : state.promptStyle === 'points'
      ? 'Showing short cues · your saved script is unchanged'
      : 'Showing every word from your saved script';
}

async function scrSetPromptStyle(style) {
  const state = rickState.teleprompter;
  if (!['script', 'points'].includes(style) || !state.open || state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.editingSceneIndex !== null) return;
  if (style === 'script') {
    state.promptStyle = 'script';
    scrShowTeleprompterError();
    scrRenderTeleprompter();
    return;
  }
  const key = scrTalkingPointsKey(state);
  if (state.talkingPoints?.key === key) {
    state.promptStyle = 'points';
    scrShowTeleprompterError();
    scrRenderTeleprompter();
    return;
  }

  state.switchingPromptStyle = true;
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  try {
    const data = await rickRequest(`/sessions/${encodeURIComponent(state.sessionId)}/teleprompter/talking-points`, {
      method: 'POST',
      body: JSON.stringify({
        versionId: state.scriptVersionId,
        scenes: state.scenes.map((scene) => ({ label: scene.label, text: scene.text })),
      }),
    });
    if (!state.open || key !== scrTalkingPointsKey(state)) return;
    state.talkingPoints = { key, scenes: Array.isArray(data.scenes) ? data.scenes : [] };
    state.promptStyle = 'points';
  } catch (error) {
    scrShowTeleprompterError(error.message);
  } finally {
    state.switchingPromptStyle = false;
    scrRenderTeleprompter();
  }
}

function scrSceneBuilderBlocks(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => scrCleanTeleprompterEdit(block))
    .filter(Boolean);
}

function scrRenderSceneLayoutControls() {
  const state = rickState.teleprompter;
  const section = document.querySelector('.rick-scene-layout-controls');
  if (section) section.hidden = state.recordingMode === 'continuous';
  if (state.recordingMode === 'continuous') return;
  const recording = state.recorder?.state === 'recording';
  const locked = recording || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.editingSceneIndex !== null;
  document.querySelectorAll('[data-scene-layout]').forEach((button) => {
    const layout = button.dataset.sceneLayout;
    button.classList.toggle('active', layout === state.sceneLayout);
    button.disabled = locked;
    if (layout === 'easy') button.classList.toggle('loading', state.switchingLayout);
  });
  const status = document.getElementById('rickSceneLayoutStatus');
  if (!status) return;
  const label = state.sceneLayout === 'easy' ? 'Easy-read' : state.sceneLayout === 'custom' ? 'Custom' : 'Standard';
  status.textContent = state.switchingLayout
    ? 'Rick is finding natural scene breaks...'
    : `${label} · ${state.scenes.length} scene${state.scenes.length === 1 ? '' : 's'}`;
}

function scrOpenSceneBuilder() {
  const state = rickState.teleprompter;
  if (!state.open || state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.editingSceneIndex !== null) return;
  const backdrop = document.getElementById('rickSceneBuilder');
  const input = document.getElementById('rickSceneBuilderText');
  if (!backdrop || !input) return;
  input.value = state.scenes.map((scene) => scene.text).join('\n\n');
  backdrop.hidden = false;
  scrUpdateCustomSceneCount();
  requestAnimationFrame(() => input.focus());
}

function scrCloseSceneBuilder(event) {
  if (event && event.target !== event.currentTarget) return;
  const backdrop = document.getElementById('rickSceneBuilder');
  if (backdrop) backdrop.hidden = true;
}

function scrHandleSceneBuilderKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    scrCloseSceneBuilder();
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    scrApplyCustomSceneLayout();
  }
}

function scrUpdateCustomSceneCount() {
  const blocks = scrSceneBuilderBlocks(document.getElementById('rickSceneBuilderText')?.value);
  const count = document.getElementById('rickSceneBuilderCount');
  const apply = document.getElementById('rickUseCustomScenes');
  const valid = blocks.length > 0 && blocks.length <= 40;
  if (count) count.textContent = blocks.length > 40 ? `${blocks.length} scenes · maximum 40` : `${blocks.length} scene${blocks.length === 1 ? '' : 's'}`;
  if (apply) apply.disabled = !valid;
  return blocks;
}

function scrApplyCustomSceneLayout() {
  const state = rickState.teleprompter;
  const blocks = scrUpdateCustomSceneCount();
  if (!blocks.length || blocks.length > 40) return false;
  const expected = state.scenes.map((scene) => scene.text).join(' ').replace(/\s+/g, ' ').trim();
  const actual = blocks.join(' ').replace(/\s+/g, ' ').trim();
  if (actual !== expected) {
    scrShowTeleprompterError('Only add or remove blank lines here. Use Edit on the prompt if you want to change the words.');
    return false;
  }
  if (scrTeleprompterHasProgress(state) && !window.confirm('Use these custom scenes? Existing takes and skipped scenes will be cleared.')) return false;
  scrClearTeleprompterProgress(state, blocks.length);
  state.scenes = blocks.map((text, index) => ({
    id: `custom-${index + 1}`,
    section: 'custom',
    label: `Beat ${index + 1}`,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  }));
  state.sceneLayout = 'custom';
  state.promptStyle = 'script';
  state.talkingPoints = null;
  state.activeIndex = 0;
  state.editingSceneIndex = null;
  state.output = null;
  state.outputReady = false;
  document.getElementById('rickTeleprompterOutputVideo')?.pause();
  scrCloseSceneBuilder();
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  return true;
}

async function scrSetSceneLayout(layout) {
  const state = rickState.teleprompter;
  if (state.recordingMode === 'continuous') return;
  if (!['standard', 'easy', 'custom'].includes(layout) || !state.open || state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.editingSceneIndex !== null) return;
  if (layout === 'custom') {
    scrOpenSceneBuilder();
    return;
  }
  if (layout === state.sceneLayout) return;
  if (scrTeleprompterHasProgress(state) && !window.confirm(`Switch to ${layout === 'easy' ? 'Easy-read' : 'Standard'} scenes? Existing takes and skipped scenes will be cleared.`)) return;

  state.switchingLayout = true;
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  try {
    const data = layout === 'easy'
      ? await rickRequest(`/sessions/${encodeURIComponent(state.sessionId)}/teleprompter/scenes`, {
        method: 'POST',
        body: JSON.stringify({ versionId: state.scriptVersionId, layout: 'easy' }),
      })
      : await scrRequestTeleprompterVersion(state.sessionId, state.scriptVersionId);
    document.getElementById('rickTeleprompterOutputVideo')?.pause();
    scrApplyTeleprompterVersion(data, true);
    state.outputReady = false;
  } catch (error) {
    scrShowTeleprompterError(error.message);
  } finally {
    state.switchingLayout = false;
    scrRenderTeleprompter();
  }
}

async function scrChangeTeleprompterVersion(versionId) {
  const state = rickState.teleprompter;
  if (!state.open || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.combining || state.recorder?.state === 'recording' || state.editingSceneIndex !== null) return;
  const version = state.scriptVersions.find((item) => item.id === versionId);
  if (!version || version.id === state.scriptVersionId) return;
  if (scrTeleprompterHasProgress(state) && !window.confirm(`Switch to v${version.number}? Takes and skipped scenes for this version will start fresh.`)) {
    scrRenderTeleprompterVersionControl();
    return;
  }

  state.switchingVersion = true;
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  try {
    let data = await scrRequestTeleprompterVersion(state.sessionId, version.id);
    if (state.recordingMode === 'continuous') data = scrContinuousTeleprompterData(data);
    document.getElementById('rickTeleprompterOutputVideo')?.pause();
    scrApplyTeleprompterVersion(data, true);
    state.outputReady = false;
    state.switchingVersion = false;
    scrRenderTeleprompter();
    if (!state.stream) {
      const cameraId = document.getElementById('rickTeleprompterCamera')?.value || state.cameraId;
      const microphoneId = document.getElementById('rickTeleprompterMic')?.value || state.microphoneId;
      await scrPrepareTeleprompterMedia(cameraId, microphoneId);
    }
  } catch (error) {
    scrShowTeleprompterError(error.message);
  } finally {
    state.switchingVersion = false;
    scrRenderTeleprompter();
  }
}

function scrRenderTeleprompter() {
  const state = rickState.teleprompter;
  const overlay = document.getElementById('rickTeleprompter');
  if (!overlay) return;
  const recording = state.recorder?.state === 'recording';
  const recordedCount = state.clips.filter(Boolean).length;
  const skippedCount = state.skipped.filter(Boolean).length;
  const completedCount = recordedCount + skippedCount;
  const allComplete = state.scenes.length > 0 && completedCount === state.scenes.length;
  const percent = state.scenes.length ? Math.round((completedCount / state.scenes.length) * 100) : 0;
  const activeScene = state.scenes[state.activeIndex];
  const activeClip = state.clips[state.activeIndex];
  const activeSkipped = Boolean(state.skipped[state.activeIndex]);
  const editingText = state.editingSceneIndex === state.activeIndex;
  const continuous = state.recordingMode === 'continuous';

  overlay.classList.toggle('recording', recording);
  overlay.classList.toggle('output-ready', state.outputReady);
  overlay.classList.toggle('has-output', Boolean(state.output));
  overlay.classList.toggle('continuous-mode', continuous);
  overlay.classList.toggle('take-preview', continuous && state.takePreviewReady && !state.outputReady);
  scrRenderTeleprompterVersionControl();
  scrRenderDurationControls();
  scrRenderPromptStyleControls();
  scrRenderSceneLayoutControls();
  scrRenderFramingControls();
  scrRenderContinuousControls();
  const scenesAside = document.querySelector('.rick-teleprompter-scenes');
  if (scenesAside) scenesAside.hidden = continuous;
  const list = document.getElementById('rickTeleprompterSceneList');
  if (list) {
    list.replaceChildren();
    state.scenes.forEach((scene, index) => {
      const row = rickEl('div', 'rick-scene-row');
      const button = rickEl('button', 'rick-scene-item');
      button.type = 'button';
      if (index === state.activeIndex) {
        button.classList.add('active');
        row.classList.add('active');
      }
      if (state.clips[index]) button.classList.add('recorded');
      if (state.skipped[index]) button.classList.add('skipped');
      button.disabled = recording || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || editingText;
      const head = rickEl('div', 'rick-scene-item-head');
      head.append(rickEl('strong', '', `Scene ${index + 1}`));
      if (state.clips[index]) head.append(rickEl('span', '', 'Recorded'));
      else if (state.skipped[index]) head.append(rickEl('span', '', 'Skipped'));
      button.append(head, rickEl('p', '', scene.label));
      button.addEventListener('click', () => scrSelectScene(index));
      const actions = rickEl('div', 'rick-scene-actions');
      const mergeDirection = index === state.scenes.length - 1 ? 'previous' : 'next';
      const mergeTarget = state.scenes.length <= 1 ? 1 : mergeDirection === 'previous' ? index : index + 2;
      const merge = rickEl('button', 'rick-scene-merge', '');
      merge.type = 'button';
      merge.setAttribute('aria-label', `Merge scene ${index + 1} with scene ${mergeTarget}`);
      merge.title = state.scenes.length <= 1 ? 'Add another scene before merging' : `Merge with scene ${mergeTarget}`;
      merge.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h2a4 4 0 014 4v8"/><path d="m11 15 3 3 3-3"/><path d="M5 6h1M18 18h1"/></svg>';
      merge.disabled = state.scenes.length <= 1 || recording || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.outputReady || editingText;
      merge.addEventListener('click', () => scrMergeTeleprompterScene(index, mergeDirection));
      const remove = rickEl('button', 'rick-scene-delete', '');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Delete scene ${index + 1}`);
      remove.title = `Delete scene ${index + 1}`;
      remove.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg>';
      remove.disabled = state.scenes.length <= 1 || recording || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.outputReady || editingText;
      remove.addEventListener('click', () => scrDeleteTeleprompterScene(index));
      actions.append(merge, remove);
      row.append(button, actions);
      list.append(row);
    });
  }

  const sceneLabel = document.getElementById('rickTeleprompterSceneLabel');
  const prompt = document.getElementById('rickTeleprompterPromptText');
  const copyPanel = document.getElementById('rickTeleprompterCopy');
  const textEditor = document.getElementById('rickTeleprompterTextEditor');
  const editText = document.getElementById('rickTeleprompterEditText');
  if (sceneLabel) sceneLabel.textContent = state.promptStyle === 'points'
    ? continuous ? 'Talking points · full take' : activeScene ? `Talking points · Scene ${state.activeIndex + 1}` : 'Talking points'
    : continuous
      ? `Full script · ${scrContinuousWordCount(state)} words`
      : activeScene ? `Scene ${state.activeIndex + 1} · ${activeScene.label}` : 'Scene';
  if (prompt) prompt.textContent = scrPromptTextForScene(state.activeIndex, state);
  copyPanel?.classList.toggle('editing-text', editingText);
  if (textEditor) textEditor.hidden = !editingText;
  if (editText) {
    editText.disabled = recording || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.promptStyle === 'points' || state.outputReady || state.takePreviewReady || !activeScene || editingText;
    editText.title = state.promptStyle === 'points' ? 'Switch to Full script to edit the exact words' : 'Edit the words shown for this scene';
    const editLabel = editText.querySelector('span');
    if (editLabel) editLabel.textContent = editingText ? 'Editing' : 'Edit';
  }
  scrScheduleTeleprompterPanelLayout();
  if (continuous) requestAnimationFrame(scrApplyContinuousPromptPosition);
  const progressText = document.getElementById('rickTeleprompterProgressText');
  const progressPercent = document.getElementById('rickTeleprompterProgressPercent');
  const progressFill = document.getElementById('rickTeleprompterProgressFill');
  const visiblePercent = continuous ? Math.round(state.scrollProgress * 100) : percent;
  if (progressText) progressText.textContent = continuous
    ? state.takePreviewReady ? 'Full take recorded' : `${visiblePercent}% through the script`
    : `${completedCount} of ${state.scenes.length} complete${skippedCount ? ` · ${skippedCount} skipped` : ''}`;
  if (progressPercent) progressPercent.textContent = `${visiblePercent}%`;
  if (progressFill) progressFill.style.width = `${visiblePercent}%`;
  const totalDuration = document.getElementById('rickTotalDuration');
  // Every clip change re-renders, so this stays current without its own hook.
  if (totalDuration) totalDuration.textContent = `${scrFormatRecordingTime(scrTotalRecordedMs(state))} recorded`;

  const recordButton = document.getElementById('rickTeleprompterRecordBtn');
  const recordLabel = recordButton?.querySelector('strong');
  if (recordLabel) recordLabel.textContent = state.countdownActive ? 'Cancel countdown' : recording ? 'Stop recording' : continuous ? 'Start full take' : activeClip ? 'Record again' : activeSkipped ? 'Record this scene' : 'Start recording';
  if (recordButton) recordButton.disabled = !state.stream || !activeScene || state.combining || state.outputReady || state.takePreviewReady || state.switchingDevices || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || editingText;
  const cameraSelect = document.getElementById('rickTeleprompterCamera');
  const microphoneSelect = document.getElementById('rickTeleprompterMic');
  if (cameraSelect) cameraSelect.disabled = recording || state.countdownActive || state.combining || state.switchingDevices || state.switchingVersion || state.switchingLayout;
  if (microphoneSelect) microphoneSelect.disabled = recording || state.countdownActive || state.combining || state.switchingDevices || state.switchingVersion || state.switchingLayout;
  const mediaStatus = document.getElementById('rickMediaDeviceStatus');
  if (mediaStatus) {
    const cameraName = cameraSelect?.selectedOptions?.[0]?.textContent;
    mediaStatus.textContent = state.switchingDevices
      ? 'Switching camera and microphone...'
      : cameraName && state.stream
        ? `Using ${cameraName}`
        : 'Choose a camera and microphone';
  }
  const previous = document.getElementById('rickPreviousScene');
  const next = document.getElementById('rickNextScene');
  if (previous) previous.disabled = recording || state.combining || state.switchingVersion || state.switchingLayout || editingText || state.activeIndex <= 0;
  if (next) next.disabled = recording || state.combining || state.switchingVersion || state.switchingLayout || editingText || state.activeIndex >= state.scenes.length - 1;
  const retake = document.getElementById('rickRetakeScene');
  if (retake) {
    retake.textContent = continuous ? 'Retake full video' : 'Retake this scene';
    retake.disabled = recording || state.combining || state.switchingVersion || state.switchingLayout || editingText || !activeClip;
  }
  const deleteAll = document.getElementById('rickDeleteAllTakes');
  // Session-scoped, unlike Re-record: live whenever there is anything to clear,
  // including a take in progress, which it stops first.
  if (deleteAll) {
    const anyTakes = recordedCount > 0 || state.skipped.some(Boolean);
    deleteAll.disabled = state.combining || state.switchingDevices || state.switchingVersion || state.switchingLayout || editingText || !state.scenes.length || !(anyTakes || recording);
  }
  const rerecord = document.getElementById('rickRerecordBtn');
  // Re-record belongs to the scene the creator selected. Start recording
  // already covers a fresh scene, so this is only live for an existing take
  // or while restarting the take currently in progress.
  if (rerecord) {
    rerecord.disabled = state.combining || state.switchingDevices || state.switchingVersion || state.switchingLayout || editingText || state.outputReady || !activeScene || !(activeClip || recording);
    rerecord.title = activeScene ? `Restart scene ${state.activeIndex + 1} and replace only this take` : 'Select a recorded scene to re-record';
  }
  const skip = document.getElementById('rickSkipScene');
  if (skip) {
    skip.disabled = recording || state.combining || state.switchingVersion || state.switchingLayout || editingText || state.outputReady || !activeScene;
    skip.textContent = activeSkipped ? 'Include this scene' : 'Skip this scene';
  }
  const combine = document.getElementById('rickCombineVideo');
  if (combine) {
    combine.disabled = !allComplete || !recordedCount || recording || state.combining || state.switchingVersion || state.switchingLayout || editingText || state.outputReady;
    combine.textContent = state.combining ? (continuous ? 'Preparing video...' : 'Combining scenes...') : state.outputReady ? 'Video ready' : continuous ? 'Use this video' : 'Combine video';
  }

  const status = document.getElementById('rickTeleprompterStatus');
  const headStatus = document.getElementById('rickTeleprompterHeadStatus');
  let statusText = state.stream ? (continuous ? 'Set your pace then record the full script in one take' : 'Record each scene then combine the finished video') : 'Choose your devices and allow camera access';
  let headText = state.stream ? 'Ready to record' : 'Camera setup';
  if (activeClip) statusText = continuous ? 'Preview your take then use it or record the full script again.' : 'This scene is recorded. Move on or record it again.';
  if (activeSkipped) statusText = 'This scene will be left out of the combined video.';
  if (allComplete && recordedCount) statusText = 'Every scene is recorded or skipped. Combine the finished video.';
  if (allComplete && !recordedCount) statusText = 'Record at least one scene before combining the video.';
  if (editingText) { statusText = 'Edit the words for this scene, then save or cancel.'; headText = 'Editing scene'; }
  if (state.countdownActive) { statusText = `Recording starts in ${state.countdownRemaining}`; headText = 'Get ready'; }
  if (recording) { statusText = continuous ? (state.scrollPaused ? 'Recording continues · Prompt paused' : 'Recording full script') : `Recording scene ${state.activeIndex + 1}`; headText = state.scrollPaused && continuous ? 'Prompt paused' : 'Recording'; }
  if (state.switchingVersion) { statusText = 'Loading the selected script version'; headText = 'Changing script'; }
  if (state.switchingLayout) { statusText = 'Rick is finding natural scene breaks'; headText = 'Building scenes'; }
  if (state.switchingPromptStyle) { statusText = 'Rick is making short talking points from this script'; headText = 'Making cues'; }
  if (state.switchingDevices) { statusText = 'Connecting the selected camera and microphone'; headText = 'Changing devices'; }
  if (state.combining) { statusText = 'Combining and formatting your vertical video'; headText = 'Combining'; }
  if (state.outputReady) { statusText = 'Your combined video is ready to preview and download.'; headText = 'Video ready'; }
  else if (state.output && !recordedCount) statusText = 'A previous combined video is available below, or record a new version.';
  if (status) status.textContent = statusText;
  if (headStatus) headStatus.textContent = headText;

  const countdown = document.getElementById('rickTeleprompterCountdown');
  if (countdown) {
    countdown.textContent = state.countdownActive ? String(state.countdownRemaining) : '';
    countdown.classList.toggle('visible', state.countdownActive);
  }

  const outputVideo = document.getElementById('rickTeleprompterOutputVideo');
  const download = document.getElementById('rickDownloadVideo');
  if (state.output?.url) {
    if (outputVideo && outputVideo.src !== new URL(state.output.url, location.href).href) outputVideo.src = state.output.url;
    if (download) download.href = state.output.url;
  } else if (download) {
    download.removeAttribute('href');
  }
}

function scrSelectScene(index) {
  const state = rickState.teleprompter;
  if (state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.editingSceneIndex !== null) return;
  if (!Number.isInteger(index) || index < 0 || index >= state.scenes.length) return;
  state.activeIndex = index;
  if (state.outputReady) {
    state.outputReady = false;
    document.getElementById('rickTeleprompterOutputVideo')?.pause();
    const cameraId = document.getElementById('rickTeleprompterCamera')?.value;
    const microphoneId = document.getElementById('rickTeleprompterMic')?.value;
    scrPrepareTeleprompterMedia(cameraId, microphoneId);
  }
  scrRenderTeleprompter();
}

function scrSelectRelativeScene(offset) {
  scrSelectScene(rickState.teleprompter.activeIndex + offset);
}

function scrRenumberTeleprompterScenes(state = rickState.teleprompter) {
  state.scenes.forEach((scene, index) => {
    if (scene.section === 'custom' && /^Beat \d+$/i.test(scene.label || '')) scene.label = `Beat ${index + 1}`;
  });
}

function scrMergedSceneLabel(first, second, layout, sceneNumber) {
  if (layout === 'custom') return `Beat ${sceneNumber}`;
  const firstLabel = String(first?.label || '').trim();
  const secondLabel = String(second?.label || '').trim();
  if (first?.section === second?.section) {
    const base = firstLabel.replace(/\s+\d+$/, '');
    if (base && base === secondLabel.replace(/\s+\d+$/, '')) return base;
  }
  if (!firstLabel) return secondLabel || `Combined scene ${sceneNumber}`;
  if (!secondLabel || firstLabel === secondLabel) return firstLabel;
  return `${firstLabel} + ${secondLabel}`.slice(0, 80);
}

function scrMergeTeleprompterScene(index = rickState.teleprompter.activeIndex, direction = 'next') {
  const state = rickState.teleprompter;
  if (!Number.isInteger(index) || index < 0 || index >= state.scenes.length || state.scenes.length <= 1) return false;
  if (state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.outputReady || state.editingSceneIndex !== null) return false;
  const start = direction === 'previous' ? index - 1 : index;
  if (start < 0 || start + 1 >= state.scenes.length) return false;
  const first = state.scenes[start];
  const second = state.scenes[start + 1];
  const mergedText = `${String(first.text || '').trim()}\n\n${String(second.text || '').trim()}`.trim();
  if (mergedText.length > 6000) {
    scrShowTeleprompterError('Those two scenes are too long to merge. Shorten one first, then try again.');
    return false;
  }

  const affectedClips = state.clips.slice(start, start + 2);
  const hasProgress = affectedClips.some(Boolean) || state.skipped.slice(start, start + 2).some(Boolean);
  if (hasProgress && !window.confirm(`Merge scenes ${start + 1} and ${start + 2}? Their recorded takes or skipped status will be cleared so you can record the combined scene.`)) return false;
  affectedClips.forEach((clip) => { if (clip?.url) URL.revokeObjectURL(clip.url); });

  const merged = {
    id: `${state.sceneLayout || 'scene'}-merged-${Date.now()}`,
    section: first.section === second.section ? first.section : 'combined',
    label: scrMergedSceneLabel(first, second, state.sceneLayout, start + 1),
    text: mergedText,
    wordCount: mergedText.split(/\s+/).filter(Boolean).length,
  };
  state.scenes.splice(start, 2, merged);
  state.clips.splice(start, 2, null);
  state.skipped.splice(start, 2, false);
  scrRenumberTeleprompterScenes(state);
  state.editingSceneIndex = null;
  state.promptStyle = 'script';
  state.talkingPoints = null;
  state.activeIndex = start;
  state.outputReady = false;
  document.getElementById('rickTeleprompterOutputVideo')?.pause();
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  if (typeof showToast === 'function') showToast(`Scenes ${start + 1} and ${start + 2} merged`, 'success');
  return true;
}

function scrDeleteTeleprompterScene(index = rickState.teleprompter.activeIndex) {
  const state = rickState.teleprompter;
  if (!Number.isInteger(index) || index < 0 || index >= state.scenes.length) return false;
  if (state.scenes.length <= 1) {
    scrShowTeleprompterError('Keep at least one scene in the recording.');
    return false;
  }
  if (state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.outputReady || state.editingSceneIndex !== null) return false;
  const hasTake = Boolean(state.clips[index]);
  const wasSkipped = Boolean(state.skipped[index]);
  const detail = hasTake
    ? ' Its recorded take will also be deleted.'
    : wasSkipped
      ? ' Its skipped status will also be removed.'
      : '';
  if (!window.confirm(`Delete scene ${index + 1}?${detail} The remaining scenes will be renumbered.`)) return false;

  const clip = state.clips[index];
  if (clip?.url) URL.revokeObjectURL(clip.url);
  state.scenes.splice(index, 1);
  state.clips.splice(index, 1);
  state.skipped.splice(index, 1);
  scrRenumberTeleprompterScenes(state);
  state.editingSceneIndex = null;
  state.promptStyle = 'script';
  state.talkingPoints = null;
  state.activeIndex = Math.min(index, state.scenes.length - 1);
  state.outputReady = false;
  document.getElementById('rickTeleprompterOutputVideo')?.pause();
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  if (typeof showToast === 'function') showToast(`Scene deleted · ${state.scenes.length} remaining`, 'success');
  return true;
}

function scrCleanTeleprompterEdit(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 6000);
}

function scrBeginTeleprompterTextEdit() {
  const state = rickState.teleprompter;
  const scene = state.scenes[state.activeIndex];
  if (!scene || state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.promptStyle === 'points' || state.outputReady || state.takePreviewReady) return;
  state.editingSceneIndex = state.activeIndex;
  const input = document.getElementById('rickTeleprompterTextInput');
  if (input) input.value = scene.text;
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  requestAnimationFrame(() => {
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  });
}

function scrCancelTeleprompterTextEdit() {
  const state = rickState.teleprompter;
  if (state.editingSceneIndex === null) return;
  state.editingSceneIndex = null;
  state.promptStyle = 'script';
  state.talkingPoints = null;
  scrShowTeleprompterError();
  scrRenderTeleprompter();
}

function scrSaveTeleprompterTextEdit() {
  const state = rickState.teleprompter;
  const index = state.editingSceneIndex;
  const scene = state.scenes[index];
  const input = document.getElementById('rickTeleprompterTextInput');
  if (!Number.isInteger(index) || !scene || !input || state.recorder?.state === 'recording' || state.combining) return false;
  const text = scrCleanTeleprompterEdit(input.value);
  if (!text) {
    scrShowTeleprompterError(state.recordingMode === 'continuous' ? 'Enter some text before saving the prompt.' : 'Enter some text before saving this scene.');
    input.focus();
    return false;
  }
  if (text === scene.text) {
    scrCancelTeleprompterTextEdit();
    return true;
  }
  const clip = state.clips[index];
  if (clip && !confirm(state.recordingMode === 'continuous' ? 'Save these words and delete the recorded full take?' : `Save these words and delete the recorded take for scene ${index + 1}?`)) return false;
  if (clip?.url) URL.revokeObjectURL(clip.url);
  state.clips[index] = null;
  state.skipped[index] = false;
  scene.text = text;
  scene.wordCount = text.split(/\s+/).filter(Boolean).length;
  if (state.recordingMode === 'continuous') {
    state.takePreviewReady = false;
    state.scrollProgress = 0;
    state.scrollPaused = false;
  }
  state.editingSceneIndex = null;
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  if (typeof showToast === 'function') showToast(state.recordingMode === 'continuous' ? 'Teleprompter text updated' : `Scene ${index + 1} text updated`, 'success');
  return true;
}

function scrHandleTeleprompterEditKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    scrCancelTeleprompterTextEdit();
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    scrSaveTeleprompterTextEdit();
  }
}

function scrPreferredRecordingMime() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

function scrToggleRecording() {
  const state = rickState.teleprompter;
  if (state.switchingPromptStyle) return;
  if (state.countdownActive) {
    scrCancelContinuousCountdown();
    return;
  }
  if (state.recorder?.state === 'recording') {
    state.recorder.stop();
    return;
  }
  if (state.recordingMode === 'continuous') scrStartContinuousCountdown();
  else scrStartSceneRecording();
}

function scrStartSceneRecording(options = {}) {
  const state = rickState.teleprompter;
  if (!state.stream || !state.scenes[state.activeIndex] || state.combining || state.switchingVersion || state.switchingLayout || state.switchingPromptStyle || state.editingSceneIndex !== null) return;
  const recordingIndex = state.activeIndex;
  if (state.recordingMode === 'continuous' && state.scrollProgress >= 1) state.scrollProgress = 0;
  const stayOnScene = Boolean(options.stayOnScene || state.clips[recordingIndex]);
  scrShowTeleprompterError();
  state.skipped[recordingIndex] = false;
  const mimeType = scrPreferredRecordingMime();
  try {
    let recorder;
    try {
      recorder = new MediaRecorder(state.stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 160_000,
      });
    } catch (_) {
      recorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
    }
    state.recorder = recorder;
    state.chunks = [];
    state.startedAt = Date.now();
    state.outputReady = false;
    recorder.ondataavailable = (event) => { if (event.data?.size) state.chunks.push(event.data); };
    recorder.onerror = () => scrShowTeleprompterError('The browser stopped this recording. Try the scene again.');
    recorder.onstop = () => {
      if (state.recordingMode === 'continuous') scrStopContinuousScroll();
      clearInterval(state.timerId);
      state.timerId = null;
      const timer = document.getElementById('rickTeleprompterTimer');
      if (timer) timer.textContent = '00:00';
      const blob = new Blob(state.chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
      state.chunks = [];
      if (!blob.size) {
        scrShowTeleprompterError('That scene did not contain any video. Check the camera and try again.');
        scrRenderTeleprompter();
        return;
      }
      const previous = state.clips[recordingIndex];
      if (previous?.url) URL.revokeObjectURL(previous.url);
      state.clips[recordingIndex] = {
        blob,
        url: URL.createObjectURL(blob),
        durationMs: Date.now() - state.startedAt,
        framing: { ...state.framing },
      };
      if (state.recordingMode === 'continuous') {
        state.takePreviewReady = true;
        state.scrollPaused = true;
        const outputVideo = document.getElementById('rickTeleprompterOutputVideo');
        if (outputVideo) {
          outputVideo.src = state.clips[recordingIndex].url;
          outputVideo.load();
        }
      }
      if (stayOnScene) {
        state.activeIndex = recordingIndex;
      } else {
        const nextIndex = state.clips.findIndex((clip, index) => index > recordingIndex && !clip && !state.skipped[index]);
        const wrappedIndex = nextIndex === -1 ? state.clips.findIndex((clip, index) => !clip && !state.skipped[index]) : nextIndex;
        if (wrappedIndex >= 0) state.activeIndex = wrappedIndex;
      }
      scrRenderTeleprompter();
    };
    recorder.start(250);
    if (state.recordingMode === 'continuous') scrStartContinuousScroll();
    clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      const timer = document.getElementById('rickTeleprompterTimer');
      if (timer) timer.textContent = scrFormatRecordingTime(Date.now() - state.startedAt);
    }, 250);
    scrRenderTeleprompter();
  } catch (_) {
    scrShowTeleprompterError('This camera format could not start recording. Choose another camera and try again.');
  }
}

function scrRetakeScene() {
  const state = rickState.teleprompter;
  if (state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout) return;
  const clip = state.clips[state.activeIndex];
  if (!clip) return;
  if (clip.url) URL.revokeObjectURL(clip.url);
  state.clips[state.activeIndex] = null;
  if (state.recordingMode === 'continuous') {
    state.takePreviewReady = false;
    state.scrollProgress = 0;
    state.scrollPaused = false;
    const preview = document.getElementById('rickTeleprompterOutputVideo');
    preview?.pause();
    preview?.removeAttribute('src');
    preview?.load();
  }
  const wasOutputReady = state.outputReady;
  state.outputReady = false;
  document.getElementById('rickTeleprompterOutputVideo')?.pause();
  scrRenderTeleprompter();
  if (wasOutputReady && !state.stream) {
    const cameraId = document.getElementById('rickTeleprompterCamera')?.value;
    const microphoneId = document.getElementById('rickTeleprompterMic')?.value;
    scrPrepareTeleprompterMedia(cameraId, microphoneId);
  }
}

/**
 * Total video recorded across every take. Skipped scenes contribute nothing,
 * so this is what the combined video will actually run to.
 */
function scrTotalRecordedMs(state = rickState.teleprompter) {
  return state.clips.reduce((total, clip) => total + (clip?.durationMs || 0), 0);
}

/**
 * Stops an in-flight take and throws it away.
 *
 * The handlers come off before stop() because MediaRecorder fires onstop
 * asynchronously, and that handler writes the finished clip into
 * state.clips[activeIndex]. Left attached, an abandoned take would land back in
 * the state a restart had just cleared. Mirrors scrResetTeleprompter.
 */
function scrDiscardActiveRecorder(state = rickState.teleprompter) {
  const recorder = state.recorder;
  if (!recorder) return false;
  if (recorder.state !== 'inactive') {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    try { recorder.stop(); } catch (_) {}
  }
  state.recorder = null;
  state.chunks = [];
  clearInterval(state.timerId);
  state.timerId = null;
  // onstop normally resets the readout; it is not going to run.
  const timer = document.getElementById('rickTeleprompterTimer');
  if (timer) timer.textContent = '00:00';
  return true;
}

/**
 * Clears every take and returns to scene one. Distinct from
 * scrRerecordSelectedScene, which only replaces the take you are standing on.
 *
 * It deliberately does not start recording. This is a clear-the-decks action,
 * and opening the camera the instant a destructive confirm is accepted gives no
 * chance to re-frame. The combined video is left alone: it is a finished
 * artefact the server still holds, replaced by the next combine.
 */
async function scrDeleteAllTakes() {
  const state = rickState.teleprompter;
  if (state.combining || state.switchingDevices || state.switchingVersion || state.switchingLayout || !state.scenes.length) return;
  const recording = state.recorder?.state === 'recording';
  const hasTakes = state.clips.some(Boolean) || state.skipped.some(Boolean);
  if (!recording && !hasTakes) return;
  if (!confirm(recording
    ? 'Delete every take and start over?\n\nThe take in progress will stop and all recorded takes will be discarded. This cannot be undone.'
    : 'Delete every take and start over?\n\nAll recorded takes will be discarded. This cannot be undone.')) return;

  scrDiscardActiveRecorder(state);
  state.clips.forEach((clip) => { if (clip?.url) URL.revokeObjectURL(clip.url); });
  state.clips = new Array(state.scenes.length).fill(null);
  state.skipped = new Array(state.scenes.length).fill(false);
  state.activeIndex = 0;
  state.outputReady = false;
  state.takePreviewReady = false;
  state.scrollProgress = 0;
  state.scrollPaused = false;
  scrShowTeleprompterError();
  document.getElementById('rickTeleprompterOutputVideo')?.pause();
  scrRenderTeleprompter();

  // Combining releases the camera, so bring it back ready for the fresh run.
  if (!state.stream) {
    const cameraId = document.getElementById('rickTeleprompterCamera')?.value;
    const microphoneId = document.getElementById('rickTeleprompterMic')?.value;
    await scrPrepareTeleprompterMedia(cameraId, microphoneId);
  }
}

async function scrRerecordSelectedScene() {
  const state = rickState.teleprompter;
  const selectedIndex = state.activeIndex;
  const selectedScene = state.scenes[selectedIndex];
  if (state.combining || state.switchingDevices || state.switchingVersion || state.switchingLayout || state.outputReady || !selectedScene) return;
  const recording = state.recorder?.state === 'recording';
  const selectedClip = state.clips[selectedIndex];
  if (!recording && !selectedClip) return;
  if (!confirm(recording
    ? `Re-record scene ${selectedIndex + 1}?\n\nThe current take will stop and restart from this scene.`
    : `Re-record scene ${selectedIndex + 1}?\n\nOnly this scene's take will be replaced.`)) return;

  scrDiscardActiveRecorder(state);
  state.activeIndex = selectedIndex;
  state.outputReady = false;
  state.takePreviewReady = false;
  if (state.recordingMode === 'continuous') {
    state.scrollProgress = 0;
    state.scrollPaused = false;
  }
  scrShowTeleprompterError();
  document.getElementById('rickTeleprompterOutputVideo')?.pause();
  scrRenderTeleprompter();

  // Combining releases the camera, so the stream may need rebuilding first.
  if (!state.stream) {
    const cameraId = document.getElementById('rickTeleprompterCamera')?.value;
    const microphoneId = document.getElementById('rickTeleprompterMic')?.value;
    await scrPrepareTeleprompterMedia(cameraId, microphoneId);
  }
  scrStartSceneRecording({ stayOnScene: true });
}

function scrToggleSkipScene() {
  const state = rickState.teleprompter;
  if (state.recorder?.state === 'recording' || state.combining || state.switchingVersion || state.switchingLayout || !state.scenes[state.activeIndex]) return;
  const skipping = !state.skipped[state.activeIndex];
  const clip = state.clips[state.activeIndex];
  if (skipping && clip?.url) URL.revokeObjectURL(clip.url);
  if (skipping) state.clips[state.activeIndex] = null;
  state.skipped[state.activeIndex] = skipping;
  state.outputReady = false;
  if (skipping) {
    const nextIndex = state.clips.findIndex((item, index) => index > state.activeIndex && !item && !state.skipped[index]);
    const wrappedIndex = nextIndex === -1 ? state.clips.findIndex((item, index) => !item && !state.skipped[index]) : nextIndex;
    if (wrappedIndex >= 0) state.activeIndex = wrappedIndex;
  }
  scrRenderTeleprompter();
}

async function scrCombineRecording() {
  const state = rickState.teleprompter;
  const incomplete = state.scenes.some((_, index) => !state.clips[index] && !state.skipped[index]);
  if (state.combining || state.switchingVersion || state.switchingLayout || !state.scenes.length || incomplete || !state.clips.some(Boolean)) return;
  state.combining = true;
  scrShowTeleprompterError();
  scrRenderTeleprompter();
  const formData = new FormData();
  const recordedIndexes = [];
  const skippedIndexes = [];
  const framings = [];
  state.clips.forEach((clip, index) => {
    if (!clip) return;
    recordedIndexes.push(index);
    framings.push(scrNormalizeFraming(clip.framing));
    const extension = clip.blob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('scenes', clip.blob, `scene-${String(index + 1).padStart(3, '0')}.${extension}`);
  });
  state.skipped.forEach((skipped, index) => { if (skipped) skippedIndexes.push(index); });
  formData.append('recordedIndexes', JSON.stringify(recordedIndexes));
  formData.append('skippedIndexes', JSON.stringify(skippedIndexes));
  formData.append('framings', JSON.stringify(framings));
  formData.append('scriptVersionId', state.scriptVersionId || '');
  formData.append('sceneLayout', state.sceneLayout);
  formData.append('scenePlan', JSON.stringify(state.scenes.map(({ id, section, label, text }) => ({ id, section, label, text }))));
  try {
    const data = await rickRequest(`/sessions/${encodeURIComponent(state.sessionId)}/recordings/combine`, {
      method: 'POST',
      body: formData,
    });
    state.output = data.recording;
    state.outputReady = true;
    state.takePreviewReady = false;
    rickState.activeSession = data.session;
    scrReleaseTeleprompterMedia(state);
    await scrRefreshSessions();
    const outputVideo = document.getElementById('rickTeleprompterOutputVideo');
    if (outputVideo) {
      outputVideo.src = data.recording.url;
      outputVideo.load();
    }
    if (typeof showToast === 'function') showToast('Combined video ready', 'success');
  } catch (error) {
    scrShowTeleprompterError(error.message);
  } finally {
    state.combining = false;
    scrRenderTeleprompter();
  }
}

async function scrUseRecordingInReelMaster() {
  const state = rickState.teleprompter;
  const button = document.getElementById('rickReelVideo');
  if (!state.output?.url || typeof rmApi === 'undefined') return;
  let project = null;
  if (button) {
    button.disabled = true;
    button.textContent = 'Adding to Reel Master...';
  }
  try {
    const created = await rmApi.createProject({ name: `${rickState.activeSession?.title || 'Rick script'} recording` });
    project = created.project;
    if (!project?.id) throw new Error('Reel Master could not create a project');
    const response = await fetch(state.output.url);
    if (!response.ok) throw new Error('The combined video could not be opened');
    const blob = await response.blob();
    const formData = new FormData();
    formData.append('files', blob, state.output.filename || 'rick-recording.mp4');
    await rmApi.upload(project.id, formData);
    scrCloseTeleprompter();
    switchView('reelmaster');
    await rmOpenProject(project.id);
    if (typeof showToast === 'function') showToast('Recording added to Reel Master', 'success');
  } catch (error) {
    if (project?.id) await rmApi.deleteProject(project.id).catch(() => {});
    scrShowTeleprompterError(error.message || 'Rick could not add that video to Reel Master.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Use in Reel Master';
    }
  }
}

function scrSetBusy(busy, label = 'Rick is cooking') {
  rickState.busy = busy;
  const thinking = document.getElementById('rickThinking');
  const thinkingText = document.getElementById('rickThinkingText');
  thinking?.classList.toggle('visible', busy);
  if (thinkingText) thinkingText.textContent = label;
  const composer = document.getElementById('rickComposer');
  const send = document.getElementById('rickSendBtn');
  if (composer) composer.disabled = busy;
  if (send) send.disabled = busy;
  // Every control a render can stamp with `disabled = rickState.busy` must be
  // listed here, or it stays dead after a turn that re-rendered while busy.
  document.querySelectorAll('#rickFunnel button, .rick-idea-card, .rick-script-section button, .rick-critique-panel button, .rick-funnel-rewrite button, .rick-version-chip, .rick-funnel-choice, [data-rick-critique-trigger], [data-rick-duration], .rick-duration-fit, .rick-error-retry').forEach((button) => { button.disabled = busy; });
}

function scrShowError(message) {
  const error = document.getElementById('rickError');
  if (!error) return;
  error.replaceChildren();
  error.append(rickEl('span', 'rick-error-text', message));
  if (rickState.lastFailure) {
    const retry = rickEl('button', 'rick-error-retry', 'Retry');
    retry.type = 'button';
    retry.disabled = rickState.busy;
    retry.addEventListener('click', scrRetryFailure);
    error.append(retry);
  }
  error.classList.add('visible');
}

function scrClearError() {
  const error = document.getElementById('rickError');
  rickState.lastFailure = null;
  if (!error) return;
  error.replaceChildren();
  error.classList.remove('visible');
}

function scrComposerKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    scrSendMessage();
  }
}

function scrResizeComposer() {
  const composer = document.getElementById('rickComposer');
  if (!composer) return;
  composer.style.height = 'auto';
  composer.style.height = `${Math.min(composer.scrollHeight, 130)}px`;
}

function scrOpenSessions() {
  document.getElementById('rickShell')?.classList.add('drawer-open');
  scrRefreshSessions().catch(() => {});
}

function scrCloseSessions() {
  document.getElementById('rickShell')?.classList.remove('drawer-open');
}

function scrOpenProviderSettings() {
  if (typeof openSettingsModal === 'function') openSettingsModal();
  if (!rickState.provider?.ready && typeof prefillEnvKey === 'function') {
    setTimeout(() => prefillEnvKey('OPENAI_API_KEY'), 120);
  }
}
