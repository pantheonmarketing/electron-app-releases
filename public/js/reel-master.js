// ════════════════════════════════════════════
// Reel Master
// ════════════════════════════════════════════

let rmProjects = [];
let rmCurrentProject = null;
let rmCurrentStep = 'upload';
let rmInitialized = false;
let rmCurrentTab = 'music';
let rmPreviewIdx = 0;
let rmPreviewTimer = null;
let rmPresets = [];

// ── API additions ──
const rmApi = {
  async listProjects() { return (await safeFetch('/api/reel/projects')).json(); },
  async createProject(d) { return (await safeFetch('/api/reel/projects', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
  async getProject(id) { return (await safeFetch(`/api/reel/projects/${id}`)).json(); },
  async updateProject(id,d) { return (await safeFetch(`/api/reel/projects/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
  async deleteProject(id) { return (await safeFetch(`/api/reel/projects/${id}`, { method:'DELETE' })).json(); },
  async upload(projectId, formData) {
    const r = await fetch(`/api/reel/projects/${projectId}/upload`, { method:'POST', body: formData });
    if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
    return r.json();
  },
  async whisper(projectId, clipId) { return (await safeFetch(`/api/reel/projects/${projectId}/whisper`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({clip_id: clipId}) })).json(); },
  async whisperStatus(jobId) { return (await safeFetch(`/api/reel/whisper-status/${jobId}`)).json(); },
  async generateScenes(projectId, opts) { return (await safeFetch(`/api/reel/projects/${projectId}/generate-scenes`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(opts||{}) })).json(); },
  async listPresets() { return (await safeFetch('/api/reel/presets')).json(); },
  async createPreset(d) { return (await safeFetch('/api/reel/presets', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) })).json(); },
  async deletePreset(id) { return (await safeFetch(`/api/reel/presets/${id}`, { method:'DELETE' })).json(); },
  async render(projectId, d) { return (await safeFetch(`/api/reel/projects/${projectId}/render`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d||{}) })).json(); },
  async imageSearch(query, source) { return (await safeFetch(`/api/reel/image-search?q=${encodeURIComponent(query)}&source=${source || 'pexels'}`)).json(); },
  async downloadImage(projectId, url, filename) { return (await safeFetch(`/api/reel/projects/${projectId}/download-image`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url, filename}) })).json(); },
  async previewStudio(projectId, d) { return (await safeFetch(`/api/reel/projects/${projectId}/preview-studio`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d||{}) })).json(); },
};

// ── Init & Project List ──
async function rmInit() {
  if (!rmInitialized) {
    rmInitialized = true;
  }
  rmLoadProjectList();
}

async function rmLoadProjectList() {
  try {
    rmProjects = await rmApi.listProjects();
  } catch (_) { rmProjects = []; }
  rmRenderProjectList();
}

function rmRenderProjectList() {
  const el = document.getElementById('rmProjectList');
  if (rmProjects.length === 0) {
    el.innerHTML = `<div class="rm-empty"><div class="rm-empty-icon">🎬</div><div class="rm-empty-text">No reels yet. Create your first one!</div></div>`;
    return;
  }
  el.innerHTML = rmProjects.map(p => `
    <div class="rm-project-card" onclick="rmOpenProject('${p.id}')">
      <div class="rm-project-card-actions">
        <button class="rm-project-card-btn" onclick="event.stopPropagation(); rmDeleteProject('${p.id}')" title="Delete">×</button>
      </div>
      <div class="rm-project-card-name">${esc(p.name)}</div>
      <div class="rm-project-card-meta">${p.clip_count} clip${p.clip_count !== 1 ? 's' : ''} · ${p.scene_count} scene${p.scene_count !== 1 ? 's' : ''} · ${new Date(p.updated_at).toLocaleDateString()}</div>
    </div>
  `).join('');
}

async function rmNewProject() {
  try {
    const res = await rmApi.createProject({ name: 'Untitled Reel' });
    rmCurrentProject = res.project;
    rmShowStudio();
  } catch (e) { showToast('Failed to create project: ' + e.message, 'error'); }
}

async function rmOpenProject(id) {
  try {
    rmCurrentProject = await rmApi.getProject(id);
    rmShowStudio();
  } catch (e) { showToast('Failed to open project: ' + e.message, 'error'); }
}

function rmShowStudio() {
  rmMigrateGlobalMfxToScenes();
  document.getElementById('rmLanding').style.display = 'none';
  document.getElementById('rmStudio').style.display = 'flex';
  document.getElementById('rmProjectName').value = rmCurrentProject.name;
  rmSyncModeToggle();
  rmCurrentStep = 'upload';
  rmGoStep('upload');
  rmRenderClips();
  // Check completion states
  rmUpdateStepStates();
}

function rmSetMode(mode) {
  if (!rmCurrentProject) return;
  const wasYoutube = rmCurrentProject.mode === 'youtube';
  rmCurrentProject.mode = mode;
  if (mode === 'youtube') {
    rmCurrentProject.output.width = 1920;
    rmCurrentProject.output.height = 1080;
  } else if (wasYoutube) {
    rmCurrentProject.output.width = 1080;
    rmCurrentProject.output.height = 1920;
  }
  rmSyncModeToggle();
  rmSaveProject();
  if (rmCurrentStep === 'customize') rmRenderCustomizeTab(rmCurrentTab);
  if (rmCurrentStep === 'preview') rmRenderPreview();
}

function rmSyncModeToggle() {
  const mode = (rmCurrentProject && rmCurrentProject.mode) || 'full';
  document.querySelectorAll('#rmModeToggle .rm-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function rmBackToList() {
  rmSaveProject();
  document.getElementById('rmStudio').style.display = 'none';
  document.getElementById('rmLanding').style.display = '';
  rmCurrentProject = null;
  if (rmPreviewTimer) { clearInterval(rmPreviewTimer); rmPreviewTimer = null; }
  rmLoadProjectList();
}

async function rmSaveProject() {
  if (!rmCurrentProject) return;
  rmCurrentProject.name = document.getElementById('rmProjectName').value || 'Untitled Reel';
  try {
    const res = await rmApi.updateProject(rmCurrentProject.id, rmCurrentProject);
    rmCurrentProject = res.project;
  } catch (e) { console.warn('Save failed:', e); }
}

async function rmDeleteProject(id) {
  if (!confirm('Delete this reel project and all its files?')) return;
  try {
    await rmApi.deleteProject(id);
    showToast('Project deleted', 'info');
    rmLoadProjectList();
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
}

// ── Step Navigation ──
function rmGoStep(step) {
  rmCurrentStep = step;
  document.querySelectorAll('#rmPanels .rm-panel').forEach(p => p.classList.remove('rm-panel-active'));
  const panel = document.getElementById('rmPanel' + step.charAt(0).toUpperCase() + step.slice(1));
  if (panel) panel.classList.add('rm-panel-active');

  // Update step indicators
  const steps = ['upload', 'whisper', 'scenes', 'customize', 'preview'];
  const stepLabels = { upload: 'Upload', whisper: 'Transcribe', scenes: 'Scenes', customize: 'Customize', preview: 'Preview' };
  const stepIdx = steps.indexOf(step) + 1;
  const progressEl = document.getElementById('rmStepProgress');
  if (progressEl) progressEl.textContent = `Step ${stepIdx} of ${steps.length} — ${stepLabels[step] || step}`;

  document.querySelectorAll('#rmSteps .rm-step').forEach(el => {
    const s = el.dataset.step;
    el.classList.remove('active');
    if (s === step) el.classList.add('active');
  });

  // Clean up animation replay timers when leaving
  if (step !== 'customize' && rmAnimReplayTimer) {
    clearInterval(rmAnimReplayTimer);
    rmAnimReplayTimer = null;
  }
  if (step !== 'preview' && rmPreviewAnimTimer) {
    clearInterval(rmPreviewAnimTimer);
    rmPreviewAnimTimer = null;
  }

  // Render step content
  if (step === 'whisper') rmRenderWhisperList();
  if (step === 'scenes') rmRenderTimeline();
  if (step === 'customize') { rmLoadPresets().then(() => rmRenderCustomizeTab(rmCurrentTab)); }
  if (step === 'preview') rmRenderPreview();

  rmUpdateStepStates();
}

function rmUpdateStepStates() {
  if (!rmCurrentProject) return;
  const clips = rmCurrentProject.clips || [];
  const videoClips = clips.filter(c => c.type === 'clip');
  const hasClips = videoClips.length > 0;
  const allTranscribed = hasClips && videoClips.every(c => c.whisper);
  const hasScenes = (rmCurrentProject.scenes || []).length > 0;

  // Enable/disable next buttons
  const nextWhisper = document.getElementById('rmNextWhisper');
  if (nextWhisper) nextWhisper.disabled = !hasClips;
  const nextScenes = document.getElementById('rmNextScenes');
  if (nextScenes) nextScenes.disabled = !allTranscribed;

  // Mark completed steps
  const steps = document.querySelectorAll('#rmSteps .rm-step');
  steps.forEach(el => {
    el.classList.remove('completed');
    const s = el.dataset.step;
    if (s === 'upload' && hasClips && rmCurrentStep !== 'upload') el.classList.add('completed');
    if (s === 'whisper' && allTranscribed && rmCurrentStep !== 'whisper') el.classList.add('completed');
    if (s === 'scenes' && hasScenes && rmCurrentStep !== 'scenes') el.classList.add('completed');
  });
}

// ── File Upload (Step 1) ──
async function rmHandleFiles(fileList) {
  if (!rmCurrentProject || !fileList || fileList.length === 0) return;
  const formData = new FormData();
  for (const f of fileList) formData.append('files', f);

  // Show progress
  const zone = document.getElementById('rmUploadZone');
  const origHTML = zone.innerHTML;
  zone.innerHTML = `<div class="rm-upload-progress"><div class="rm-upload-progress-text">Uploading ${fileList.length} file${fileList.length > 1 ? 's' : ''}...</div><div class="rm-upload-progress-bar"><div class="rm-upload-progress-fill" style="width:30%"></div></div></div>`;

  try {
    const res = await rmApi.upload(rmCurrentProject.id, formData);
    // Merge into current project
    rmCurrentProject.clips = rmCurrentProject.clips || [];
    res.files.forEach(f => rmCurrentProject.clips.push(f));
    showToast(`Uploaded ${res.files.length} file${res.files.length > 1 ? 's' : ''}`, 'success');
    rmRenderClips();
    rmUpdateStepStates();
  } catch (e) {
    showToast('Upload failed: ' + e.message, 'error');
  }

  zone.innerHTML = origHTML;
}

function rmRenderClips() {
  if (!rmCurrentProject) return;
  const clips = rmCurrentProject.clips || [];
  const el = document.getElementById('rmClipList');
  if (clips.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = clips.map(c => {
    const name = c.filename || c.path?.split('/').pop() || 'untitled';
    let thumbHTML = '';
    if (c.type === 'clip') {
      thumbHTML = `<video src="/${c.path}" preload="metadata" muted></video>`;
    } else if (c.type === 'image') {
      thumbHTML = `<img src="/${c.path}" alt="${esc(name)}">`;
    } else {
      thumbHTML = `<span class="placeholder">🎵</span>`;
    }
    const sizeStr = c.size ? (c.size > 1024*1024 ? (c.size/1024/1024).toFixed(1) + ' MB' : (c.size/1024).toFixed(0) + ' KB') : '';
    return `
      <div class="rm-clip-card">
        <button class="rm-clip-remove" onclick="rmRemoveClip('${c.id || ''}')" title="Remove">×</button>
        <div class="rm-clip-thumb">${thumbHTML}</div>
        <div class="rm-clip-name" title="${esc(name)}">${esc(name)}</div>
        <div class="rm-clip-meta">${sizeStr}</div>
        <span class="rm-clip-type ${c.type}">${c.type}</span>
      </div>
    `;
  }).join('');
}

function rmRemoveClip(clipId) {
  if (!rmCurrentProject) return;
  rmCurrentProject.clips = (rmCurrentProject.clips || []).filter(c => c.id !== clipId);
  // Also remove scenes referencing this clip
  rmCurrentProject.scenes = (rmCurrentProject.scenes || []).filter(s => s.clip_id !== clipId);
  rmRenderClips();
  rmSaveProject();
  rmUpdateStepStates();
}

// ── Whisper (Step 2) ──
function rmRenderWhisperList() {
  if (!rmCurrentProject) return;
  const clips = (rmCurrentProject.clips || []).filter(c => c.type === 'clip');
  const el = document.getElementById('rmWhisperList');

  if (clips.length === 0) {
    el.innerHTML = '<div class="rm-scene-empty">No video clips to transcribe. Go back and upload some clips first.</div>';
    return;
  }

  el.innerHTML = clips.map(c => {
    const hasWhisper = !!c.whisper;
    const wordCount = hasWhisper ? (c.whisper.segments || []).reduce((sum, s) => sum + (s.words || []).length, 0) : 0;
    let statusHTML = '';
    if (hasWhisper) {
      statusHTML = `<span class="badge-done">✓ Done</span> — ${wordCount} words`;
    } else {
      statusHTML = `<span style="color:#888;">Not transcribed</span>`;
    }
    return `
      <div class="rm-whisper-card" id="rmWhisperCard-${c.id}">
        <div class="rm-whisper-card-icon">🎬</div>
        <div class="rm-whisper-card-info">
          <div class="rm-whisper-card-name">${esc(c.filename)}</div>
          <div class="rm-whisper-card-status">${statusHTML}</div>
        </div>
      </div>
    `;
  }).join('');

  // Update buttons
  const allDone = clips.every(c => c.whisper);
  const btn = document.getElementById('rmTranscribeAllBtn');
  if (btn) btn.disabled = allDone;
  if (allDone && btn) btn.textContent = '✓ All Transcribed';
}

async function rmTranscribeAll() {
  if (!rmCurrentProject) return;
  const clips = (rmCurrentProject.clips || []).filter(c => c.type === 'clip' && !c.whisper);
  if (clips.length === 0) { showToast('All clips already transcribed', 'info'); return; }

  for (const clip of clips) {
    await rmStartWhisper(clip.id);
  }
  // Re-fetch project from server to ensure we have the latest whisper data
  try {
    rmCurrentProject = await rmApi.getProject(rmCurrentProject.id);
  } catch (_) {}
  rmRenderWhisperList();
  rmUpdateStepStates();
}

async function rmStartWhisper(clipId) {
  const card = document.getElementById('rmWhisperCard-' + clipId);
  if (!card) return;

  // Show processing state
  const statusEl = card.querySelector('.rm-whisper-card-status');
  statusEl.innerHTML = '<span style="color:#C084FC;">Processing...</span>';
  const progWrap = document.createElement('div');
  progWrap.className = 'rm-whisper-card-progress';
  progWrap.innerHTML = '<div class="rm-whisper-card-progress-fill" style="width:0%"></div>';
  card.querySelector('.rm-whisper-card-info').appendChild(progWrap);

  try {
    const res = await rmApi.whisper(rmCurrentProject.id, clipId);
    if (res.status === 'cached') {
      // Re-fetch project from server (server already saved whisper data)
      try {
        rmCurrentProject = await rmApi.getProject(rmCurrentProject.id);
      } catch (_) {
        // Fallback: update local state manually
        const clip = rmCurrentProject.clips.find(c => c.id === clipId);
        if (clip) clip.whisper = res.result;
      }
      statusEl.innerHTML = '<span class="badge-cached">⚡ Cached</span>';
      progWrap.remove();
      rmRenderWhisperList();
      return;
    }

    // Poll for progress
    await new Promise((resolve) => {
      const poll = setInterval(async () => {
        try {
          const status = await rmApi.whisperStatus(res.job_id);
          const fill = progWrap.querySelector('.rm-whisper-card-progress-fill');
          if (fill) fill.style.width = status.progress + '%';

          if (status.status === 'done') {
            clearInterval(poll);
            // Re-fetch project from server (server already saved whisper data)
            try {
              rmCurrentProject = await rmApi.getProject(rmCurrentProject.id);
            } catch (_) {
              const clip = rmCurrentProject.clips.find(c => c.id === clipId);
              if (clip) clip.whisper = status.result;
            }
            statusEl.innerHTML = '<span class="badge-done">✓ Done</span>';
            progWrap.remove();
            rmRenderWhisperList();
            resolve();
          } else if (status.status === 'error') {
            clearInterval(poll);
            statusEl.innerHTML = `<span class="badge-error">✗ ${esc(status.error || 'Error')}</span>`;
            progWrap.remove();
            resolve();
          }
        } catch (_) {}
      }, 2000);
    });
  } catch (e) {
    statusEl.innerHTML = `<span class="badge-error">✗ ${esc(e.message)}</span>`;
    progWrap.remove();
  }
}

// ── Scene Builder (Step 3) ──
async function rmGenerateScenes() {
  if (!rmCurrentProject) return;
  try {
    const res = await rmApi.generateScenes(rmCurrentProject.id, { max_words_per_scene: 8 });
    if (res.scenes.length === 0 && res.debug) {
      const d = res.debug;
      let hint = '';
      if (d.clips_with_whisper === 0) hint = 'No transcribed clips found. Go back and transcribe first.';
      else if (d.segments_found === 0) hint = 'Whisper data has no segments. Try re-transcribing.';
      else if (d.words_found === 0 && !d.fallback_used) hint = 'No speech detected in the audio.';
      showToast(`0 scenes generated. ${hint}`, 'error');
      console.warn('[ReelMaster] Scene generation debug:', res.debug);
    } else {
      showToast(`Generated ${res.scenes.length} scenes`, 'success');
    }
    // Re-fetch full project from server to get the freshly written scenes
    // This prevents any stale local save from overwriting them
    rmCurrentProject = await rmApi.getProject(rmCurrentProject.id);
    rmRenderTimeline();
    rmUpdateStepStates();
  } catch (e) { showToast('Failed to generate scenes: ' + e.message, 'error'); }
}

function rmRegenerateScenes() {
  if (!rmCurrentProject) return;
  const count = (rmCurrentProject.scenes || []).length;
  if (count > 0 && !confirm(`This will replace all ${count} existing scenes. Are you sure?`)) return;
  rmGenerateScenes();
}

function rmRenderTimeline() {
  if (!rmCurrentProject) return;
  const scenes = rmCurrentProject.scenes || [];
  const el = document.getElementById('rmTimeline');
  // Show/hide regenerate button
  const regenBtn = document.getElementById('rmRegenBtn');
  if (regenBtn) regenBtn.style.display = scenes.length > 0 ? '' : 'none';

  if (scenes.length === 0) {
    el.innerHTML = '<div class="rm-scene-empty">No scenes yet. Click "Auto-Generate" to create scenes from your transcriptions, or go back and transcribe your clips first.</div>';
    return;
  }

  el.innerHTML = scenes.map((s, i) => {
    const timeStart = s.start != null ? s.start.toFixed(1) : '?';
    const timeEnd = s.end != null ? s.end.toFixed(1) : '?';
    const hasSceneImages = (s.images || []).length > 0;
    const imagesHTML = hasSceneImages
      ? `<div class="rm-scene-images">${s.images.map((img, imgIdx) => `<div class="rm-scene-img-wrap"><img class="rm-scene-img-thumb" src="/${img}"><button class="rm-scene-img-remove" onclick="event.stopPropagation(); rmRemoveSceneImage(${i}, ${imgIdx})" title="Remove image">&times;</button></div>`).join('')}</div>`
      : '';
    const imgControlsHTML = hasSceneImages ? `<div class="rm-scene-img-controls">
      <div class="rm-img-pos-chips">
        <button class="rm-chip ${(s.img_position || 'top') === 'top' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgPosition(${i}, 'top')">Top</button>
        <button class="rm-chip ${s.img_position === 'center' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgPosition(${i}, 'center')">Center</button>
        <button class="rm-chip ${s.img_position === 'bottom' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgPosition(${i}, 'bottom')">Bottom</button>
        <button class="rm-chip ${s.img_position === 'full' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgPosition(${i}, 'full')">Full</button>
      </div>
      <div class="rm-img-border-chips">
        <button class="rm-chip ${(s.img_border || 'none') === 'none' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgBorder(${i}, 'none')">None</button>
        <button class="rm-chip ${s.img_border === 'rounded' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgBorder(${i}, 'rounded')">Rounded</button>
        <button class="rm-chip ${s.img_border === 'shadow' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgBorder(${i}, 'shadow')">Shadow</button>
        <button class="rm-chip ${s.img_border === 'frame' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgBorder(${i}, 'frame')">Frame</button>
        <button class="rm-chip ${s.img_border === 'glow' ? 'active' : ''}" onclick="event.stopPropagation(); rmSetImgBorder(${i}, 'glow')">Glow</button>
      </div>
    </div>` : '';
    const brollHTML = (s.broll || []).length > 0
      ? `<div class="rm-scene-images">${s.broll.map((vid, vidIdx) => `<div class="rm-scene-img-wrap"><video class="rm-scene-img-thumb" src="/${vid}" muted></video><div class="rm-scene-broll-badge">B-roll</div><button class="rm-scene-img-remove" onclick="event.stopPropagation(); rmRemoveSceneBroll(${i}, ${vidIdx})" title="Remove B-roll">&times;</button></div>`).join('')}</div>`
      : '';
    const overlayVal = s.text_overlay || '';
    const hasOriginal = s.original_text && (s.text !== s.original_text || (s.text_overlay && s.text_overlay !== s.original_text));
    return `
      <div class="rm-scene-block" draggable="true"
           ondragstart="rmSceneDragStart(event, ${i})"
           ondragover="event.preventDefault(); this.classList.add('drop-target')"
           ondragleave="this.classList.remove('drop-target')"
           ondrop="event.preventDefault(); this.classList.remove('drop-target'); rmSceneDrop(event, ${i})">
        <div class="rm-scene-num">${i + 1}</div>
        <div class="rm-scene-body">
          <div class="rm-scene-text" contenteditable="true"
               onblur="rmUpdateSceneText(${i}, this.textContent)"
               onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">${esc(s.text)}</div>
          <div class="rm-scene-time">${timeStart}s — ${timeEnd}s</div>
          ${imagesHTML}
          ${imgControlsHTML}
          ${brollHTML}
          <div class="rm-scene-overlay-row">
            <input class="rm-scene-overlay-input" placeholder="Text overlay (optional)..."
                   value="${esc(overlayVal)}"
                   onchange="rmUpdateSceneOverlay(${i}, this.value)"
                   style="flex:1;">
            ${hasOriginal ? `<button class="rm-scene-undo-btn" onclick="rmUndoSceneText(${i})" title="Undo to original text">↩</button>` : ''}
          </div>
          <div class="rm-scene-display-row">
            <div class="rm-scene-mode-toggle">
              <button class="rm-scene-mode-btn ${(s.display_mode || 'subtitles') === 'subtitles' ? 'active' : ''}" onclick="event.stopPropagation(); rmUpdateSceneDisplayMode(${i}, 'subtitles')">Subtitles</button>
              <button class="rm-scene-mode-btn ${(s.display_mode || 'subtitles') === 'mfx' ? 'active' : ''}" onclick="event.stopPropagation(); rmUpdateSceneDisplayMode(${i}, 'mfx')">Motion GFX</button>
              <button class="rm-scene-mode-btn ${s.display_mode === 'none' ? 'active' : ''}" onclick="event.stopPropagation(); rmUpdateSceneDisplayMode(${i}, 'none')">No Text</button>
            </div>
            ${(s.display_mode === 'mfx') ? `
            <div class="rm-scene-mfx-chips">
              ${RM_MFX_PRESETS.filter(m => m.id !== 'none').map(m => `<div class="rm-scene-mfx-chip ${(s.mfx_preset || 'none') === m.id ? 'active' : ''}" title="${m.name}" onclick="event.stopPropagation(); rmUpdateSceneMfx(${i}, '${m.id}')">${m.icon}</div>`).join('')}
            </div>
            <input class="rm-scene-mfx-instructions" placeholder="Instructions (e.g. 'animated text reveal' or 'progress bar fills')..." value="${esc(s.mfx_instructions || '')}" onchange="rmUpdateSceneMfxInstructions(${i}, this.value)" onclick="event.stopPropagation();">
            ` : ''}
          </div>
        </div>
        <div class="rm-scene-actions" draggable="false" onmousedown="event.stopPropagation();" ondragstart="event.preventDefault(); event.stopPropagation();">
          <button class="rm-scene-btn" onclick="event.stopPropagation(); rmOpenImageSearch(${i})" title="Search images">🔍</button>
          <button class="rm-scene-btn" title="Upload image" onclick="event.stopPropagation(); rmAttachImage(${i})">🖼</button>
          <button class="rm-scene-btn" title="Add B-roll video" onclick="event.stopPropagation(); rmAttachBroll(${i})">🎬</button>
          <button class="rm-scene-btn" onclick="rmSplitScene(${i})" title="Split">${i < scenes.length ? '✂' : ''}</button>
          <button class="rm-scene-btn" onclick="rmMergeScene(${i})" title="Merge with next">⊕</button>
          <button class="rm-scene-btn" onclick="rmDeleteScene(${i})" title="Delete" style="color:#F87171;">×</button>
        </div>
      </div>
    `;
  }).join('');
}

let rmDragSceneIdx = null;
function rmSceneDragStart(e, idx) { rmDragSceneIdx = idx; e.dataTransfer.effectAllowed = 'move'; }
function rmSceneDrop(e, targetIdx) {
  if (rmDragSceneIdx === null || rmDragSceneIdx === targetIdx) return;
  const scenes = rmCurrentProject.scenes;
  const [moved] = scenes.splice(rmDragSceneIdx, 1);
  scenes.splice(targetIdx, 0, moved);
  rmDragSceneIdx = null;
  rmRenderTimeline();
  rmSaveProject();
}

function rmUpdateSceneText(idx, value) {
  if (!rmCurrentProject || !rmCurrentProject.scenes[idx]) return;
  const scene = rmCurrentProject.scenes[idx];
  const trimmed = value.trim();
  if (trimmed === scene.text) return; // no change
  // Store original for undo (only on first edit)
  if (!scene.original_text) {
    scene.original_text = scene.text;
  }
  scene.text = trimmed;
  rmSaveProject();
}

function rmUpdateSceneOverlay(idx, value) {
  if (!rmCurrentProject || !rmCurrentProject.scenes[idx]) return;
  const scene = rmCurrentProject.scenes[idx];
  // Store original text on first edit if not already set
  if (!scene.original_text && scene.text_overlay) {
    scene.original_text = scene.text_overlay;
  } else if (!scene.original_text && !scene.text_overlay && scene.text) {
    scene.original_text = scene.text;
  }
  scene.text_overlay = value;
  rmRenderTimeline();
  rmSaveProject();
}

function rmUpdateSceneDisplayMode(idx, mode) {
  if (!rmCurrentProject || !rmCurrentProject.scenes[idx]) return;
  rmCurrentProject.scenes[idx].display_mode = mode;
  if (mode === 'mfx' && !rmCurrentProject.scenes[idx].mfx_opacity) {
    rmCurrentProject.scenes[idx].mfx_opacity = 0.5;
  }
  rmRenderTimeline();
  rmSaveProject();
}

function rmUpdateSceneMfx(idx, preset) {
  if (!rmCurrentProject || !rmCurrentProject.scenes[idx]) return;
  const scene = rmCurrentProject.scenes[idx];
  // Toggle off if clicking the already-active preset
  scene.mfx_preset = (scene.mfx_preset === preset) ? 'none' : preset;
  if (!scene.mfx_opacity) scene.mfx_opacity = 0.5;
  rmRenderTimeline();
  rmSaveProject();
}

function rmUpdateSceneMfxInstructions(idx, value) {
  if (!rmCurrentProject || !rmCurrentProject.scenes[idx]) return;
  rmCurrentProject.scenes[idx].mfx_instructions = value;
  rmSaveProject();
}

function rmMigrateGlobalMfxToScenes() {
  if (!rmCurrentProject) return;
  const scenes = rmCurrentProject.scenes || [];
  if (scenes.length === 0) return;
  let changed = false;
  // Set display_mode based on images (no image = mfx, has image = subtitles)
  scenes.forEach(s => {
    if (!s.display_mode) {
      const hasImages = s.images && s.images.length > 0;
      s.display_mode = hasImages ? 'subtitles' : 'mfx';
      s.mfx_preset = 'none'; // default: no preset, just instructions
      changed = true;
    }
  });
  // Clear old global MFX setting if present (don't copy it to scenes)
  const globalMfx = rmCurrentProject.style?.motionGraphics;
  if (globalMfx) {
    delete rmCurrentProject.style.motionGraphics;
    changed = true;
  }
  if (changed) rmSaveProject();
}

function rmSplitScene(idx) {
  if (!rmCurrentProject) return;
  const scene = rmCurrentProject.scenes[idx];
  if (!scene || !scene.words || scene.words.length < 2) return;
  const mid = Math.floor(scene.words.length / 2);
  const words1 = scene.words.slice(0, mid);
  const words2 = scene.words.slice(mid);
  const scene1 = { ...scene, id: 'scene-' + Date.now() + 'a', words: words1, text: words1.map(w => w.word).join(' '), end: words1[words1.length - 1].end + 0.15, images: [], text_overlay: '' };
  const scene2 = { ...scene, id: 'scene-' + Date.now() + 'b', words: words2, text: words2.map(w => w.word).join(' '), start: words2[0].start, images: [], text_overlay: '' };
  rmCurrentProject.scenes.splice(idx, 1, scene1, scene2);
  rmRenderTimeline();
  rmSaveProject();
}

function rmMergeScene(idx) {
  if (!rmCurrentProject) return;
  const scenes = rmCurrentProject.scenes;
  if (idx >= scenes.length - 1) return;
  const a = scenes[idx], b = scenes[idx + 1];
  const merged = {
    id: 'scene-' + Date.now(),
    clip_id: a.clip_id,
    start: a.start,
    end: b.end,
    words: [...(a.words || []), ...(b.words || [])],
    text: (a.text + ' ' + b.text).trim(),
    images: [...(a.images || []), ...(b.images || [])],
    text_overlay: a.text_overlay || b.text_overlay || '',
    display_mode: a.display_mode || b.display_mode || 'subtitles',
    mfx_preset: a.mfx_preset || b.mfx_preset || 'none',
    mfx_opacity: a.mfx_opacity ?? b.mfx_opacity ?? 0.5,
    mfx_instructions: a.mfx_instructions || b.mfx_instructions || ''
  };
  scenes.splice(idx, 2, merged);
  rmRenderTimeline();
  rmSaveProject();
}

function rmDeleteScene(idx) {
  if (!rmCurrentProject) return;
  rmCurrentProject.scenes.splice(idx, 1);
  rmRenderTimeline();
  rmSaveProject();
  rmUpdateStepStates();
}

let _rmAttachSceneIdx = -1;
// Persistent file input outside any draggable container
const _rmFileInput = document.createElement('input');
_rmFileInput.type = 'file';
_rmFileInput.accept = 'image/*';
_rmFileInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
document.body.appendChild(_rmFileInput);
_rmFileInput.addEventListener('change', async () => {
  if (!_rmFileInput.files[0] || _rmAttachSceneIdx < 0) return;
  const formData = new FormData();
  formData.append('files', _rmFileInput.files[0]);
  try {
    const res = await rmApi.upload(rmCurrentProject.id, formData);
    if (res.files && res.files[0]) {
      const scene = rmCurrentProject.scenes[_rmAttachSceneIdx];
      if (!scene.images) scene.images = [];
      scene.images.push(res.files[0].path);
      rmCurrentProject.clips.push(res.files[0]);
      rmRenderTimeline();
      rmSaveProject();
    }
  } catch (e) { showToast('Image upload failed: ' + e.message, 'error'); }
  _rmFileInput.value = '';
});

function rmAttachImage(sceneIdx) {
  _rmAttachSceneIdx = sceneIdx;
  _rmFileInput.value = '';
  _rmFileInput.click();
}

function rmRemoveSceneImage(sceneIdx, imgIdx) {
  if (!rmCurrentProject) return;
  const scene = rmCurrentProject.scenes[sceneIdx];
  if (!scene || !scene.images) return;
  scene.images.splice(imgIdx, 1);
  rmRenderTimeline();
  rmSaveProject();
}

// ── Per-Scene Image Position & Border ──
function rmSetImgPosition(sceneIdx, position) {
  if (!rmCurrentProject || !rmCurrentProject.scenes[sceneIdx]) return;
  rmCurrentProject.scenes[sceneIdx].img_position = position;
  rmRenderTimeline();
  rmSaveProject();
  if (rmCurrentStep === 'customize') rmRenderCustomizeTab(rmCurrentTab);
  if (rmCurrentStep === 'preview') rmRenderPreview();
}

function rmSetImgBorder(sceneIdx, border) {
  if (!rmCurrentProject || !rmCurrentProject.scenes[sceneIdx]) return;
  rmCurrentProject.scenes[sceneIdx].img_border = border;
  rmRenderTimeline();
  rmSaveProject();
  if (rmCurrentStep === 'customize') rmRenderCustomizeTab(rmCurrentTab);
  if (rmCurrentStep === 'preview') rmRenderPreview();
}

function rmGetImgStyle(scene, isFullMode) {
  const pos = (scene && scene.img_position) || 'top';
  const border = (scene && scene.img_border) || 'none';
  const hasBorder = border !== 'none';
  const sz = hasBorder ? '92%' : '100%';
  const margin = hasBorder ? '4%' : '0';

  let posCSS = '';
  if (isFullMode) {
    switch (pos) {
      case 'top':    posCSS = `position:absolute; top:0; left:0; width:${sz}; height:50%; z-index:2;`; break;
      case 'center': posCSS = `position:absolute; top:25%; left:0; width:${sz}; height:50%; z-index:2;`; break;
      case 'bottom': posCSS = `position:absolute; bottom:0; left:0; width:${sz}; height:50%; z-index:2;`; break;
      case 'full':   posCSS = `position:absolute; top:0; left:0; width:${sz}; height:${sz}; z-index:2;`; break;
      default:       posCSS = `position:absolute; top:0; left:0; width:${sz}; height:50%; z-index:2;`;
    }
    if (hasBorder) posCSS += ` margin:${margin};`;
  } else {
    posCSS = 'width:100%; height:100%;';
  }

  let borderCSS = '';
  switch (border) {
    case 'rounded': borderCSS = 'border-radius:16px;'; break;
    case 'shadow':  borderCSS = 'border-radius:12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);'; break;
    case 'frame':   borderCSS = 'border: 3px solid rgba(255,255,255,0.15); border-radius:8px;'; break;
    case 'glow':    borderCSS = 'border-radius:12px; box-shadow: 0 0 20px rgba(123,47,242,0.5);'; break;
  }

  return { posCSS, borderCSS, hasBorder };
}

// ── B-roll Video per Scene ──
let _rmBrollSceneIdx = -1;
const _rmBrollInput = document.createElement('input');
_rmBrollInput.type = 'file';
_rmBrollInput.accept = 'video/mp4,video/quicktime,video/webm,video/x-matroska';
_rmBrollInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
document.body.appendChild(_rmBrollInput);
_rmBrollInput.addEventListener('change', async () => {
  if (!_rmBrollInput.files[0] || _rmBrollSceneIdx < 0) return;
  const formData = new FormData();
  formData.append('files', _rmBrollInput.files[0]);
  try {
    const res = await rmApi.upload(rmCurrentProject.id, formData);
    if (res.files && res.files[0]) {
      const scene = rmCurrentProject.scenes[_rmBrollSceneIdx];
      if (!scene.broll) scene.broll = [];
      scene.broll.push(res.files[0].path);
      rmCurrentProject.clips.push(res.files[0]);
      rmRenderTimeline();
      rmSaveProject();
    }
  } catch (e) { showToast('B-roll upload failed: ' + e.message, 'error'); }
  _rmBrollInput.value = '';
});

function rmAttachBroll(sceneIdx) {
  _rmBrollSceneIdx = sceneIdx;
  _rmBrollInput.value = '';
  _rmBrollInput.click();
}

function rmRemoveSceneBroll(sceneIdx, brollIdx) {
  if (!rmCurrentProject) return;
  const scene = rmCurrentProject.scenes[sceneIdx];
  if (!scene || !scene.broll) return;
  scene.broll.splice(brollIdx, 1);
  rmRenderTimeline();
  rmSaveProject();
}

// ── Image Search (Pexels) ──
let rmImageSearchSceneIdx = null;

function rmOpenImageSearch(sceneIdx) {
  rmImageSearchSceneIdx = sceneIdx;
  document.getElementById('rmImgSearchBackdrop').classList.add('open');
  document.getElementById('rmImgSearchModal').classList.add('open');
  const input = document.getElementById('rmImgSearchInput');
  input.value = '';
  input.focus();
  // Pre-fill search with scene text if available
  const scene = rmCurrentProject && rmCurrentProject.scenes[sceneIdx];
  if (scene && scene.text) {
    const words = scene.text.split(/\s+/).slice(0, 3).join(' ');
    input.value = words;
  }
  document.getElementById('rmImgSearchGrid').innerHTML = '<div class="rm-img-search-empty">Type a keyword and press Enter to search</div>';
}

function rmCloseImageSearch() {
  rmImageSearchSceneIdx = null;
  document.getElementById('rmImgSearchBackdrop').classList.remove('open');
  document.getElementById('rmImgSearchModal').classList.remove('open');
}

let rmSearchResults = [];
let rmImageSource = 'pexels';

function rmSwitchImageSource(source) {
  rmImageSource = source;
  document.querySelectorAll('.rm-img-source-tab').forEach(t => {
    const tabSource = t.textContent.toLowerCase().replace('ai generate', 'ai');
    t.classList.toggle('active', tabSource === source);
  });
  const input = document.getElementById('rmImgSearchInput');
  const grid = document.getElementById('rmImgSearchGrid');
  if (source === 'ai') {
    input.placeholder = 'Describe the image you want to create...';
    grid.innerHTML = '<div class="rm-img-search-empty">Describe your image and press Enter to generate with AI</div>';
  } else {
    input.placeholder = 'Search images...';
    // Auto-search if there's already a query
    const query = input.value.trim();
    if (query) rmSearchImages();
  }
}

async function rmSearchImages() {
  const query = document.getElementById('rmImgSearchInput').value.trim();
  if (!query) return;

  // AI Generate mode
  if (rmImageSource === 'ai') {
    return rmGenerateAIImage(query);
  }

  const grid = document.getElementById('rmImgSearchGrid');
  grid.innerHTML = `<div class="rm-img-search-loading">Searching ${rmImageSource}...</div>`;
  try {
    const res = await rmApi.imageSearch(query, rmImageSource);
    if (!res.ok) {
      grid.innerHTML = `<div class="rm-img-search-empty">${esc(res.error || 'Search failed')}</div>`;
      return;
    }
    if (!res.results || res.results.length === 0) {
      grid.innerHTML = '<div class="rm-img-search-empty">No results found. Try different keywords.</div>';
      return;
    }
    rmSearchResults = res.results;
    grid.innerHTML = res.results.map((r, idx) => `
      <div class="rm-img-search-item" onclick="rmSelectSearchImage(${idx})">
        <img src="${esc(r.thumb)}" alt="${esc(r.alt || query)}" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div class="credit">${esc(r.photographer || r.source || '')}</div>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div class="rm-img-search-empty">Error: ${esc(e.message)}</div>`;
  }
}

async function rmGenerateAIImage(prompt) {
  if (!rmCurrentProject) return;
  const grid = document.getElementById('rmImgSearchGrid');
  grid.innerHTML = '<div class="rm-img-search-loading" style="text-align:center;padding:40px 20px;"><div style="font-size:28px;margin-bottom:12px;">&#129302;</div>Generating image with AI...<br><span style="font-size:12px;opacity:0.6;">This may take 15-30 seconds</span></div>';
  try {
    const res = await (await safeFetch(`/api/reel/projects/${rmCurrentProject.id}/generate-image`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ prompt })
    })).json();
    if (!res.ok) {
      grid.innerHTML = `<div class="rm-img-search-empty">${esc(res.error || 'Generation failed')}</div>`;
      return;
    }
    // Show the generated image as a clickable result — clip is already saved server-side
    rmSearchResults = [{ url: res.url, thumb: res.url, alt: prompt, photographer: 'AI Generated', clip: res.clip, aiGenerated: true }];
    grid.innerHTML = `
      <div class="rm-img-search-item" onclick="rmSelectSearchImage(0)" style="width:100%;max-width:400px;margin:0 auto;">
        <img src="${esc(res.url)}" alt="${esc(prompt)}" style="width:100%;border-radius:8px;">
        <div class="credit">AI Generated</div>
      </div>
      <div style="text-align:center;padding:10px;opacity:0.6;font-size:12px;">Click the image to add it to your scene, or type a new prompt to regenerate.</div>
    `;
  } catch (e) {
    grid.innerHTML = `<div class="rm-img-search-empty">Error: ${esc(e.message)}</div>`;
  }
}

async function rmSelectSearchImage(resultIdx) {
  const r = rmSearchResults[resultIdx];
  if (!r) return;
  if (rmImageSearchSceneIdx === null || !rmCurrentProject) return;
  const sceneIdx = rmImageSearchSceneIdx;
  rmCloseImageSearch();

  // AI-generated images are already saved by the server
  if (r.aiGenerated && r.clip) {
    const scene = rmCurrentProject.scenes[sceneIdx];
    if (!scene.images) scene.images = [];
    scene.images.push(r.clip.path);
    if (!rmCurrentProject.clips.find(c => c.path === r.clip.path)) {
      rmCurrentProject.clips.push(r.clip);
    }
    rmRenderTimeline();
    rmSaveProject();
    showToast('AI image added to scene ' + (sceneIdx + 1), 'success');
    return;
  }

  // Stock photos need downloading
  const imageUrl = r.url;
  const altText = r.alt || 'image';
  showToast('Downloading image...', 'info');
  try {
    const filename = 'pexels-' + altText.replace(/[^a-z0-9]/gi, '-').slice(0, 30) + '-' + Date.now() + '.jpg';
    const res = await rmApi.downloadImage(rmCurrentProject.id, imageUrl, filename);
    if (res.ok && res.clip) {
      const scene = rmCurrentProject.scenes[sceneIdx];
      if (!scene.images) scene.images = [];
      scene.images.push(res.clip.path);
      rmCurrentProject.clips.push(res.clip);
      rmRenderTimeline();
      rmSaveProject();
      showToast('Image added to scene ' + (sceneIdx + 1), 'success');
    } else {
      showToast('Failed to download image: ' + (res.error || 'unknown error'), 'error');
    }
  } catch (e) {
    showToast('Image download failed: ' + e.message, 'error');
  }
}

// ── Undo Scene Text ──
function rmUndoSceneText(sceneIdx) {
  if (!rmCurrentProject || !rmCurrentProject.scenes[sceneIdx]) return;
  const scene = rmCurrentProject.scenes[sceneIdx];
  if (scene.original_text) {
    scene.text = scene.original_text;
    scene.text_overlay = '';
    rmRenderTimeline();
    rmSaveProject();
    showToast('Text restored to original', 'success');
  }
}

// ── Customize (Step 4) ──
function rmSwitchTab(tab) {
  rmCurrentTab = tab;
  document.querySelectorAll('.rm-customize-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().includes(tab));
  });
  rmRenderCustomizeTab(tab);
}

function rmRenderCustomizeTab(tab) {
  if (!rmCurrentProject) return;
  const body = document.getElementById('rmCustomizeBody');
  const style = rmCurrentProject.style || {};

  switch (tab) {
    case 'music': body.innerHTML = rmRenderMusicTab(); break;
    case 'colors': body.innerHTML = rmRenderColorsTab(); break;
    case 'text': body.innerHTML = rmRenderTextTab(); break;
    case 'video': body.innerHTML = rmRenderVideoTab(); break;
    case 'animations': body.innerHTML = rmRenderAnimationsTab(); break;
    default: body.innerHTML = '';
  }

  rmRenderPresetBar();
  rmRenderLivePreview();
}

function rmRenderMusicTab() {
  const music = rmCurrentProject.music;
  let currentHTML = '';
  if (music) {
    currentHTML = `
      <div class="rm-music-current">
        <span>🎵</span>
        <span class="rm-music-name">${esc(music.filename || 'Background Music')}</span>
        <button class="rm-music-remove" onclick="rmRemoveMusic()" title="Remove">×</button>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Volume</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="0" max="100" value="${Math.round((music.volume || 0.12) * 100)}" oninput="rmUpdateMusic('volume', this.value / 100); this.nextElementSibling.textContent = this.value + '%'">
          <span class="rm-slider-value">${Math.round((music.volume || 0.12) * 100)}%</span>
        </div>
      </div>
    `;
  }
  return `
    <div class="rm-customize-section">
      <h4>Background Music</h4>
      ${currentHTML}
      <div id="rmMusicUploadZone" class="rm-upload-zone" style="padding:24px;" onclick="rmUploadMusic()">
        <div class="rm-upload-text" style="font-size:14px;">${music ? 'Replace Music' : 'Upload Music'}</div>
        <div class="rm-upload-sub">Audio (MP3, WAV, AAC) or Video (MP4, MOV — audio will be extracted)</div>
      </div>
    </div>
  `;
}

function rmUploadMusic() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,video/mp4,video/quicktime,video/webm,video/x-matroska';
  input.onchange = async () => {
    if (!input.files[0]) return;
    const file = input.files[0];
    const isVideo = file.type.startsWith('video/');

    // Show extracting state
    const zone = document.getElementById('rmMusicUploadZone');
    if (zone) zone.innerHTML = `<div class="rm-upload-text" style="font-size:14px;">${isVideo ? 'Extracting audio from video...' : 'Uploading...'}</div>`;

    try {
      // Upload the file first
      const formData = new FormData();
      formData.append('files', file);
      const res = await rmApi.upload(rmCurrentProject.id, formData);
      if (!res.files || !res.files[0]) throw new Error('Upload failed');

      let musicFile = res.files[0];

      // If video, extract audio server-side
      if (isVideo) {
        const extractRes = await safeFetch(`/api/reel/projects/${rmCurrentProject.id}/extract-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clip_path: musicFile.path })
        });
        const extractData = await extractRes.json();
        if (!extractData.ok) throw new Error(extractData.error || 'Audio extraction failed');
        musicFile = extractData.file;
      }

      rmCurrentProject.music = {
        filename: isVideo ? file.name.replace(/\.[^.]+$/, '') + ' (audio)' : musicFile.filename,
        path: musicFile.path,
        volume: rmCurrentProject.music?.volume || 0.12
      };
      rmSaveProject();
      rmRenderCustomizeTab('music');
      showToast(isVideo ? 'Audio extracted from video' : 'Music uploaded', 'success');
    } catch (e) {
      showToast('Music upload failed: ' + e.message, 'error');
      rmRenderCustomizeTab('music');
    }
  };
  input.click();
}

function rmRemoveMusic() {
  rmCurrentProject.music = null;
  rmSaveProject();
  rmRenderCustomizeTab('music');
}

function rmUpdateMusic(key, value) {
  if (!rmCurrentProject.music) return;
  rmCurrentProject.music[key] = value;
  rmSaveProject();
}

function rmRenderColorsTab() {
  const c = rmCurrentProject.style?.colors || {};
  const presetColors = [
    { name: 'Purple', primary: '#7B2FF2', secondary: '#C084FC' },
    { name: 'Blue', primary: '#2563EB', secondary: '#60A5FA' },
    { name: 'Green', primary: '#059669', secondary: '#34D399' },
    { name: 'Red', primary: '#DC2626', secondary: '#F87171' },
    { name: 'Orange', primary: '#EA580C', secondary: '#FB923C' },
    { name: 'Pink', primary: '#DB2777', secondary: '#F472B6' },
  ];
  return `
    <div class="rm-customize-section">
      <h4>Quick Presets</h4>
      <div class="rm-preset-picker">
        ${presetColors.map(p => `
          <div class="rm-preset-chip ${c.primary === p.primary ? 'active' : ''}" onclick="rmApplyColorPreset('${p.primary}','${p.secondary}')">
            <span class="swatch" style="background:${p.primary};"></span> ${p.name}
          </div>
        `).join('')}
      </div>
    </div>
    <div class="rm-customize-section">
      <h4>Custom Colors</h4>
      ${rmColorRow('Primary', 'colors.primary', c.primary || '#7B2FF2')}
      ${rmColorRow('Secondary', 'colors.secondary', c.secondary || '#C084FC')}
      ${rmColorRow('Text', 'colors.text', c.text || '#ffffff')}
      ${rmColorRow('Background', 'colors.background', c.background || '#0a0a12')}
    </div>
  `;
}

function rmColorRow(label, path, value) {
  return `
    <div class="rm-row">
      <span class="rm-row-label">${label}</span>
      <div class="rm-row-value">
        <input type="color" class="rm-color-swatch" value="${value}" oninput="rmUpdateStyle('${path}', this.value); this.nextElementSibling.value = this.value">
        <input type="text" class="rm-color-input" value="${value}" onchange="rmUpdateStyle('${path}', this.value); this.previousElementSibling.value = this.value">
      </div>
    </div>
  `;
}

function rmApplyColorPreset(primary, secondary) {
  rmUpdateStyle('colors.primary', primary);
  rmUpdateStyle('colors.secondary', secondary);
  rmRenderCustomizeTab('colors');
}

function rmRenderTextTab() {
  const f = rmCurrentProject.style?.font || {};
  const sub = rmCurrentProject.style?.subtitle || {};
  const bg = sub.background || {};
  const bgStyle = bg.style || 'none';
  const bgColor = bg.color || '#000000';
  const bgOpacity = bg.opacity ?? 0.6;
  const bgRadius = bg.borderRadius ?? 8;
  const posX = sub.posX ?? 50;
  const posY = sub.posY ?? 78;
  const fonts = ['Playfair Display', 'Inter', 'Poppins', 'Montserrat', 'Roboto', 'Oswald', 'Raleway', 'Lato', 'Bebas Neue', 'Anton'];
  return `
    <div class="rm-customize-section">
      <h4>Heading Font</h4>
      <div class="rm-row">
        <span class="rm-row-label">Family</span>
        <div class="rm-row-value">
          <select class="rm-select" onchange="rmUpdateStyle('font.family', this.value)">
            ${fonts.map(fn => `<option value="${fn}" ${f.family === fn ? 'selected' : ''}>${fn}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Size</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="24" max="72" value="${f.size || 48}" oninput="rmUpdateStyle('font.size', parseInt(this.value)); this.nextElementSibling.textContent = this.value + 'px'">
          <span class="rm-slider-value">${f.size || 48}px</span>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Weight</span>
        <div class="rm-row-value">
          <select class="rm-select" onchange="rmUpdateStyle('font.weight', parseInt(this.value))">
            ${[400,500,600,700,800].map(w => `<option value="${w}" ${(f.weight||700)===w ? 'selected' : ''}>${w}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="rm-customize-section">
      <h4>Subtitle Font</h4>
      <div class="rm-row">
        <span class="rm-row-label">Family</span>
        <div class="rm-row-value">
          <select class="rm-select" onchange="rmUpdateStyle('subtitle.family', this.value)">
            ${fonts.map(fn => `<option value="${fn}" ${sub.family === fn ? 'selected' : ''}>${fn}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Size</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="16" max="72" value="${sub.size || 32}" oninput="rmUpdateStyle('subtitle.size', parseInt(this.value)); this.nextElementSibling.textContent = this.value + 'px'">
          <span class="rm-slider-value">${sub.size || 32}px</span>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Max Words</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="2" max="12" value="${sub.maxWords || 6}" oninput="rmUpdateStyle('subtitle.maxWords', parseInt(this.value)); this.nextElementSibling.textContent = this.value">
          <span class="rm-slider-value">${sub.maxWords || 6}</span>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Shadow</span>
        <div class="rm-row-value">
          <button class="rm-toggle ${sub.shadow !== false ? 'on' : ''}" onclick="this.classList.toggle('on'); rmUpdateStyle('subtitle.shadow', this.classList.contains('on'))"></button>
        </div>
      </div>
    </div>

    <div class="rm-customize-section">
      <h4>Subtitle Position</h4>
      <p style="font-size:10px;color:#555;margin:0 0 8px;">Drag the subtitle text on the preview, or set X/Y manually</p>
      <div class="rm-pos-inputs">
        <label>X</label>
        <input type="number" min="0" max="100" value="${posX}" onchange="rmUpdateStyle('subtitle.posX', parseInt(this.value)); rmRenderLivePreview();">
        <label>Y</label>
        <input type="number" min="0" max="100" value="${posY}" onchange="rmUpdateStyle('subtitle.posY', parseInt(this.value)); rmRenderLivePreview();">
        <span style="font-size:10px;color:#555;">%</span>
        <button class="rm-preset-chip" onclick="rmUpdateStyle('subtitle.posX', 50); rmUpdateStyle('subtitle.posY', 78); rmRenderCustomizeTab('text');" style="font-size:10px;">Reset</button>
      </div>
    </div>

    <div class="rm-customize-section">
      <h4>Subtitle Background</h4>
      <div class="rm-subbg-picker">
        ${['none','pill','box','highlight','banner'].map(s => `
          <div class="rm-subbg-chip ${bgStyle === s ? 'active' : ''}" onclick="rmUpdateStyle('subtitle.background.style', '${s}'); rmRenderCustomizeTab('text');">
            ${s === 'none' ? '✕ None' : s === 'pill' ? '💊 Pill' : s === 'box' ? '▪ Box' : s === 'highlight' ? '🖍 Highlight' : '▬ Banner'}
          </div>
        `).join('')}
      </div>
      ${bgStyle !== 'none' ? `
      <div style="margin-top:10px;">
        <div class="rm-row">
          <span class="rm-row-label">Color</span>
          <div class="rm-row-value" style="display:flex;gap:8px;align-items:center;">
            <input type="color" value="${bgColor}" style="width:28px;height:28px;border:none;padding:0;cursor:pointer;"
                   oninput="rmUpdateStyle('subtitle.background.color', this.value);">
            <span style="font-size:11px;color:#888;">${bgColor}</span>
          </div>
        </div>
        <div class="rm-row">
          <span class="rm-row-label">Opacity</span>
          <div class="rm-row-value">
            <input type="range" class="rm-slider" min="10" max="100" value="${Math.round(bgOpacity * 100)}"
                   oninput="rmUpdateStyle('subtitle.background.opacity', this.value / 100); this.nextElementSibling.textContent = this.value + '%'">
            <span class="rm-slider-value">${Math.round(bgOpacity * 100)}%</span>
          </div>
        </div>
        ${bgStyle === 'pill' || bgStyle === 'box' ? `
        <div class="rm-row">
          <span class="rm-row-label">Roundness</span>
          <div class="rm-row-value">
            <input type="range" class="rm-slider" min="0" max="24" value="${bgRadius}"
                   oninput="rmUpdateStyle('subtitle.background.borderRadius', parseInt(this.value)); this.nextElementSibling.textContent = this.value + 'px'">
            <span class="rm-slider-value">${bgRadius}px</span>
          </div>
        </div>` : ''}
      </div>` : ''}
    </div>
  `;
}

function rmRenderVideoTab() {
  const v = rmCurrentProject.style?.video || {};
  const o = rmCurrentProject.output || {};
  const isSplit = (rmCurrentProject.mode || 'full') === 'split';
  return `
    ${!isSplit ? `<div class="rm-customize-section">
      <h4>Image</h4>
      <div class="rm-row">
        <span class="rm-row-label">Size</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="10" max="70" value="${v.imageSize || 35}" oninput="rmUpdateStyle('video.imageSize', parseInt(this.value)); this.nextElementSibling.textContent = this.value + '%'">
          <span class="rm-slider-value">${v.imageSize || 35}%</span>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Fit</span>
        <div class="rm-row-value">
          <div class="rm-scene-mode-toggle">
            <button class="rm-scene-mode-btn ${(v.imageFit || 'contain') === 'contain' ? 'active' : ''}" onclick="rmUpdateStyle('video.imageFit', 'contain')">Contain</button>
            <button class="rm-scene-mode-btn ${(v.imageFit || 'contain') === 'cover' ? 'active' : ''}" onclick="rmUpdateStyle('video.imageFit', 'cover')">Cover</button>
          </div>
        </div>
      </div>
    </div>` : ''}
    <div class="rm-customize-section">
      <h4>Video Framing</h4>
      <div class="rm-row">
        <span class="rm-row-label">Zoom</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="50" max="200" value="${Math.round((v.zoom || 1) * 100)}" oninput="rmUpdateStyle('video.zoom', this.value / 100); this.nextElementSibling.textContent = (this.value / 100).toFixed(1) + 'x'">
          <span class="rm-slider-value">${(v.zoom || 1).toFixed(1)}x</span>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">X Offset</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="-50" max="50" value="${v.offsetX || 0}" oninput="rmUpdateStyle('video.offsetX', parseInt(this.value)); this.nextElementSibling.textContent = this.value + '%'">
          <span class="rm-slider-value">${v.offsetX || 0}%</span>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Y Offset</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="-50" max="50" value="${v.offsetY || 0}" oninput="rmUpdateStyle('video.offsetY', parseInt(this.value)); this.nextElementSibling.textContent = this.value + '%'">
          <span class="rm-slider-value">${v.offsetY || 0}%</span>
        </div>
      </div>
      ${!isSplit ? `<div class="rm-row">
        <span class="rm-row-label">Layout</span>
        <div class="rm-row-value">
          <select class="rm-select" onchange="rmUpdateStyle('video.layout', this.value)">
            ${['full-frame','top-half','bottom-half','center-crop'].map(l => `<option value="${l}" ${(v.layout||'bottom-half')===l ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>` : ''}
    </div>
    <div class="rm-customize-section">
      <h4>Output Settings</h4>
      <div class="rm-row">
        <span class="rm-row-label">Resolution</span>
        <div class="rm-row-value">
          <select class="rm-select" onchange="const [w,h]=this.value.split('x'); rmCurrentProject.output.width=parseInt(w); rmCurrentProject.output.height=parseInt(h); rmSaveProject();">
            <option value="1080x1920" ${o.width===1080&&o.height===1920 ? 'selected' : ''}>1080x1920 (Vertical)</option>
            <option value="1920x1080" ${o.width===1920&&o.height===1080 ? 'selected' : ''}>1920x1080 (Horizontal)</option>
            <option value="1080x1080" ${o.width===1080&&o.height===1080 ? 'selected' : ''}>1080x1080 (Square)</option>
          </select>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">FPS</span>
        <div class="rm-row-value">
          <select class="rm-select" onchange="rmCurrentProject.output.fps=parseInt(this.value); rmSaveProject();">
            ${[24,30,60].map(f => `<option value="${f}" ${(o.fps||30)===f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="rm-row">
        <span class="rm-row-label">Quality (CRF)</span>
        <div class="rm-row-value">
          <input type="range" class="rm-slider" min="15" max="28" value="${o.crf || 18}" oninput="rmCurrentProject.output.crf=parseInt(this.value); rmSaveProject(); this.nextElementSibling.textContent = this.value">
          <span class="rm-slider-value">${o.crf || 18}</span>
        </div>
      </div>
    </div>
  `;
}

// ═══ Subtitle Animation Preset Library ═══
const RM_SUB_PRESETS = [
  { id: 'classic',     icon: '✦', name: 'Classic',      desc: 'Clean fade-in of the full subtitle text',                  demoWords: ['This','is','a','clean','fade'], highlightBased: false },
  { id: 'karaoke',     icon: '🎤', name: 'Karaoke',      desc: 'Words light up one-by-one as they\'re spoken',             demoWords: ['Words','light','up','when','spoken'], highlightBased: true },
  { id: 'wordpop',     icon: '💥', name: 'Word Pop',     desc: 'Each word springs in with bounce synced to speech',        demoWords: ['Pop','in','one','by','one'], highlightBased: false },
  { id: 'typewriter',  icon: '⌨️', name: 'Typewriter',   desc: 'Characters appear left-to-right like typing',              demoWords: ['Type','each','word','like','this'], highlightBased: false },
  { id: 'glowsweep',   icon: '✨', name: 'Glow Sweep',   desc: 'A glowing highlight sweeps across each word',              demoWords: ['Glow','sweeps','across','the','text'], highlightBased: true },
  { id: 'bouncein',    icon: '🏀', name: 'Bounce In',    desc: 'Words bounce in from below with spring physics',           demoWords: ['Bounce','up','from','the','bottom'], highlightBased: false },
  { id: 'scaleburst',  icon: '💫', name: 'Scale Burst',  desc: 'Words burst from large to normal size with blur',          demoWords: ['Burst','in','with','epic','scale'], highlightBased: false },
  { id: 'fadeflow',    icon: '🌊', name: 'Fade Flow',    desc: 'Words flow in gently from left with staggered fade',       demoWords: ['Flow','in','smooth','and','gentle'], highlightBased: false },
  { id: 'slidein',     icon: '↔️', name: 'Slide In',     desc: 'Words slide in from alternating left and right',           demoWords: ['Slide','from','both','sides','in'], highlightBased: false },
  { id: 'neonpulse',   icon: '💜', name: 'Neon Pulse',   desc: 'Neon glow effect — active word pulses brighter',           demoWords: ['Neon','glow','pulse','per','word'], highlightBased: true },
  { id: 'wave',        icon: '〰️', name: 'Wave',         desc: 'Words flow in a rhythmic wave pattern with color',         demoWords: ['Ride','the','wave','up','down'], highlightBased: false },
  { id: 'cinematic',   icon: '🎬', name: 'Cinematic',    desc: 'Dramatic blur-to-sharp reveal — film-style entrance',      demoWords: ['Dramatic','cinema','style','text','reveal'], highlightBased: false },
  { id: 'riseglow',    icon: '🔥', name: 'Rise & Glow',  desc: 'Words float up with a warm golden glow trail',             demoWords: ['Rise','and','glow','with','fire'], highlightBased: true },
];

const RM_HIGHLIGHT_COLORS = [
  '#C084FC', '#7B2FF2', '#FFD700', '#FF6B6B', '#4ADE80', '#38BDF8', '#FB923C', '#F472B6', '#FFFFFF'
];

const RM_MFX_PRESETS = [
  { id: 'none',             icon: '✕', name: 'None' },
  { id: 'geometric-lines',  icon: '📐', name: 'Lines' },
  { id: 'corners',          icon: '⊡', name: 'Corners' },
  { id: 'lower-third',      icon: '▬', name: 'Lower Third' },
  { id: 'particles',        icon: '✦', name: 'Particles' },
  { id: 'spotlight',        icon: '🔦', name: 'Spotlight' },
  { id: 'bokeh',            icon: '◌', name: 'Bokeh' },
  { id: 'progress',         icon: '▶', name: 'Progress' },
];

function rmRenderAnimationsTab() {
  const subAnim = rmCurrentProject.style?.subtitleAnimation || {};
  const currentPreset = subAnim.preset || 'classic';
  const highlightColor = subAnim.highlightColor || '#C084FC';
  const a = rmCurrentProject.style?.animation || {};
  const showAdvanced = rmShowAdvancedAnim || false;

  return `
    <div class="rm-customize-section">
      <h4>Subtitle Animation</h4>
      <p style="font-size: 11px; color: #666; margin: 0 0 8px;">Choose how your subtitles animate — uses word-level timestamps from Whisper</p>
      <div class="rm-sub-presets-grid">
        ${RM_SUB_PRESETS.map(p => `
          <div class="rm-sub-preset-card ${currentPreset === p.id ? 'active' : ''}" onclick="rmSelectSubPreset('${p.id}')">
            <div class="rm-sp-name"><span class="rm-sp-icon">${p.icon}</span> ${p.name}</div>
            <div class="rm-sp-demo rm-sp-demo-${p.id}">
              ${p.demoWords.map(w => `<span class="rm-sp-word">${w}</span>`).join('')}
            </div>
            <div class="rm-sp-desc">${p.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>

    ${RM_SUB_PRESETS.find(p => p.id === currentPreset)?.highlightBased ? `
    <div class="rm-customize-section">
      <h4>Highlight Color</h4>
      <div class="rm-sp-highlight-colors">
        ${RM_HIGHLIGHT_COLORS.map(c => `
          <div class="rm-sp-highlight-swatch ${highlightColor === c ? 'active' : ''}"
               style="background: ${c};"
               onclick="rmUpdateStyle('subtitleAnimation.highlightColor', '${c}'); rmRenderCustomizeTab('animations');">
          </div>
        `).join('')}
        <input type="color" value="${highlightColor}" style="width:24px;height:24px;border:none;background:none;cursor:pointer;padding:0;"
               onchange="rmUpdateStyle('subtitleAnimation.highlightColor', this.value); rmRenderCustomizeTab('animations');">
      </div>
    </div>` : ''}

    <div class="rm-customize-section">
      <h4>Motion Graphics</h4>
      <p style="font-size: 11px; color: #888; margin: 0 0 8px;">Effects are now set per-scene in Step 3. Each scene can have its own overlay + custom instructions.</p>
      <button class="btn btn-ghost btn-sm" onclick="rmGoStep('scenes')" style="font-size: 11px;">← Go to Scenes</button>
    </div>

    <div class="rm-customize-section">
      <div class="rm-anim-advanced-toggle" onclick="rmShowAdvancedAnim = !rmShowAdvancedAnim; rmRenderCustomizeTab('animations');">
        ${showAdvanced ? '▾' : '▸'} Scene Entrance (Advanced)
      </div>
      ${showAdvanced ? `
      <div class="rm-anim-advanced">
        <p style="font-size: 10px; color: #555; margin: 0 0 8px;">Controls how the entire scene (image, video, text block) enters — separate from per-word subtitle animation</p>
        <div class="rm-row">
          <span class="rm-row-label">Type</span>
          <div class="rm-row-value">
            <select class="rm-select" onchange="rmUpdateStyle('animation.type', this.value)">
              ${['spring','interpolate','none'].map(t => `<option value="${t}" ${(a.type||'spring')===t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="rm-row">
          <span class="rm-row-label">Damping</span>
          <div class="rm-row-value">
            <input type="range" class="rm-slider" min="5" max="40" value="${a.damping || 18}" oninput="rmUpdateStyle('animation.damping', parseInt(this.value)); this.nextElementSibling.textContent = this.value">
            <span class="rm-slider-value">${a.damping || 18}</span>
          </div>
        </div>
        <div class="rm-row">
          <span class="rm-row-label">Stiffness</span>
          <div class="rm-row-value">
            <input type="range" class="rm-slider" min="50" max="300" value="${a.stiffness || 120}" oninput="rmUpdateStyle('animation.stiffness', parseInt(this.value)); this.nextElementSibling.textContent = this.value">
            <span class="rm-slider-value">${a.stiffness || 120}</span>
          </div>
        </div>
        <div class="rm-row">
          <span class="rm-row-label">Mass</span>
          <div class="rm-row-value">
            <input type="range" class="rm-slider" min="1" max="20" value="${Math.round((a.mass || 0.7) * 10)}" oninput="rmUpdateStyle('animation.mass', this.value / 10); this.nextElementSibling.textContent = (this.value / 10).toFixed(1)">
            <span class="rm-slider-value">${(a.mass || 0.7).toFixed(1)}</span>
          </div>
        </div>
        <div class="rm-preset-picker" style="margin-top:8px;">
          <div class="rm-preset-chip" onclick="rmApplySpringPreset(18,120,0.7)">Smooth</div>
          <div class="rm-preset-chip" onclick="rmApplySpringPreset(12,140,0.5)">Snappy</div>
          <div class="rm-preset-chip" onclick="rmApplySpringPreset(18,90,0.8)">Gentle</div>
          <div class="rm-preset-chip" onclick="rmApplySpringPreset(8,200,0.4)">Bouncy</div>
          <div class="rm-preset-chip" onclick="rmApplySpringPreset(50,80,1)">Slow</div>
        </div>
      </div>` : ''}
    </div>
  `;
}

let rmShowAdvancedAnim = false;

function rmSelectSubPreset(presetId) {
  rmUpdateStyle('subtitleAnimation.preset', presetId);
  rmRenderCustomizeTab('animations');
}

function rmApplySpringPreset(damping, stiffness, mass) {
  rmUpdateStyle('animation.damping', damping);
  rmUpdateStyle('animation.stiffness', stiffness);
  rmUpdateStyle('animation.mass', mass);
  rmRenderCustomizeTab('animations');
}

function rmUpdateStyle(path, value) {
  if (!rmCurrentProject) return;
  if (!rmCurrentProject.style) rmCurrentProject.style = {};
  const parts = path.split('.');
  let obj = rmCurrentProject.style;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  rmSaveProject();
  // Debounced live preview update
  clearTimeout(rmUpdateStyle._timer);
  rmUpdateStyle._timer = setTimeout(rmRenderLivePreview, 150);
}

// ── Preset Bar ──
async function rmRenderPresetBar() {
  if (!rmCurrentProject) return;
  if (rmPresets.length === 0) {
    try { rmPresets = await rmApi.listPresets(); } catch (_) { rmPresets = []; }
  }
  const bar = document.getElementById('rmPresetBar');
  if (!bar) return;
  const currentPresetId = rmCurrentProject.style?.preset_id || '';
  bar.innerHTML = `
    <span class="rm-preset-bar-label">Preset:</span>
    ${rmPresets.map(p => `
      <div class="rm-preset-card ${currentPresetId === p.id ? 'active' : ''}" onclick="rmApplyPreset('${p.id}')">
        <span class="rm-preset-swatch" style="background: ${p.style?.colors?.primary || '#7B2FF2'};"></span>
        ${esc(p.name)}
        ${p.id !== 'default-purple' ? `<button class="rm-preset-delete" onclick="event.stopPropagation(); rmDeletePreset('${p.id}')" title="Delete">&times;</button>` : ''}
      </div>
    `).join('')}
    <button class="rm-preset-save-btn" onclick="rmSaveAsPreset()">+ Save Current</button>
  `;
}

async function rmDeletePreset(presetId) {
  if (!confirm('Delete this preset?')) return;
  try {
    await rmApi.deletePreset(presetId);
    rmPresets = rmPresets.filter(p => p.id !== presetId);
    rmRenderPresetBar();
    showToast('Preset deleted', 'info');
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

// ── Live Preview (Customize sidebar) ──
let rmAnimReplayTimer = null;

function rmGetAnimCSS(anim) {
  const type = anim.type || 'spring';
  const damping = anim.damping || 18;
  const stiffness = anim.stiffness || 120;
  const mass = anim.mass || 0.7;

  if (type === 'none') return { cls: 'rm-live-anim-none', dur: '0s', ease: 'linear' };

  if (type === 'interpolate') {
    const dur = (0.3 + mass * 0.4).toFixed(2);
    return { cls: 'rm-live-anim-interpolate', dur: dur + 's', ease: 'ease-out' };
  }

  // Spring: map physics params to CSS duration and bounce curve
  // Higher stiffness = faster, higher damping = less bounce, higher mass = slower
  const dur = (0.2 + (mass / stiffness) * 80 + (1 / damping) * 5).toFixed(2);
  // Map damping to overshoot: low damping = more overshoot
  const overshoot = Math.max(1.0, 1.0 + (20 - Math.min(damping, 30)) * 0.04);
  const ease = `cubic-bezier(0.34, ${overshoot.toFixed(2)}, 0.64, 1)`;
  return { cls: 'rm-live-anim-spring', dur: dur + 's', ease };
}

// Build word-level subtitle HTML for preview with per-word animation
function rmBuildSubtitleWordsHTML(words, presetId, sub, colors, scale) {
  const subAnim = rmCurrentProject?.style?.subtitleAnimation || {};
  const highlightColor = subAnim.highlightColor || '#C084FC';
  const textColor = colors.text || '#ffffff';
  const shadowCSS = sub?.shadow !== false ? 'text-shadow: 0 1px 4px rgba(0,0,0,0.6);' : '';

  return words.map((w, i) => {
    let wordStyle = `color: ${textColor}; font-weight: 700; ${shadowCSS}`;

    // For highlight-based presets, use the highlight color for the active words
    const preset = RM_SUB_PRESETS.find(p => p.id === presetId);
    if (preset?.highlightBased) {
      wordStyle = `color: ${textColor}; font-weight: 700; --rm-highlight: ${highlightColor}; ${shadowCSS}`;
    }

    return `<span class="rm-sp-word" style="${wordStyle}">${esc(w)}</span>`;
  }).join('');
}

// Build subtitle background CSS
function rmBuildSubBgStyle(bg, scale) {
  if (!bg || bg.style === 'none' || !bg.style) return { css: '', padding: '2px 6px' };
  const color = bg.color || '#000000';
  const opacity = bg.opacity ?? 0.6;
  const radius = bg.borderRadius ?? 8;
  const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
  const pad = Math.max(2, Math.round(8 * (scale || 0.3)));

  if (bg.style === 'pill') {
    return { css: `background: rgba(${r},${g},${b},${opacity}); border-radius: ${radius}px;`, padding: `${pad}px ${pad*2}px` };
  } else if (bg.style === 'box') {
    return { css: `background: rgba(${r},${g},${b},${opacity}); border-radius: ${Math.min(radius,4)}px;`, padding: `${pad}px ${pad*1.5}px` };
  } else if (bg.style === 'highlight') {
    return { css: `background: linear-gradient(transparent 55%, rgba(${r},${g},${b},${opacity}) 55%);`, padding: `${pad}px ${pad}px` };
  } else if (bg.style === 'banner') {
    return { css: `background: rgba(${r},${g},${b},${opacity}); width: 100%; text-align: center; max-width: 100%;`, padding: `${pad}px ${pad*2}px` };
  }
  return { css: '', padding: '2px 6px' };
}

// Build motion graphics overlay HTML
function rmBuildMfxOverlay(preset, opacity, pri) {
  if (!preset || preset === 'none') return '';
  const op = opacity ?? 0.5;
  const cls = `rm-mfx-overlay rm-mfx-${preset}`;
  let inner = '';
  if (preset === 'corners') {
    inner = '<div class="rm-mfx-corner tl"></div><div class="rm-mfx-corner tr"></div><div class="rm-mfx-corner bl"></div><div class="rm-mfx-corner br"></div>';
  } else if (preset === 'lower-third') {
    inner = '<div class="rm-mfx-lt-bar"></div><div class="rm-mfx-lt-accent"></div>';
  } else if (preset === 'particles') {
    inner = '<div class="rm-mfx-dot"></div><div class="rm-mfx-dot"></div><div class="rm-mfx-dot"></div><div class="rm-mfx-dot"></div><div class="rm-mfx-dot"></div><div class="rm-mfx-dot"></div>';
  } else if (preset === 'bokeh') {
    inner = '<div class="rm-mfx-circle"></div><div class="rm-mfx-circle"></div><div class="rm-mfx-circle"></div><div class="rm-mfx-circle"></div>';
  } else if (preset === 'progress') {
    inner = '<div class="rm-mfx-prog-bar"></div>';
  }
  return `<div class="${cls}" style="opacity:${op};">${inner}</div>`;
}

// ── Draggable Subtitle ──
function rmStartDrag(e, canvasId) {
  e.preventDefault();
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  const onMove = (ev) => {
    const x = Math.max(5, Math.min(95, ((ev.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(95, ((ev.clientY - rect.top) / rect.height) * 100));
    const el = e.target.closest('.rm-sub-draggable') || e.target;
    el.style.left = x + '%';
    el.style.top = y + '%';
  };

  const onUp = (ev) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    // Save final position
    const x = Math.max(5, Math.min(95, ((ev.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(95, ((ev.clientY - rect.top) / rect.height) * 100));
    rmUpdateStyle('subtitle.posX', Math.round(x));
    rmUpdateStyle('subtitle.posY', Math.round(y));
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function rmReplayAnimation() {
  const vid = document.getElementById('rmLiveVideo');
  const img = document.getElementById('rmLiveImg');
  [vid, img].forEach(node => {
    if (!node) return;
    node.classList.add('rm-live-anim-replay');
    void node.offsetWidth;
    node.classList.remove('rm-live-anim-replay');
  });
  // Replay word-level animations
  const sub = document.getElementById('rmLiveSubtitle');
  if (sub) {
    sub.querySelectorAll('.rm-sp-word').forEach(w => {
      w.style.animation = 'none';
      void w.offsetWidth;
      w.style.animation = '';
    });
  }
}

// ── Image Slideshow ──
let rmSlideshowTimer = null;

function rmBuildSlideshowHTML(images, containerId, animCls, isFullMode, scene) {
  if (!images || images.length === 0) return '';
  const imgStyle = rmGetImgStyle(scene, isFullMode);
  const containerStyle = isFullMode
    ? imgStyle.posCSS
    : 'width:100%; height:100%; position:relative;';
  return `<div id="${containerId}" class="rm-slideshow" style="${containerStyle} ${imgStyle.borderCSS}">
    ${images.map((img, i) => `<img class="rm-slideshow-img ${animCls}" src="/${img}" data-slide="${i}" style="width:100%; height:100%; object-fit:var(--rm-img-fit, contain); position:absolute; top:0; left:0; opacity:${i === 0 ? 1 : 0}; transition: opacity 0.4s ease;">`).join('')}
  </div>`;
}

function rmStartSlideshow(containerId, sceneDuration, imageCount) {
  clearInterval(rmSlideshowTimer);
  if (imageCount <= 1) return;
  const timePerSlide = Math.max(800, (sceneDuration * 1000) / imageCount);
  let currentSlide = 0;
  rmSlideshowTimer = setInterval(() => {
    const container = document.getElementById(containerId);
    if (!container) { clearInterval(rmSlideshowTimer); return; }
    const slides = container.querySelectorAll('.rm-slideshow-img');
    if (slides.length === 0) return;
    // Fade out current
    slides[currentSlide].style.opacity = '0';
    // Advance
    currentSlide = (currentSlide + 1) % slides.length;
    // Fade in next
    slides[currentSlide].style.opacity = '1';
  }, timePerSlide);
}

function rmRenderLivePreview() {
  if (!rmCurrentProject) return;
  const wrap = document.getElementById('rmLivePreviewWrap');
  if (!wrap) return;
  const style = rmCurrentProject.style || {};
  const colors = style.colors || {};
  const sub = style.subtitle || {};
  const font = style.font || {};
  const video = style.video || {};
  const anim = style.animation || {};
  const scenes = rmCurrentProject.scenes || [];
  const clips = rmCurrentProject.clips || [];
  const videoClips = clips.filter(c => c.type === 'clip');
  const scene = scenes[0];

  // Find video: B-roll overrides main clip, then scene's clip, then first uploaded
  const sceneBroll = (scene && scene.broll && scene.broll.length > 0) ? scene.broll[0] : null;
  let clip = scene ? clips.find(c => c.id === scene.clip_id) : null;
  if (!clip && videoClips.length > 0) clip = videoClips[0];
  const videoSrc = sceneBroll ? '/' + sceneBroll : (clip ? '/' + clip.path : '');

  const zoom = video.zoom || 1;
  const offX = video.offsetX || 0;
  const offY = video.offsetY || 0;
  const subText = scene ? (scene.text_overlay || scene.text || 'Sample subtitle text')
                 : videoClips.length > 0 ? 'Sample subtitle text' : 'Upload clips first';
  const shadowCSS = sub.shadow !== false ? 'text-shadow: 0 2px 6px rgba(0,0,0,0.7);' : '';

  // Scene images
  const sceneImages = (scene && scene.images && scene.images.length > 0) ? scene.images : [];
  const sceneImg = sceneImages.length > 0 ? '/' + sceneImages[0] : '';
  const hasMultipleImages = sceneImages.length > 1;
  const sceneDuration = scene ? ((scene.end || 0) - (scene.start || 0)) : 3;

  // Animation
  const animCSS = rmGetAnimCSS(anim);
  const animType = anim.type || 'spring';

  // Subtitle animation preset
  const subAnim = style.subtitleAnimation || {};
  const subPreset = subAnim.preset || 'classic';

  // Auto-replay loop
  clearInterval(rmAnimReplayTimer);
  clearInterval(rmSlideshowTimer);
  const replayInterval = Math.max(3000, parseFloat(animCSS.dur) * 1000 + 2000);

  // Layout mode
  const projMode = rmCurrentProject.mode || 'full';
  const isFullMode = projMode === 'full' || projMode === 'youtube';
  const layout = video.layout || 'bottom-half';
  const imgSize = video.imageSize || 35;

  // In full mode: video fills 100%, images overlay on top
  // In split mode: flex sections (top image, mid divider, bot video)
  let topFlex, midFlex, botFlex, hideTop;
  if (isFullMode) {
    topFlex = '0%'; midFlex = '0%'; botFlex = '100%'; hideTop = true;
  } else {
    topFlex = '50%'; midFlex = '5%'; botFlex = '45%'; hideTop = false;
  }

  const pri = colors.primary || '#7B2FF2';

  // Limit subtitle words for preview (show ~4-6 words like real reels)
  const allWords = subText.split(/\s+/).filter(w => w);
  const maxSubWords = sub.maxWords || 6;
  const previewWords = allWords.slice(0, maxSubWords);
  const subWordsHTML = rmBuildSubtitleWordsHTML(previewWords, subPreset, sub, colors, 0.26);

  // Subtitle position (percentage-based)
  const posX = sub.posX ?? 50;
  const posY = sub.posY ?? 78;

  // Subtitle background
  const subBg = rmBuildSubBgStyle(sub.background, 0.26);

  // Display mode: subtitles vs motion graphics
  const displayMode = scene ? (scene.display_mode || 'subtitles') : 'subtitles';
  const mfxPreset = scene ? (scene.mfx_preset || 'none') : 'none';
  const mfxOpacity = scene ? (scene.mfx_opacity ?? 0.5) : 0.5;
  const hasImage = !!sceneImg;
  const showMfx = displayMode === 'mfx';
  const showSubtitles = displayMode === 'subtitles';
  const mfxHTML = showMfx ? rmBuildMfxOverlay(mfxPreset, mfxOpacity, pri) : '';

  // Image content — slideshow if multiple, single if one
  const imgStyle = rmGetImgStyle(scene, isFullMode);
  let fullModeImgOverlay = '';
  let topContent = '';
  if (hasMultipleImages) {
    fullModeImgOverlay = isFullMode ? rmBuildSlideshowHTML(sceneImages, 'rmLiveSlideshow', animCSS.cls, isFullMode, scene) : '';
    topContent = !isFullMode ? rmBuildSlideshowHTML(sceneImages, 'rmLiveSlideshow', animCSS.cls, false, scene) : '';
  } else if (sceneImg) {
    fullModeImgOverlay = isFullMode ? `<img id="rmLiveImg" class="${animCSS.cls}" src="${sceneImg}" style="${imgStyle.posCSS} ${imgStyle.borderCSS} object-fit:var(--rm-img-fit, contain);">` : '';
    topContent = !isFullMode ? `<img id="rmLiveImg" class="${animCSS.cls}" src="${sceneImg}" style="">` : '';
  }
  if (!topContent && !isFullMode) {
    topContent = `<div class="rm-split-canvas-empty">Add image to scene</div>`;
  }

  wrap.innerHTML = `
    <div id="rmLiveCanvas" class="rm-preview-canvas" style="width:220px; height:391px; background: ${colors.background || '#0a0a12'}; --rm-anim-dur: ${animCSS.dur}; --rm-anim-ease: ${animCSS.ease}; --rm-img-fit: ${video.imageFit || 'contain'};">
      ${isFullMode ? '' : `
      <!-- Top: Scene Image (split mode only) -->
      <div class="rm-preview-top-section" style="flex: 0 0 ${topFlex};">
        ${topContent}
      </div>
      <!-- Mid: Background -->
      <div class="rm-preview-mid-section" style="flex: 0 0 ${midFlex};"></div>`}

      <!-- Video -->
      <div class="rm-preview-bot-section" style="flex: 0 0 ${botFlex};">
        ${videoSrc ? `<video id="rmLiveVideo" class="${animType !== 'none' ? 'rm-live-video-' + animType : ''}" src="${videoSrc}" muted autoplay loop style="--rm-zoom:${zoom}; --rm-offx:${offX}%; --rm-offy:${offY}%; transform: scale(${zoom}) translate(${offX}%, ${offY}%); width:100%; height:100%; object-fit:cover;"></video>` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ccc;font-size:11px;">No video</div>'}
      </div>

      ${fullModeImgOverlay}
      ${mfxHTML}

      <!-- Draggable Subtitle Overlay (only in subtitles mode) -->
      ${showSubtitles ? `
      <div id="rmLiveSubtitle" class="rm-sub-draggable rm-sp-demo-${subPreset}" data-draggable="true"
           style="position:absolute; left:${posX}%; top:${posY}%; transform:translate(-50%,-50%);
                  font-family:'${sub.family || 'Inter'}',sans-serif; font-size:${Math.round((sub.size || 32) * 0.26)}px;
                  font-weight:700; color:${colors.text || '#ffffff'};
                  display:flex; flex-wrap:wrap; gap:2px; justify-content:center; max-width:90%;
                  z-index:5; padding:${subBg.padding}; ${subBg.css}"
           onmousedown="rmStartDrag(event, 'rmLiveCanvas')">${subWordsHTML}</div>
      ` : ''}
    </div>
    <div class="rm-live-label" style="display:flex; align-items:center; justify-content:center; gap:8px;">
      ${showSubtitles
        ? `${(RM_SUB_PRESETS.find(p => p.id === subPreset)?.icon || '✦')} ${RM_SUB_PRESETS.find(p => p.id === subPreset)?.name || 'Classic'}`
        : showMfx ? '✦ Motion GFX' : '◯ No Text'}
      <button onclick="rmReplayAnimation()" style="background:none;border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#C084FC;cursor:pointer;padding:2px 8px;font-size:11px;" title="Replay animation">▶ Replay</button>
    </div>
  `;

  // Auto-replay the animation in a loop so user can keep seeing it
  rmAnimReplayTimer = setInterval(rmReplayAnimation, replayInterval);

  // Start slideshow if multiple images
  if (hasMultipleImages) {
    rmStartSlideshow('rmLiveSlideshow', sceneDuration, sceneImages.length);
  }
}

// ── Preview (Step 5) ──
let rmPreviewAnimTimer = null;

function rmReplayPreviewAnim() {
  const vid = document.getElementById('rmPreviewVideo');
  const img = document.getElementById('rmPreviewImg');
  [vid, img].forEach(node => {
    if (!node) return;
    node.classList.add('rm-live-anim-replay');
    void node.offsetWidth;
    node.classList.remove('rm-live-anim-replay');
  });
  // Replay word-level animations in both subtitle and animation demo box
  ['rmPreviewSubtitle', 'rmPreviewAnimText'].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;
    container.querySelectorAll('.rm-sp-word').forEach(w => {
      w.style.animation = 'none';
      void w.offsetWidth;
      w.style.animation = '';
    });
  });
}

function rmRenderPreview() {
  if (!rmCurrentProject) return;
  const scenes = rmCurrentProject.scenes || [];
  const style = rmCurrentProject.style || {};
  const colors = style.colors || {};
  const sub = style.subtitle || {};
  const font = style.font || {};
  const video = style.video || {};
  const anim = style.animation || {};
  const el = document.getElementById('rmPreviewContainer');

  if (scenes.length === 0) {
    el.innerHTML = '<div class="rm-scene-empty">No scenes to preview. Go back and set up your scenes first.</div>';
    return;
  }

  const scene = scenes[rmPreviewIdx] || scenes[0];
  const sceneBroll = (scene.broll && scene.broll.length > 0) ? scene.broll[0] : null;
  const clip = (rmCurrentProject.clips || []).find(c => c.id === scene.clip_id);
  const videoSrc = sceneBroll ? '/' + sceneBroll : (clip ? '/' + clip.path : '');
  const zoom = video.zoom || 1;
  const offX = video.offsetX || 0;
  const offY = video.offsetY || 0;
  const subText = scene.text_overlay || scene.text || '';
  const shadowCSS = sub.shadow !== false ? 'text-shadow: 0 2px 6px rgba(0,0,0,0.7);' : '';

  // Scene images
  const sceneImages = (scene.images && scene.images.length > 0) ? scene.images : [];
  const sceneImg = sceneImages.length > 0 ? '/' + sceneImages[0] : '';
  const hasMultipleImages = sceneImages.length > 1;
  const sceneDuration = (scene.end || 0) - (scene.start || 0);

  // Animation
  const animCSS = rmGetAnimCSS(anim);
  const animType = anim.type || 'spring';

  // Subtitle animation preset
  const subAnim = style.subtitleAnimation || {};
  const subPreset = subAnim.preset || 'classic';

  clearInterval(rmPreviewAnimTimer);
  clearInterval(rmSlideshowTimer);
  const replayInterval = Math.max(3500, parseFloat(animCSS.dur) * 1000 + 2500);

  // Layout mode
  const projMode = rmCurrentProject.mode || 'full';
  const isFullMode = projMode === 'full' || projMode === 'youtube';
  const layout = video.layout || 'bottom-half';
  const imgSize = video.imageSize || 35;

  // In full mode: video fills 100%, images overlay on top
  // In split mode: flex sections (top image, mid divider, bot video)
  let topFlex, midFlex, botFlex;
  if (isFullMode) {
    topFlex = '0%'; midFlex = '0%'; botFlex = '100%';
  } else {
    topFlex = '50%'; midFlex = '5%'; botFlex = '45%';
  }

  // Primary/secondary for glow
  const pri = colors.primary || '#7B2FF2';
  const sec = colors.secondary || '#C084FC';

  // Limit subtitle words for preview (show ~4-6 words like real reels)
  const allWords = subText.split(/\s+/).filter(w => w);
  const maxSubWords = sub.maxWords || 6;
  const previewWords = allWords.slice(0, maxSubWords);
  const subWordsHTML = rmBuildSubtitleWordsHTML(previewWords, subPreset, sub, colors, 0.32);
  const presetInfo = RM_SUB_PRESETS.find(p => p.id === subPreset);

  // Subtitle position
  const posX = sub.posX ?? 50;
  const posY = sub.posY ?? 78;

  // Subtitle background
  const subBg = rmBuildSubBgStyle(sub.background, 0.32);

  // Display mode: subtitles vs motion graphics
  const displayMode = scene.display_mode || 'subtitles';
  const mfxPreset = scene.mfx_preset || 'none';
  const mfxOpacity = scene.mfx_opacity ?? 0.5;
  const hasImage = !!sceneImg;
  const showMfx = displayMode === 'mfx';
  const showSubtitles = displayMode === 'subtitles';
  const mfxHTML = showMfx ? rmBuildMfxOverlay(mfxPreset, mfxOpacity, pri) : '';

  // Scene timing
  const duration = sceneDuration.toFixed(1);
  const timeRange = `${(scene.start || 0).toFixed(1)}s — ${(scene.end || 0).toFixed(1)}s`;
  const mfxName = mfxPreset !== 'none' ? (RM_MFX_PRESETS.find(p=>p.id===mfxPreset)?.name || mfxPreset) : null;

  // Image content — slideshow if multiple, single if one
  const imgStyle = rmGetImgStyle(scene, isFullMode);
  let fullModeImgOverlay = '';
  let pvTopContent = '';
  if (hasMultipleImages) {
    fullModeImgOverlay = isFullMode ? rmBuildSlideshowHTML(sceneImages, 'rmPreviewSlideshow', animCSS.cls, isFullMode, scene) : '';
    pvTopContent = !isFullMode ? rmBuildSlideshowHTML(sceneImages, 'rmPreviewSlideshow', animCSS.cls, false, scene) : '';
  } else if (sceneImg) {
    fullModeImgOverlay = isFullMode ? `<img id="rmPreviewImg" class="${animCSS.cls}" src="${sceneImg}" style="${imgStyle.posCSS} ${imgStyle.borderCSS} object-fit:var(--rm-img-fit, contain);">` : '';
    pvTopContent = !isFullMode ? `<img id="rmPreviewImg" class="${animCSS.cls}" src="${sceneImg}" style="">` : '';
  }
  if (!pvTopContent && !isFullMode) {
    pvTopContent = `<div class="rm-split-canvas-empty">Add image to scene</div>`;
  }

  el.innerHTML = `
    <div class="rm-preview-canvas-wrap">
      <div class="rm-preview-phone-frame">
        <div class="rm-preview-phone-notch"></div>
        <div id="rmPreviewCanvas" class="rm-preview-canvas" style="background: ${colors.background || '#0a0a12'}; --rm-anim-dur: ${animCSS.dur}; --rm-anim-ease: ${animCSS.ease}; --rm-img-fit: ${video.imageFit || 'contain'};">
          ${isFullMode ? '' : `
          <!-- Top: Scene Image (split mode only) -->
          <div class="rm-preview-top-section" style="flex: 0 0 ${topFlex};">
            ${pvTopContent}
          </div>
          <!-- Mid -->
          <div class="rm-preview-mid-section" style="flex: 0 0 ${midFlex};"></div>`}
          <!-- Video -->
          <div class="rm-preview-bot-section" style="flex: 0 0 ${botFlex};">
            ${videoSrc ? `<video id="rmPreviewVideo" class="${animType !== 'none' ? 'rm-live-video-' + animType : ''}" src="${videoSrc}" muted autoplay loop style="--rm-zoom:${zoom}; --rm-offx:${offX}%; --rm-offy:${offY}%; transform: scale(${zoom}) translate(${offX}%, ${offY}%); width:100%; height:100%; object-fit:cover;"></video>` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#555;font-size:11px;">No video</div>'}
          </div>
          ${fullModeImgOverlay}
          ${mfxHTML}
          ${showSubtitles ? `
          <div id="rmPreviewSubtitle" class="rm-sub-draggable rm-sp-demo-${subPreset}" data-draggable="true"
               style="position:absolute; left:${posX}%; top:${posY}%; transform:translate(-50%,-50%);
                      font-family:'${sub.family || 'Inter'}',sans-serif; font-size:${Math.round((sub.size || 32) * 0.32)}px;
                      font-weight:700; color:${colors.text || '#ffffff'};
                      display:flex; flex-wrap:wrap; gap:3px; justify-content:center; max-width:90%;
                      z-index:5; padding:${subBg.padding}; ${subBg.css}"
               onmousedown="rmStartDrag(event, 'rmPreviewCanvas')">${subWordsHTML}</div>
          ` : ''}
        </div>
      </div>

      <div class="rm-preview-controls">
        <button class="rm-preview-btn" onclick="rmPreviewPrev()" title="Previous scene">◀</button>
        <button class="rm-preview-btn" onclick="rmTogglePreviewPlay()" id="rmPreviewPlayBtn" title="Auto-play scenes">▶</button>
        <span class="rm-preview-scene-label">${rmPreviewIdx + 1} / ${scenes.length}</span>
        <button class="rm-preview-btn" onclick="rmReplayPreviewAnim()" title="Replay animation">↻</button>
        <button class="rm-preview-btn" onclick="rmPreviewNext()" title="Next scene">▶</button>
      </div>
    </div>

    <div class="rm-preview-sidebar">
      <!-- Current Scene -->
      <div class="rm-pv-section">
        <div class="rm-pv-section-title">Current Scene</div>
        <div class="rm-pv-current">
          <div class="rm-pv-current-num">Scene ${rmPreviewIdx + 1} of ${scenes.length}</div>
          <div class="rm-pv-current-text">${esc(subText)}</div>
          <div class="rm-pv-tags">
            <span class="rm-pv-tag">${timeRange}</span>
            <span class="rm-pv-tag">${duration}s</span>
            <span class="rm-pv-tag purple">${showSubtitles ? (presetInfo?.icon || '✦') + ' ' + (presetInfo?.name || 'Subtitles') : '✦ Motion GFX'}</span>
            ${hasImage ? `<span class="rm-pv-tag green">${hasMultipleImages ? sceneImages.length + ' Images' : 'Image'}</span>` : ''}
            ${sceneBroll ? '<span class="rm-pv-tag green">B-roll</span>' : ''}
            ${mfxName ? `<span class="rm-pv-tag purple">${mfxName}</span>` : ''}
            ${scene.mfx_instructions ? '<span class="rm-pv-tag purple">Has instructions</span>' : ''}
          </div>
        </div>
      </div>

      <!-- All Scenes -->
      <div class="rm-pv-section" style="flex:1; min-height:0; display:flex; flex-direction:column;">
        <div class="rm-pv-section-title">Scenes</div>
        <div class="rm-preview-scene-list" style="flex:1;">
          ${scenes.map((s, i) => {
            const sHasImg = s.images?.length > 0;
            const sIsMfx = s.display_mode === 'mfx';
            const sHasBroll = s.broll?.length > 0;
            return `<div class="rm-preview-scene-item ${i === rmPreviewIdx ? 'active' : ''}" onclick="rmPreviewScene(${i})">
              <span class="rm-pv-snum">${i + 1}</span>
              <span class="rm-pv-stxt">${esc(s.text)}</span>
              <span class="rm-pv-sbadges">${sHasImg ? '🖼' : ''}${sHasBroll ? '🎬' : ''}${sIsMfx ? '✦' : ''}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Style Summary -->
      <div class="rm-pv-section">
        <div class="rm-pv-section-title">Style</div>
        <div class="rm-pv-style-grid">
          <div class="rm-pv-style-card">
            <div class="rm-pv-style-label">Colors</div>
            <div class="rm-pv-style-value"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${pri};vertical-align:middle;margin-right:3px;"></span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${sec};vertical-align:middle;margin-right:3px;"></span> ${pri.replace('#','')}</div>
          </div>
          <div class="rm-pv-style-card">
            <div class="rm-pv-style-label">Animation</div>
            <div class="rm-pv-style-value">${animType}</div>
          </div>
          <div class="rm-pv-style-card">
            <div class="rm-pv-style-label">Font</div>
            <div class="rm-pv-style-value">${(font.family || 'Poppins').split(',')[0]} ${font.size || 48}px</div>
          </div>
          <div class="rm-pv-style-card">
            <div class="rm-pv-style-label">Music</div>
            <div class="rm-pv-style-value" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${rmCurrentProject.music ? '♪ ' + rmCurrentProject.music.filename.substring(0, 18) : 'None'}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  rmPreviewAnimTimer = setInterval(rmReplayPreviewAnim, replayInterval);

  // Start slideshow if multiple images
  if (hasMultipleImages) {
    rmStartSlideshow('rmPreviewSlideshow', sceneDuration, sceneImages.length);
  }
}

function rmPreviewScene(idx) {
  rmPreviewIdx = idx;
  rmRenderPreview();
}
function rmPreviewPrev() {
  const scenes = rmCurrentProject?.scenes || [];
  if (rmPreviewIdx > 0) { rmPreviewIdx--; rmRenderPreview(); }
}
function rmPreviewNext() {
  const scenes = rmCurrentProject?.scenes || [];
  if (rmPreviewIdx < scenes.length - 1) { rmPreviewIdx++; rmRenderPreview(); }
}
function rmTogglePreviewPlay() {
  if (rmPreviewTimer) {
    clearInterval(rmPreviewTimer);
    rmPreviewTimer = null;
    const btn = document.getElementById('rmPreviewPlayBtn');
    if (btn) btn.textContent = '▶';
  } else {
    const btn = document.getElementById('rmPreviewPlayBtn');
    if (btn) btn.textContent = '⏸';
    rmPreviewTimer = setInterval(() => {
      const scenes = rmCurrentProject?.scenes || [];
      if (rmPreviewIdx < scenes.length - 1) { rmPreviewIdx++; rmRenderPreview(); }
      else { clearInterval(rmPreviewTimer); rmPreviewTimer = null; }
    }, 3000);
  }
}

// ── Presets ──
async function rmLoadPresets() {
  try { rmPresets = await rmApi.listPresets(); } catch (_) { rmPresets = []; }
}

async function rmApplyPreset(presetId) {
  const preset = rmPresets.find(p => p.id === presetId);
  if (!preset || !rmCurrentProject) return;
  rmCurrentProject.style = JSON.parse(JSON.stringify(preset.style));
  rmCurrentProject.style.preset_id = presetId;
  rmSaveProject();
  rmRenderCustomizeTab(rmCurrentTab);
  showToast(`Applied preset: ${preset.name}`, 'success');
}

async function rmSaveAsPreset() {
  if (!rmCurrentProject) return;
  const name = prompt('Preset name:');
  if (!name) return;
  try {
    const res = await rmApi.createPreset({ name, style: JSON.parse(JSON.stringify(rmCurrentProject.style)) });
    showToast(`Saved preset: ${name}`, 'success');
    rmPresets.push(res.preset);
  } catch (e) { showToast('Failed to save preset: ' + e.message, 'error'); }
}

// ── Folder Picker ──
async function rmBrowseFolder() {
  const btn = event.target;
  const origText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;
  try {
    const res = await fetch('/api/reel/browse-folder', { method: 'POST' });
    const data = await res.json();
    if (data.folder) {
      document.getElementById('rmRenderDir').value = data.folder;
      document.getElementById('rmRenderDir').style.borderColor = '';
    }
  } catch (e) { showToast('Folder picker failed: ' + e.message, 'error'); }
  btn.textContent = origText;
  btn.disabled = false;
}

// ── One-click Remotion Setup ──
async function rmSetupRemotion() {
  const btn = document.getElementById('rmSetupBtn');
  const origText = btn.textContent;
  btn.textContent = 'Setting up...';
  btn.disabled = true;
  try {
    const res = await fetch('/api/reel/setup-remotion', { method: 'POST' });
    const data = await res.json();
    if (data.ok && data.path) {
      document.getElementById('rmRenderDir').value = data.path;
      btn.textContent = 'Ready';
      btn.style.background = '#059669';
      showToast(data.message || 'Remotion project ready!', 'success');
    } else {
      throw new Error(data.error || 'Setup failed');
    }
  } catch (e) {
    showToast('Setup failed: ' + e.message, 'error');
    btn.textContent = origText;
    btn.disabled = false;
  }
}

// ── Render ──
async function rmRender() {
  if (!rmCurrentProject) return;
  await rmSaveProject();
  const workingDir = (document.getElementById('rmRenderDir')?.value || '').trim();
  if (!workingDir) {
    showToast('Please enter a Remotion working directory', 'error');
    const input = document.getElementById('rmRenderDir');
    if (input) { input.focus(); input.style.borderColor = '#F87171'; setTimeout(() => input.style.borderColor = '', 2000); }
    return;
  }
  try {
    const res = await rmApi.render(rmCurrentProject.id, { working_dir: workingDir, space_id: activeSpaceId });
    showToast(`Render task created: #${res.task_id} — check Board view`, 'success');
  } catch (e) { showToast('Render failed: ' + e.message, 'error'); }
}

async function rmPreviewStudio() {
  if (!rmCurrentProject) return;
  await rmSaveProject();
  const workingDir = (document.getElementById('rmRenderDir')?.value || '').trim();
  if (!workingDir) {
    showToast('Please enter a Remotion working directory first', 'error');
    const input = document.getElementById('rmRenderDir');
    if (input) { input.focus(); input.style.borderColor = '#F87171'; setTimeout(() => input.style.borderColor = '', 2000); }
    return;
  }
  try {
    showToast('Launching Remotion Studio...', 'info');
    const res = await rmApi.previewStudio(rmCurrentProject.id, { working_dir: workingDir });
    showToast(res.message || 'Remotion Studio opening in browser', 'success');
  } catch (e) { showToast('Preview failed: ' + e.message, 'error'); }
}

