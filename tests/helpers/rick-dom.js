const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

/**
 * Shared jsdom harness for the Rick frontend. Loads the real public/js/scripter.js
 * so tests exercise shipped code rather than a copy of its logic.
 */

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', '..', 'public', 'js', 'scripter.js'), 'utf-8');

const FIXTURE = `
  <div id="rickProgress"></div>
  <div class="rick-funnel" id="rickFunnel">
    <span>Funnel</span>
    <button data-funnel="auto">Auto</button>
    <button data-funnel="tof">TOF</button>
    <button data-funnel="mof">MOF</button>
    <button data-funnel="bof">BOF</button>
  </div>
  <div class="rick-workspace" id="rickWorkspace">
    <div id="rickContextStrip"></div>
    <div id="rickMessages"></div>
    <div id="rickThinking"><p id="rickThinkingText"></p></div>
    <div id="rickError"></div>
    <textarea id="rickComposer"></textarea>
    <span id="rickComposerHint"></span>
    <button id="rickSendBtn"></button>
    <div id="rickScriptContent"></div>
    <div class="rick-script-footer"></div>
  </div>
  <div id="rickSessionList"></div>
`;

const SCRIPT = {
  hook: 'A hook', body: 'A body', conclusion: 'A conclusion',
  cta: 'Follow for more', caption: 'A caption.',
};

function makeCritique(overrides = {}) {
  return {
    criticCount: 1,
    critics: [{
      id: 'hook-doctor', name: 'Hook Doctor', focus: 'Hook strength',
      verdict: 'The payoff lands late.',
      strengths: ['Leads with a concrete stat'],
      improvements: ['Lead with the number first'],
    }],
    summary: 'Positive with a pacing note.',
    improvements: ['Lead with the number first'],
    disagreements: [],
    applied: false,
    createdAt: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    id: 'rick-1', title: 'Test', stage: 'ideas', funnel: 'auto', model: 'auto',
    brief: { niche: 'meal prep', audience: 'nurses', contentType: 'reels' },
    ideas: [], selectedIdea: null, script: null, critique: null, recording: null,
    completed: false, messages: [], createdAt: '', updatedAt: '',
    ...overrides,
  };
}

/**
 * Loads scripter.js the way a browser does, as a classic script, so top-level
 * `const` lands in the global lexical scope. It is not a property of window, so
 * state is read back through eval. A real origin is required because
 * scripter.js uses localStorage, which jsdom withholds on opaque origins.
 */
function loadRick(session) {
  const dom = new JSDOM(`<!doctype html><body>${FIXTURE}</body>`, {
    runScripts: 'dangerously',
    url: 'http://localhost:3456/',
    // scrRenderMessages calls requestAnimationFrame, which jsdom only provides
    // when it pretends to be visual. Without this a render throws and the
    // operation reports a false failure.
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.localStorage.setItem('rick_active_session_id', session?.id || 'rick-1');
  const element = window.document.createElement('script');
  element.textContent = SOURCE;
  window.document.body.appendChild(element);
  if (session) window.eval('rickState').activeSession = session;
  return {
    window,
    state: () => window.eval('rickState'),
    funnelButtons: () => [...window.document.querySelectorAll('#rickFunnel button')],
    button: (text) => [...window.document.querySelectorAll('button')].find((b) => b.textContent === text),
    // rickRequest only reads .ok and .json(), so a plain object is enough and
    // avoids depending on a fetch implementation jsdom does not ship.
    reply: (next) => async () => ({ ok: true, json: async () => ({ session: next }) }),
    setFetch: (fn) => { window.fetch = fn; },
  };
}

module.exports = { loadRick, makeSession, makeCritique, SCRIPT, FIXTURE };
