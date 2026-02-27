/**
 * onboarding.js — 4-step welcome wizard for first-time users
 *
 * Shows on first launch (after setup) when localStorage key is missing and no tasks exist.
 * Steps: Welcome → How It Works → Quick Tour → Get Started
 */

const ONBOARDING_KEY = 'aiceo_onboarding_done';

function shouldShowOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY)) return false;
  // Show if tasks list is empty (fresh install)
  const board = document.getElementById('boardView');
  const taskCards = board ? board.querySelectorAll('.task-card') : [];
  return taskCards.length === 0;
}

function showOnboarding() {
  if (!shouldShowOnboarding()) return;

  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.id = 'onboardingOverlay';

  let currentStep = 0;
  const steps = [
    // Step 0: Welcome
    {
      html: `
        <div class="ob-welcome">
          <div class="ob-logo">AI CEO</div>
          <div class="ob-tagline">Your AI-Powered Studio</div>
          <p class="ob-desc">Automate tasks, create content, and run your business with AI agents — all from one dashboard.</p>
        </div>`
    },
    // Step 1: How It Works
    {
      html: `
        <div class="ob-how">
          <h3 class="ob-title">How It Works</h3>
          <div class="ob-steps-row">
            <div class="ob-step-card">
              <div class="ob-step-num">1</div>
              <div class="ob-step-icon">📝</div>
              <div class="ob-step-label">Create a Task</div>
              <div class="ob-step-desc">Describe what you need done in plain English</div>
            </div>
            <div class="ob-step-arrow">→</div>
            <div class="ob-step-card">
              <div class="ob-step-num">2</div>
              <div class="ob-step-icon">🤖</div>
              <div class="ob-step-label">AI Runs It</div>
              <div class="ob-step-desc">Claude Code executes your task autonomously</div>
            </div>
            <div class="ob-step-arrow">→</div>
            <div class="ob-step-card">
              <div class="ob-step-num">3</div>
              <div class="ob-step-icon">✅</div>
              <div class="ob-step-label">Review Results</div>
              <div class="ob-step-desc">See what was done and approve or iterate</div>
            </div>
          </div>
        </div>`
    },
    // Step 2: Quick Tour
    {
      html: `
        <div class="ob-tour">
          <h3 class="ob-title">Quick Tour</h3>
          <div class="ob-tour-grid">
            <div class="ob-tour-item">
              <span class="ob-tour-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </span>
              <div>
                <strong>Board</strong>
                <span class="ob-tour-desc">Create & manage AI tasks on a kanban board</span>
              </div>
            </div>
            <div class="ob-tour-item">
              <span class="ob-tour-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              </span>
              <div>
                <strong>Shell</strong>
                <span class="ob-tour-desc">Chat with AI agents in real-time terminals</span>
              </div>
            </div>
            <div class="ob-tour-item">
              <span class="ob-tour-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3m-9-9h3m12 0h3m-2.6-6.4l-2.1 2.1m-8.5 8.5l-2.1 2.1m0-12.7l2.1 2.1m8.5 8.5l2.1 2.1"/></svg>
              </span>
              <div>
                <strong>Workflows</strong>
                <span class="ob-tour-desc">Build multi-step automation flows visually</span>
              </div>
            </div>
            <div class="ob-tour-item">
              <span class="ob-tour-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
              </span>
              <div>
                <strong>Reel Master</strong>
                <span class="ob-tour-desc">Create short-form video reels with AI</span>
              </div>
            </div>
            <div class="ob-tour-item">
              <span class="ob-tour-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </span>
              <div>
                <strong>Scripter</strong>
                <span class="ob-tour-desc">Generate scripts from prompts or video URLs</span>
              </div>
            </div>
            <div class="ob-tour-item">
              <span class="ob-tour-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </span>
              <div>
                <strong>Create</strong>
                <span class="ob-tour-desc">AI avatar videos with HeyGen integration</span>
              </div>
            </div>
          </div>
        </div>`
    },
    // Step 3: Get Started
    {
      html: `
        <div class="ob-start">
          <h3 class="ob-title">Ready to Go!</h3>
          <p class="ob-desc">Choose how you'd like to start:</p>
          <div class="ob-start-actions">
            <button class="ob-action-btn ob-action-primary" onclick="finishOnboarding(); if (typeof openTaskMaster === 'function') openTaskMaster();">
              <span class="ob-action-icon">🎯</span>
              <span>
                <strong>Try Task Master</strong>
                <small>Describe a goal, get an AI plan</small>
              </span>
            </button>
            <button class="ob-action-btn" onclick="finishOnboarding(); if (typeof openAddModal === 'function') openAddModal();">
              <span class="ob-action-icon">➕</span>
              <span>
                <strong>Create a Task</strong>
                <small>Add a single task to the board</small>
              </span>
            </button>
            <button class="ob-action-btn ob-action-ghost" onclick="finishOnboarding();">
              <span>Explore on my own</span>
            </button>
          </div>
        </div>`
    }
  ];

  function render() {
    overlay.innerHTML = `
      <div class="ob-modal">
        <button class="ob-skip" onclick="finishOnboarding()">Skip</button>
        <div class="ob-dots">
          ${steps.map((_, i) => `<div class="ob-dot${i === currentStep ? ' active' : ''}"></div>`).join('')}
        </div>
        <div class="ob-content">${steps[currentStep].html}</div>
        <div class="ob-nav">
          ${currentStep > 0 ? '<button class="ob-nav-btn ob-back" id="obBack">Back</button>' : '<div></div>'}
          ${currentStep < steps.length - 1 ? '<button class="ob-nav-btn ob-next" id="obNext">Next</button>' : ''}
        </div>
      </div>`;

    const backBtn = overlay.querySelector('#obBack');
    const nextBtn = overlay.querySelector('#obNext');
    if (backBtn) backBtn.addEventListener('click', () => { currentStep--; render(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentStep++; render(); });
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.classList.add('active'); render(); });
}

function finishOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
}
