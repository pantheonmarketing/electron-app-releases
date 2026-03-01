/**
 * onboarding.js — 4-step welcome wizard for first-time users
 *
 * Shows on first launch (after setup) when localStorage key is missing and no tasks exist.
 * Steps: AI Memory → How It Works → Quick Tour → Get Started
 */

const ONBOARDING_KEY = 'aiceo_onboarding_done';
let _obPersona = {};

function handlePersonaPhoto(input, targetId) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const size = 150;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Crop to square center
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      _obPersona.photo = dataUrl;
      const target = document.getElementById(targetId);
      if (target) {
        target.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

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
    // Step 0: AI Memory — teach AI about your business
    {
      html: `
        <div class="ob-persona">
          <div class="ob-logo">AI CEO</div>
          <div class="ob-tagline">Let's personalize your AI</div>
          <p class="ob-desc" style="margin-bottom:18px;">Tell us a bit about you and your business. Your AI agents will use this on every task to give you better, more relevant results.</p>
          <div class="ob-form">
            <div class="ob-photo-row">
              <div class="persona-photo-upload" id="obPersonaPhoto" onclick="document.getElementById('obPhotoInput').click()" title="Add your photo">
                <span class="persona-photo-placeholder">+</span>
              </div>
              <input type="file" id="obPhotoInput" accept="image/*" style="display:none" onchange="handlePersonaPhoto(this, 'obPersonaPhoto')">
              <div class="ob-field" style="flex:1">
                <label>Your name</label>
                <input type="text" id="obPersonaName" placeholder="e.g. Sarah Chen" autocomplete="off">
              </div>
            </div>
            <div class="ob-field">
              <label>What's your business?</label>
              <textarea id="obPersonaBusiness" placeholder="e.g. I run a digital marketing agency for e-commerce brands" rows="2"></textarea>
            </div>
            <div class="ob-field">
              <label>Who's your audience?</label>
              <input type="text" id="obPersonaAudience" placeholder="e.g. Small business owners looking to grow online" autocomplete="off">
            </div>
            <div class="ob-field">
              <label>What tone should AI use?</label>
              <input type="text" id="obPersonaTone" placeholder="e.g. Friendly and professional, no jargon" autocomplete="off">
            </div>
            <div class="ob-field">
              <label>Anything else AI should know?</label>
              <textarea id="obPersonaExtra" placeholder="e.g. Based in Austin, TX. Main platforms: Instagram and TikTok" rows="2"></textarea>
            </div>
            <div class="ob-field" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
              <label>Project folder <span style="color:#555;font-weight:400;">(where your files live)</span></label>
              <input type="text" id="obWorkingDir" placeholder="e.g. C:\\Users\\you\\Projects\\my-app" autocomplete="off" style="font-size:12px;font-family:'SF Mono',Monaco,monospace;">
              <span style="font-size:11px;color:#666;margin-top:4px;display:block;">AI will always work from this folder. You can change it later in Space Settings.</span>
            </div>
          </div>
          <p class="ob-hint">You can always update this later in Space Settings.</p>
        </div>`,
      onLeave() {
        _obPersona = {
          ..._obPersona,
          name: (document.getElementById('obPersonaName') || {}).value?.trim() || '',
          business: (document.getElementById('obPersonaBusiness') || {}).value?.trim() || '',
          audience: (document.getElementById('obPersonaAudience') || {}).value?.trim() || '',
          tone: (document.getElementById('obPersonaTone') || {}).value?.trim() || '',
          extra: (document.getElementById('obPersonaExtra') || {}).value?.trim() || '',
          working_dir: (document.getElementById('obWorkingDir') || {}).value?.trim() || '',
        };
      },
      onEnter() {
        setTimeout(() => {
          const el = document.getElementById('obPersonaName');
          if (el) { el.value = _obPersona.name || ''; }
          const el2 = document.getElementById('obPersonaBusiness');
          if (el2) { el2.value = _obPersona.business || ''; }
          const el3 = document.getElementById('obPersonaAudience');
          if (el3) { el3.value = _obPersona.audience || ''; }
          const el4 = document.getElementById('obPersonaTone');
          if (el4) { el4.value = _obPersona.tone || ''; }
          const el5 = document.getElementById('obPersonaExtra');
          if (el5) { el5.value = _obPersona.extra || ''; }
          const el6 = document.getElementById('obWorkingDir');
          if (el6) { el6.value = _obPersona.working_dir || ''; }
          // Restore photo if already uploaded
          const photoEl = document.getElementById('obPersonaPhoto');
          if (photoEl && _obPersona.photo) {
            photoEl.innerHTML = `<img src="${_obPersona.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
          }
        }, 0);
      }
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

  let firstRender = true;
  function render() {
    // Save current step data before leaving (skip on first render — DOM not yet built)
    if (!firstRender && steps[currentStep] && steps[currentStep].onLeave) steps[currentStep].onLeave();
    firstRender = false;

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

    // Restore step data after rendering
    if (steps[currentStep] && steps[currentStep].onEnter) steps[currentStep].onEnter();

    const backBtn = overlay.querySelector('#obBack');
    const nextBtn = overlay.querySelector('#obNext');
    if (backBtn) backBtn.addEventListener('click', () => {
      if (steps[currentStep] && steps[currentStep].onLeave) steps[currentStep].onLeave();
      currentStep--;
      renderStep();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (steps[currentStep] && steps[currentStep].onLeave) steps[currentStep].onLeave();
      currentStep++;
      renderStep();
    });
  }

  function renderStep() {
    const content = overlay.querySelector('.ob-content');
    const dots = overlay.querySelectorAll('.ob-dot');
    const nav = overlay.querySelector('.ob-nav');
    if (content) content.innerHTML = steps[currentStep].html;
    dots.forEach((d, i) => d.classList.toggle('active', i === currentStep));
    if (nav) {
      nav.innerHTML = `
        ${currentStep > 0 ? '<button class="ob-nav-btn ob-back" id="obBack">Back</button>' : '<div></div>'}
        ${currentStep < steps.length - 1 ? '<button class="ob-nav-btn ob-next" id="obNext">Next</button>' : ''}`;
      const backBtn = nav.querySelector('#obBack');
      const nextBtn = nav.querySelector('#obNext');
      if (backBtn) backBtn.addEventListener('click', () => {
        if (steps[currentStep] && steps[currentStep].onLeave) steps[currentStep].onLeave();
        currentStep--;
        renderStep();
      });
      if (nextBtn) nextBtn.addEventListener('click', () => {
        if (steps[currentStep] && steps[currentStep].onLeave) steps[currentStep].onLeave();
        currentStep++;
        renderStep();
      });
    }
    if (steps[currentStep] && steps[currentStep].onEnter) steps[currentStep].onEnter();
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.classList.add('active'); render(); });
}

function _saveOnboardingPersona() {
  // Grab latest values from DOM if fields are still visible
  const nameEl = document.getElementById('obPersonaName');
  if (nameEl) {
    _obPersona = {
      ..._obPersona,
      name: nameEl.value.trim(),
      business: (document.getElementById('obPersonaBusiness') || {}).value?.trim() || '',
      audience: (document.getElementById('obPersonaAudience') || {}).value?.trim() || '',
      tone: (document.getElementById('obPersonaTone') || {}).value?.trim() || '',
      extra: (document.getElementById('obPersonaExtra') || {}).value?.trim() || '',
    };
  }
  const { photo, working_dir, ...textFields } = _obPersona;
  const hasData = Object.values(textFields).some(v => v) || working_dir;
  if (!hasData) return;
  // Save persona + working_dir to the default General space
  try {
    let spaces = JSON.parse(localStorage.getItem('claude-tm-spaces') || '[]');
    if (spaces.length === 0) {
      spaces = [{ id: 'general', name: 'General', project_id: null, working_dir: null, context: [], persona: null }];
    }
    const general = spaces.find(s => s.id === 'general') || spaces[0];
    general.persona = _obPersona;
    if (working_dir) general.working_dir = working_dir;
    localStorage.setItem('claude-tm-spaces', JSON.stringify(spaces));
  } catch (e) {
    console.error('[Onboarding] Failed to save persona:', e);
  }
}

function finishOnboarding() {
  _saveOnboardingPersona();
  // Refresh in-memory spaces so getActiveSpace() sees the new persona
  if (typeof loadSpaces === 'function') loadSpaces();
  localStorage.setItem(ONBOARDING_KEY, 'true');
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
}
