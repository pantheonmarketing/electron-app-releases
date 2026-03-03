// ══════════════════════════════════════════════════════════
// Influencer Creator
// ══════════════════════════════════════════════════════════

// ── State ──
let icProjects = [];
let icCurrentProject = null;
let icInitialized = false;
let icSelectedMethod = 'recreate';
let icSelectedRefs = [];      // selected reference IDs for generation
let icSelectedGenId = null;   // currently focused generation
let icGenerating = false;
let icShowSettings = false;
let icRightTab = 'generations'; // 'generations' or 'gallery'
let icActiveGalleryId = null;   // currently selected gallery ID
let icShowNewGallery = false;   // show the "new gallery" input

// ── Prompt Library ──
const IC_PROMPT_LIBRARY = {
  'Bone Structure': [
    'Give her higher, more prominent cheekbones and a sharper, more defined jawline',
    'Adjust her features to look like a mix of Mediterranean and East Asian heritage, with almond-shaped eyes and a bridged nose',
    'Make her forehead slightly higher, enlarge her eyes significantly, and give her a very pale, porcelain skin tone',
    'Give her a slight button nose and a more pronounced cupid\'s bow on her upper lip',
    'Round out her face shape significantly and add soft, rosy blush to the apples of her cheeks',
    'Make her face more heart-shaped and add a chin dimple',
    'Give her a sharper jawline and much higher, more prominent cheekbones',
    'Make her face very long and thin with a high, arched bridge on her nose',
    'Create a more diamond-shaped face structure with high cheekbones',
    'Give her a very wide forehead and a sharp, tapering chin',
    'Add a strong, square jawline and a deep vertical dimple in her chin',
    'Make her face very heart-shaped with a tiny, pointed chin and wide forehead',
  ],
  'Eyes': [
    'Change her eye color to a piercing heterochromia (one emerald green, one icy blue) and make her eyebrows thicker and more arched',
    'Make her eyes extremely large and almond-shaped with thick, dark lashes',
    'Give her deep-set eyes with very dark, thick lashes and a short philtrum above her lip',
    'Make her eyes slightly downturned at the corners for a soulful, sleepy look',
    'Add a limbal ring — a dark ring around the iris for striking contrast',
    'Give her very high, razor-sharp cheekbones and narrow, hooded eyes',
    'Make her eyes icy blue with very pale, almost white eyelashes',
    'Change eye color to warm honey brown with gold flecks',
    'Give her a slight outer corner eye lift (fox eye effect)',
    'Make her eyebrows very light and thin, almost invisible against her skin',
    'Add extremely long, wispy eyelashes that fan out at the corners',
    'Add a slight inner corner eye lift for wider-looking eyes',
    'Give her thick, feathered eyebrows that brush upward at the start',
    'Make her eyes a piercing bright violet color',
    'Add heavy, dark eyeliner-like pigment around her lash line naturally',
    'Make her eyes very cat-like with upturned corners',
  ],
  'Nose': [
    'Make her nose slightly hooked with a higher bridge and a narrower tip',
    'Give her a very small, delicate button nose',
    'Add a subtle nose bump to the bridge for character',
    'Make the nose bridge slightly narrower and more refined',
    'Make her nostrils slightly flared and give her a very strong, proud profile',
    'Give her a short, snub nose and very round, apple-shaped cheeks',
    'Create a more straight, European-style nose bridge',
    'Give her a very refined, narrow nose tip',
  ],
  'Lips & Mouth': [
    'Make her upper lip much thinner than her bottom lip with a deep cupid\'s bow',
    'Give her very full, pouty lips and high, rounded cheekbones that catch the light',
    'Give her a very wide, toothy smile and deep dimples in both cheeks',
    'Add a small gap between her front teeth and make her smile very wide',
    'Give her a "bee-stung" look with very swollen, full lips and soft cheeks',
    'Add a subtle upturned corner to the mouth (resting smile)',
    'Give her a very small, rosebud mouth and a soft, rounded jaw',
    'Make her lips appear naturally glossy and full',
  ],
  'Skin & Texture': [
    'Add a light dusting of freckles across the bridge of her nose and cheeks, and give her a small beauty mark near the corner of her left eye',
    'Add very faint laugh lines around her mouth and slight crow\'s feet to her eyes',
    'Give her a slightly wider nose bridge, a stronger chin, and a faint, thin scar through one of her eyebrows',
    'Make her skin look weathered with faint sun spots and a matte texture',
    'Give her a very smooth, porcelain complexion with no visible pores',
    'Add a sun-kissed, bronze skin tone with very light honey-colored eyes',
    'Add natural skin texture — pores, subtle blemishes, peach fuzz for ultra-realism',
    'Give her a warm golden tan and add visible veins near temples for realism',
    'Add a subtle shimmer to her skin and make her irises look metallic',
    'Make her skin tone slightly more olive with a warm undertone',
    'Add subtle redness to the tip of her nose and cheeks',
    'Give her a cool, porcelain pale complexion with pink undertones',
  ],
  'Hair': [
    'Make her hair platinum blonde with loose waves',
    'Change hair color to rich chocolate brown',
    'Change hair color to jet black with a blue sheen',
    'Change hair color to auburn red with subtle highlights',
    'Change hair color to strawberry blonde',
    'Add subtle blonde highlights and balayage',
    'Change to tight natural curls with volume',
    'Change to straight, sleek, silky hair',
    'Make her hair shoulder-length with layers',
    'Give her a messy bun with loose face-framing strands',
    'Add visible hair texture and individual strands for realism',
    'Change hair color to deep burgundy with a glossy finish',
  ],
  'Ethnicity & Heritage': [
    'Add subtle East Asian facial features — softer jaw, almond eyes, straight nose bridge',
    'Add subtle South Asian facial features — warmer skin, defined brows, full lips',
    'Add subtle Middle Eastern facial features — strong brows, nose, olive skin',
    'Add subtle African facial features — wider nose, full lips, rich skin tone',
    'Add subtle Latina/Hispanic facial features — warm skin, expressive eyes',
    'Add subtle Scandinavian features — pale skin, light eyes, defined cheekbones',
    'Add subtle Mediterranean features — olive skin, dark eyes, strong bone structure',
    'Create an ambiguous mixed-heritage appearance blending multiple ethnicities',
  ],
  'Special & Artistic': [
    'Add heterochromia — one green eye, one brown eye',
    'Add heterochromia — one blue eye, one amber eye',
    'Make her ears slightly pointed at the top for an elven look',
    'Add a tiny subtle nose ring or small stud',
    'Add a subtle ear piercing with a delicate earring',
    'Add a small face tattoo near the eye',
    'Add a natural birthmark on the cheek',
    'Add vitiligo patches for uniqueness and character',
    'Make her irises glow faintly with a metallic sheen',
    'Make her face slightly asymmetrical with a slightly crooked, charming smile',
    'Add decorative face gems or crystals near the eye',
    'Add heavy, dark circles under her eyes for a tired, moody editorial look',
  ],
  'Full Composite': [
    'High cheekbones, defined jawline, almond-shaped eyes, straight nose, full lips — editorial model look',
    'Soft round face, wide eyes, small upturned nose, full lower lip — cute approachable look',
    'Strong angular jaw, deep-set narrow eyes, sharp nose — high-fashion editorial look',
    'Heart-shaped face, high forehead, wide eyes, small pointy chin — classic feminine look',
    'Oval face, balanced proportions, medium eyes, straight nose — versatile neutral look',
    'Diamond face, high cheekbones, narrow forehead, pointed chin — dramatic striking look',
    'Round soft face, full cheeks, wide-spaced eyes, button nose — friendly relatable look',
    'Long face, high forehead, prominent nose, strong chin — aristocratic refined look',
  ],
};

const IC_METHOD_PROMPTS = {
  recreate: `Photorealistic high-resolution portrait. Using the uploaded image as a structural reference, generate a unique new face with distinct features. Retain the subtle essence of the original's bone structure and lighting, but modify the eye shape, nose profile, and overall facial character. Render with cinematic lighting, 8k detail, sharp focus, and natural skin textures.`,
  merge: `Merge these photos of faces and characteristics to create a new unique face that blends the best features of all individuals. The result should be a realistic, photorealistic portrait with natural skin, cinematic lighting, and facial harmony.`,
  edit: '',
  swap: '',
};

// ── Gemini API Key (user's own key, stored in localStorage) ──
// Also checks server env (profile settings) as fallback
function icGetApiKey() { return localStorage.getItem('ic_gemini_api_key') || ''; }
function icSetApiKey(key) { localStorage.setItem('ic_gemini_api_key', key.trim()); }
let icServerGeminiStatus = null; // { configured, masked }
async function icCheckServerGemini() {
  if (icServerGeminiStatus !== null) return icServerGeminiStatus;
  try {
    const r = await safeFetch('/api/influencer/gemini-status');
    icServerGeminiStatus = await r.json();
  } catch (_) { icServerGeminiStatus = { configured: false, masked: '' }; }
  return icServerGeminiStatus;
}

// ── API Layer ──
const icApi = {
  async listProjects() { return (await safeFetch('/api/influencer/projects')).json(); },
  async createProject(data) { return (await safeFetch('/api/influencer/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(); },
  async getProject(id) { return (await safeFetch(`/api/influencer/projects/${id}`)).json(); },
  async updateProject(id, data) { return (await safeFetch(`/api/influencer/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(); },
  async deleteProject(id) { return (await safeFetch(`/api/influencer/projects/${id}`, { method: 'DELETE' })).json(); },
  async uploadRefs(id, formData) { return (await safeFetch(`/api/influencer/projects/${id}/upload`, { method: 'POST', body: formData })).json(); },
  async deleteRef(id, refId) { return (await safeFetch(`/api/influencer/projects/${id}/references/${refId}`, { method: 'DELETE' })).json(); },
  async generate(id, body) {
    const key = icGetApiKey();
    if (key) body.geminiApiKey = key;
    return (await safeFetch(`/api/influencer/projects/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  },
  async useAsRef(id, genId) { return (await safeFetch(`/api/influencer/projects/${id}/generations/${genId}/use-as-ref`, { method: 'POST' })).json(); },
  async setPortrait(id, genId) {
    const key = icGetApiKey();
    const body = key ? { geminiApiKey: key } : {};
    return (await safeFetch(`/api/influencer/projects/${id}/generations/${genId}/set-portrait`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  },
  async setRefPortrait(id, refId) {
    const key = icGetApiKey();
    const body = key ? { geminiApiKey: key } : {};
    return (await safeFetch(`/api/influencer/projects/${id}/references/${refId}/set-portrait`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  },
  async deleteGen(id, genId) { return (await safeFetch(`/api/influencer/projects/${id}/generations/${genId}`, { method: 'DELETE' })).json(); },
  // Gallery collection endpoints
  async listGalleries(id) { return (await safeFetch(`/api/influencer/projects/${id}/galleries`)).json(); },
  async createGallery(id, name) { return (await safeFetch(`/api/influencer/projects/${id}/galleries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).json(); },
  async renameGallery(id, galId, name) { return (await safeFetch(`/api/influencer/projects/${id}/galleries/${galId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).json(); },
  async deleteGallery(id, galId) { return (await safeFetch(`/api/influencer/projects/${id}/galleries/${galId}`, { method: 'DELETE' })).json(); },
  async addToGallery(id, galId, genId) { return (await safeFetch(`/api/influencer/projects/${id}/galleries/${galId}/items/${genId}`, { method: 'POST' })).json(); },
  async removeFromGallery(id, galId, genId) { return (await safeFetch(`/api/influencer/projects/${id}/galleries/${galId}/items/${genId}`, { method: 'DELETE' })).json(); },
  async refToGeneration(id, refId) { return (await safeFetch(`/api/influencer/projects/${id}/references/${refId}/to-generation`, { method: 'POST' })).json(); },
};

// ══════════════════════════════════════
// Init & Navigation
// ══════════════════════════════════════

async function icInit() {
  if (!icInitialized) icInitialized = true;
  icCheckServerGemini(); // fire-and-forget — caches for settings panel
  await icLoadProjects();
}

async function icLoadProjects() {
  try {
    const data = await icApi.listProjects();
    if (data.ok) {
      icProjects = data.projects;
      icRenderProjectList();
    }
  } catch (e) { console.error('icLoadProjects:', e); }
}

function icShowStudio() {
  document.getElementById('icLanding').style.display = 'none';
  document.getElementById('icStudio').style.display = 'flex';
}

function icBackToList() {
  document.getElementById('icStudio').style.display = 'none';
  document.getElementById('icLanding').style.display = '';
  icCurrentProject = null;
  icSelectedGenId = null;
  icSelectedRefs = [];
  icLoadProjects();
}

// ══════════════════════════════════════
// Project List
// ══════════════════════════════════════

function icRenderProjectList() {
  const el = document.getElementById('icProjectList');
  if (!icProjects.length) {
    el.innerHTML = `<div class="ic-empty">
      <div class="ic-empty-icon">👤</div>
      <div class="ic-empty-text">No influencer projects yet.<br>Create your first AI influencer face.</div>
      <button class="btn btn-primary" onclick="icNewProject()">+ New Influencer</button>
    </div>`;
    return;
  }

  el.innerHTML = icProjects.map(p => {
    let portraitPath = null;
    if (p.portraitId?.startsWith('ref:')) {
      const ref = p.references?.find(r => r.id === p.portraitId.slice(4));
      if (ref) portraitPath = ref.path;
    } else if (p.portraitId) {
      const gen = p.generations?.find(g => g.id === p.portraitId);
      if (gen) portraitPath = gen.path;
    }
    const thumbHtml = portraitPath
      ? `<img src="/${portraitPath}" alt="">`
      : `<span class="ic-card-thumb-placeholder">👤</span>`;

    return `<div class="ic-project-card" onclick="icOpenProject('${p.id}')">
      <div class="ic-card-thumb">${thumbHtml}</div>
      <div class="ic-card-info">
        <div class="ic-card-name">${esc(p.name)}</div>
        <div class="ic-card-meta">
          <span>${p.references?.length || 0} refs</span>
          <span>${p.generations?.length || 0} generations</span>
          <span>${new Date(p.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
      <div class="ic-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); icDeleteProject('${p.id}')" title="Delete">🗑</button>
      </div>
    </div>`;
  }).join('');
}

async function icNewProject() {
  const data = await icApi.createProject({ name: 'New Influencer' });
  if (data.ok) {
    icCurrentProject = data.project;
    icCurrentProject.galleries = [];
    icSelectedRefs = [];
    icSelectedGenId = null;
    icSelectedMethod = 'recreate';
    icActiveGalleryId = null;
    icShowNewGallery = false;
    icRenderStudio();
    icShowStudio();
  }
}

async function icOpenProject(id) {
  const data = await icApi.getProject(id);
  if (data.ok) {
    icCurrentProject = data.project;
    icSelectedRefs = [];
    icSelectedGenId = null;
    icSelectedMethod = 'recreate';
    icActiveGalleryId = null;
    icShowNewGallery = false;
    // Load galleries
    await icLoadGalleries();
    icRenderStudio();
    icShowStudio();
  }
}

async function icLoadGalleries() {
  if (!icCurrentProject) return;
  try {
    const data = await icApi.listGalleries(icCurrentProject.id);
    if (data.ok) {
      icCurrentProject.galleries = data.galleries || [];
      // Auto-select first gallery if none selected
      if (!icActiveGalleryId && icCurrentProject.galleries.length > 0) {
        icActiveGalleryId = icCurrentProject.galleries[0].id;
      }
    }
  } catch (e) { console.error('icLoadGalleries:', e); }
}

async function icDeleteProject(id) {
  if (!confirm('Delete this influencer project and all its images?')) return;
  await icApi.deleteProject(id);
  showToast('Project deleted', 'info');
  icLoadProjects();
}

// ══════════════════════════════════════
// Studio Rendering
// ══════════════════════════════════════

function icRenderStudio() {
  const p = icCurrentProject;
  if (!p) return;

  document.getElementById('icStudio').innerHTML = `
    <div class="ic-studio-toolbar">
      <button class="ic-toolbar-back" onclick="icBackToList()" title="Back to list">←</button>
      <input type="text" class="ic-toolbar-name" id="icProjectName" value="${esc(p.name)}" onchange="icSaveName()" placeholder="Influencer name...">
      <div style="flex:1"></div>
      <button class="btn btn-ghost btn-sm" onclick="icToggleSettings()" title="API Key Settings">⚙</button>
      <button class="btn btn-ghost btn-sm" onclick="icSaveProject()">💾 Save</button>
    </div>
    <div class="ic-studio-split">
      <div class="ic-left-panel" id="icLeftPanel">
        ${icRenderLeftPanel()}
      </div>
      <div class="ic-right-panel" id="icRightPanel">
        ${icRenderRightPanel()}
      </div>
    </div>
  `;

  // Bind drag & drop
  const zone = document.getElementById('icUploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); icHandleDrop(e); });
  }

  // Bind clipboard paste — listen on the whole studio container
  icBindPaste();
}

function icRenderLeftPanel() {
  const p = icCurrentProject;

  return `
    <!-- References -->
    <div>
      <div class="ic-section-title">📸 Reference Images</div>
      <div class="ic-upload-zone" id="icUploadZone" onclick="icPickFiles()">
        <div class="ic-upload-zone-icon">📷</div>
        <div class="ic-upload-zone-text">Drop face images here or <span>browse</span></div>
      </div>
      ${p.references?.length ? `<div class="ic-ref-grid" style="margin-top:10px;">${icRenderRefGrid()}</div>` : ''}
    </div>

    <!-- Method -->
    <div>
      <div class="ic-section-title">🔧 Method</div>
      <div class="ic-method-tabs">
        <button class="ic-method-tab ${icSelectedMethod === 'recreate' ? 'active' : ''}" onclick="icSetMethod('recreate')">Re-Create</button>
        <button class="ic-method-tab ${icSelectedMethod === 'merge' ? 'active' : ''}" onclick="icSetMethod('merge')">Merge</button>
        <button class="ic-method-tab ${icSelectedMethod === 'edit' ? 'active' : ''}" onclick="icSetMethod('edit')">Edit</button>
        <button class="ic-method-tab ${icSelectedMethod === 'swap' ? 'active' : ''}" onclick="icSetMethod('swap')">Swap</button>
      </div>
      <div style="margin-top:6px;">
        ${icRenderMethodHint()}
      </div>
    </div>

    <!-- Swap: Portrait indicator -->
    ${icSelectedMethod === 'swap' ? icRenderSwapPortraitInfo() : ''}

    <!-- Prompt -->
    <div class="ic-prompt-area">
      <div class="ic-section-title">✍️ Prompt</div>
      <textarea class="ic-prompt-textarea" id="icPromptText" placeholder="${icGetPlaceholder()}">${icSelectedMethod !== 'edit' && icSelectedMethod !== 'swap' ? IC_METHOD_PROMPTS[icSelectedMethod] : ''}</textarea>
      ${icSelectedMethod === 'swap'
        ? (icSelectedRefs.length > 0
          ? `<div class="ic-prompt-hint">${icSelectedRefs.length} scene photo${icSelectedRefs.length > 1 ? 's' : ''} selected</div>`
          : `<div class="ic-prompt-hint" style="color:#F87171;">Select scene photo(s) above — the person in it will get your influencer's face</div>`)
        : (icSelectedRefs.length > 0 ? `<div class="ic-prompt-hint">${icSelectedRefs.length} image${icSelectedRefs.length > 1 ? 's' : ''} selected</div>` : `<div class="ic-prompt-hint" style="color:#F87171;">Select reference image(s) above first</div>`)
      }
    </div>

    <!-- Editing Prompts Library -->
    <div>
      <div class="ic-section-title">📚 Editing Prompts</div>
      <div class="ic-prompt-lib">
        ${Object.entries(IC_PROMPT_LIBRARY).map(([cat, prompts]) =>
          `<div class="ic-prompt-category" id="icCat_${cat.replace(/[^a-zA-Z]/g, '')}">
            <div class="ic-prompt-category-header" onclick="icToggleCategory(this)">
              <span>${cat} (${prompts.length})</span>
              <span class="arrow">▶</span>
            </div>
            <div class="ic-prompt-category-body">
              ${prompts.map(pr => `<span class="ic-prompt-chip" onclick="icApplyPrompt('${pr.replace(/'/g, "\\'")}')" title="${esc(pr)}">${esc(pr.length > 40 ? pr.slice(0, 40) + '...' : pr)}</span>`).join('')}
            </div>
          </div>`
        ).join('')}
      </div>
    </div>

    <!-- Generate -->
    <button class="ic-generate-btn" id="icGenerateBtn" onclick="icGenerate()" ${icSelectedRefs.length === 0 ? 'disabled' : ''}>
      ${icSelectedMethod === 'swap' ? '🔄 Swap Face' : '🎨 Generate Face'}
    </button>
  `;
}

function icRenderRefGrid() {
  const p = icCurrentProject;
  return (p.references || []).map(ref => {
    const selected = icSelectedRefs.includes(ref.id);
    const tagLabel = ref.tag ? `@img${ref.tag}` : '';
    const isPortrait = p.portraitId === 'ref:' + ref.id;
    return `<div class="ic-ref-card ${selected ? 'selected' : ''} ${isPortrait ? 'ic-ref-portrait' : ''}" onclick="icToggleRef('${ref.id}')" title="${esc(ref.originalName || ref.filename)}${tagLabel ? ' — ' + tagLabel : ''}">
      <img src="/${ref.path}" alt="" loading="lazy">
      ${tagLabel ? `<span class="ic-ref-card-tag">${tagLabel}</span>` : ''}
      ${ref.fromGeneration ? '<span class="ic-ref-card-badge">GEN</span>' : ''}
      ${isPortrait ? '<span class="ic-ref-card-portrait">⭐</span>' : ''}
      <button class="ic-ref-card-portrait-btn" onclick="event.stopPropagation(); icSetRefPortrait('${ref.id}')" title="Set as Portrait">⭐</button>
      <button class="ic-ref-card-delete" onclick="event.stopPropagation(); icDeleteRef('${ref.id}')" title="Remove">×</button>
      <div class="ic-ref-save-bar">
        <button onclick="event.stopPropagation(); icRefToGenerations('${ref.id}')" title="Save to Generations">🖼</button>
        <button onclick="event.stopPropagation(); icRefToGallery('${ref.id}')" title="Save to Gallery">💎</button>
      </div>
    </div>`;
  }).join('');
}

function icRenderMethodHint() {
  const hints = {
    recreate: '<span style="color:#888;font-size:10px;">Select <b>1</b> reference → generates a new unique face based on it</span>',
    merge: '<span style="color:#888;font-size:10px;">Select <b>2-4</b> references → merges their features into one face</span>',
    edit: '<span style="color:#888;font-size:10px;">Select <b>1</b> reference or generation → apply editing prompts</span>',
    swap: '<span style="color:#888;font-size:10px;">Uses your <b>portrait</b> face + select a <b>scene photo</b> → replaces that person with your influencer</span>',
  };
  return hints[icSelectedMethod] || '';
}

function icRenderSwapPortraitInfo() {
  const p = icCurrentProject;
  let portraitPath = null;
  if (p.portraitId?.startsWith('ref:')) {
    const ref = p.references?.find(r => r.id === p.portraitId.slice(4));
    if (ref) portraitPath = ref.path;
  } else if (p.portraitId) {
    const gen = p.generations?.find(g => g.id === p.portraitId);
    if (gen) portraitPath = gen.path;
  }
  if (portraitPath) {
    const descHtml = p.portraitDescription
      ? `<div style="font-size:9px;color:#666;margin-top:4px;max-height:60px;overflow-y:auto;line-height:1.4;">${esc(p.portraitDescription.slice(0, 200))}${p.portraitDescription.length > 200 ? '...' : ''}</div>`
      : `<div style="font-size:9px;color:#F59E0B;margin-top:4px;">⏳ Re-click "Set as Portrait" to auto-analyze features</div>`;
    return `<div class="ic-swap-portrait-info">
      <div class="ic-swap-portrait-thumb"><img src="/${portraitPath}" alt=""></div>
      <div class="ic-swap-portrait-text">
        <div style="font-size:11px;font-weight:600;color:#C084FC;">Face Identity (Portrait)</div>
        <div style="font-size:10px;color:#888;">This face + features will be swapped onto the scene photo</div>
        ${descHtml}
      </div>
    </div>`;
  }
  return `<div class="ic-swap-portrait-info ic-swap-no-portrait">
    <div style="font-size:11px;color:#F87171;font-weight:600;">⚠ No portrait set</div>
    <div style="font-size:10px;color:#888;">Upload your face or generate one, then click ⭐ to set as portrait</div>
  </div>`;
}

function icGetPlaceholder() {
  const ph = {
    recreate: 'Optional: add custom instructions...',
    merge: 'Optional: specify which features from each face...',
    edit: 'Use @img tags to reference images, e.g. "she\'s wearing the outfit from @img3"',
    swap: 'Optional: "wearing the dress from @img2", "sunset lighting"...',
  };
  return ph[icSelectedMethod] || '';
}

function icRenderRightPanel() {
  const p = icCurrentProject;
  const gens = p.generations || [];
  const galleries = p.galleries || [];
  const totalGalItems = galleries.reduce((sum, g) => sum + (g.items?.length || 0), 0);

  // Settings panel — check both local key and server env key
  const localKey = icGetApiKey();
  const serverGemini = icServerGeminiStatus || { configured: false, masked: '' };
  let keyStatusHtml;
  if (localKey) {
    keyStatusHtml = '<div style="font-size:10px;color:#34D399;margin-top:6px;">✓ Key saved — stored locally in your browser</div>';
  } else if (serverGemini.configured) {
    keyStatusHtml = `<div style="font-size:10px;color:#34D399;margin-top:6px;">✓ Key configured in Profile settings (${esc(serverGemini.masked)}) — you\'re all set</div>`;
  } else {
    keyStatusHtml = '<div style="font-size:10px;color:#F59E0B;margin-top:6px;">No key set — add it here or in your Profile settings (click your name in the sidebar)</div>';
  }
  const settingsHtml = icShowSettings ? `<div class="ic-settings-panel">
    <div class="ic-section-title">⚙ Gemini API Key</div>
    <div style="font-size:11px;color:#888;margin-bottom:10px;line-height:1.5;">Enter your Google AI Studio API key to generate images.<br><a href="https://aistudio.google.com/api-keys" target="_blank" style="color:#C084FC;font-weight:600;text-decoration:underline;">Click here to get your free API key</a></div>
    <div style="display:flex;gap:8px;">
      <input type="password" class="ic-prompt-textarea" id="icApiKeyInput" value="${esc(localKey)}" placeholder="AIzaSy..." style="min-height:auto;padding:8px 10px;flex:1;font-size:11px;">
      <button class="btn btn-primary btn-sm" onclick="icSaveApiKey()" style="white-space:nowrap;">Save Key</button>
    </div>
    ${keyStatusHtml}
  </div>` : '';

  // Find active gallery
  const activeGal = galleries.find(g => g.id === icActiveGalleryId);
  const activeItems = activeGal?.items || [];

  // Detail panel for selected generation
  let detailHtml = '';
  if (icSelectedGenId) {
    const gen = gens.find(g => g.id === icSelectedGenId);
    if (gen) {
      // Build "Add to gallery" dropdown items
      const galBtns = galleries.length > 0
        ? galleries.map(gal => {
            const inThisGal = gal.items?.some(i => i.id === gen.id);
            return `<button class="btn ${inThisGal ? 'btn-success' : 'btn-ghost'} btn-sm" onclick="icToggleGalleryItem('${gal.id}', '${gen.id}')" title="${esc(gal.name)}">
              ${inThisGal ? '✓' : '+'} ${esc(gal.name.length > 12 ? gal.name.slice(0, 12) + '..' : gal.name)}
            </button>`;
          }).join('')
        : `<button class="btn btn-ghost btn-sm" onclick="icQuickCreateGallery('${gen.id}')">+ New Gallery</button>`;

      detailHtml = `<div class="ic-detail-panel">
        <div class="ic-detail-preview"><img src="/${gen.path}" alt=""></div>
        <div class="ic-detail-info">
          <div class="ic-detail-method">${gen.method}</div>
          <div class="ic-detail-prompt">${esc(gen.prompt || '')}</div>
          <div class="ic-detail-date">${new Date(gen.createdAt).toLocaleString()}</div>
          <div class="ic-detail-actions">
            <button class="btn btn-primary btn-sm" onclick="icUseAsRef('${gen.id}')">📌 Use as Ref</button>
            <button class="btn ${gen.isPortrait ? 'btn-success' : 'btn-ghost'} btn-sm" onclick="icSetPortrait('${gen.id}')">${gen.isPortrait ? '⭐ Portrait' : '⭐ Set Portrait'}</button>
            <button class="btn btn-ghost btn-sm" onclick="icDownload('${gen.path}')">⬇</button>
            <button class="btn btn-ghost btn-sm" style="color:#f87171" onclick="icDeleteGen('${gen.id}')">🗑</button>
          </div>
          <div style="margin-top:6px;">
            <div style="font-size:10px;color:#666;margin-bottom:4px;">Add to Gallery:</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">${galBtns}${galleries.length > 0 ? `<button class="btn btn-ghost btn-sm" onclick="icQuickCreateGallery('${gen.id}')" title="Create new gallery">+</button>` : ''}</div>
          </div>
        </div>
      </div>`;
    }
  }

  // Right panel tabs
  const tabsHtml = `<div class="ic-right-tabs">
    <button class="ic-right-tab ${icRightTab === 'generations' ? 'active' : ''}" onclick="icSwitchRightTab('generations')">🖼 Generations (${gens.length})</button>
    <button class="ic-right-tab ${icRightTab === 'gallery' ? 'active' : ''}" onclick="icSwitchRightTab('gallery')">💎 Galleries (${totalGalItems})</button>
  </div>`;

  if (icRightTab === 'gallery') {
    // Gallery picker bar
    const galPickerHtml = `<div class="ic-gal-bar">
      <div class="ic-gal-picker">
        ${galleries.map(gal => `
          <button class="ic-gal-chip ${icActiveGalleryId === gal.id ? 'active' : ''}" onclick="icSelectGallery('${gal.id}')">
            ${esc(gal.name)} (${gal.items?.length || 0})
          </button>
        `).join('')}
        <button class="ic-gal-chip ic-gal-chip-add" onclick="icShowNewGalleryInput()">+</button>
      </div>
      ${icShowNewGallery ? `<div class="ic-gal-new-input" style="display:flex;gap:6px;margin-top:8px;">
        <input type="text" class="ic-prompt-textarea" id="icNewGalName" placeholder="Gallery name..." style="min-height:auto;padding:6px 10px;flex:1;font-size:11px;" onkeydown="if(event.key==='Enter')icCreateGallery()">
        <button class="btn btn-primary btn-sm" onclick="icCreateGallery()">Create</button>
        <button class="btn btn-ghost btn-sm" onclick="icShowNewGallery=false;icRefreshRight()">Cancel</button>
      </div>` : ''}
      ${activeGal ? `<div class="ic-gal-actions" style="display:flex;gap:6px;margin-top:6px;align-items:center;">
        <span style="font-size:11px;color:#C084FC;font-weight:600;flex:1;">${esc(activeGal.name)}</span>
        <button class="btn btn-ghost btn-sm" onclick="icRenameGallery('${activeGal.id}')" title="Rename" style="font-size:10px;">✏ Rename</button>
        <button class="btn btn-ghost btn-sm" onclick="icDeleteGallery('${activeGal.id}')" title="Delete gallery" style="font-size:10px;color:#f87171;">🗑 Delete</button>
      </div>` : ''}
    </div>`;

    if (galleries.length === 0) {
      return `${settingsHtml}${tabsHtml}${galPickerHtml}
        <div class="ic-empty" style="padding:40px;">
          <div class="ic-empty-icon">💎</div>
          <div class="ic-empty-text">No galleries yet.<br>Click <b>+</b> to create your first gallery.</div>
        </div>`;
    }

    if (!activeGal) {
      return `${settingsHtml}${tabsHtml}${galPickerHtml}
        <div class="ic-empty" style="padding:30px;">
          <div class="ic-empty-text" style="color:#888;">Select a gallery above</div>
        </div>`;
    }

    return `${settingsHtml}${tabsHtml}${galPickerHtml}
      ${activeItems.length === 0 ? `<div class="ic-empty" style="padding:30px;">
        <div class="ic-empty-icon">💎</div>
        <div class="ic-empty-text">This gallery is empty.<br>Add images from the Generations tab.</div>
      </div>` : `
      <div class="ic-gen-grid">
        ${activeItems.slice().reverse().map(item => `
          <div class="ic-gen-card" onclick="icSelectGen('${item.id}')">
            <img src="/${item.path}" alt="" loading="lazy">
            <div class="ic-gen-method-badge">${item.method || ''}</div>
            <button class="ic-gen-card-delete" onclick="event.stopPropagation(); icRemoveFromGallery('${activeGal.id}', '${item.id}')" title="Remove from gallery">×</button>
          </div>
        `).join('')}
      </div>`}
      ${detailHtml}`;
  }

  return `${settingsHtml}${tabsHtml}
    ${gens.length === 0 ? `<div class="ic-empty" style="padding:40px;">
      <div class="ic-empty-icon">🎨</div>
      <div class="ic-empty-text">No generations yet.<br>Upload references, choose a method, and generate.</div>
    </div>` : `
    <div class="ic-gen-grid">
      ${gens.slice().reverse().map(gen => `
        <div class="ic-gen-card ${icSelectedGenId === gen.id ? 'selected' : ''}" onclick="icSelectGen('${gen.id}')">
          <img src="/${gen.path}" alt="" loading="lazy">
          ${gen.isPortrait ? '<div class="ic-gen-portrait-badge">⭐</div>' : ''}
          <div class="ic-gen-method-badge">${gen.method}</div>
          <button class="ic-gen-card-delete" onclick="event.stopPropagation(); icDeleteGen('${gen.id}')" title="Delete">×</button>
        </div>
      `).join('')}
    </div>`}
    ${detailHtml}
  `;
}

// ══════════════════════════════════════
// Interactions
// ══════════════════════════════════════

function icSetMethod(method) {
  icSelectedMethod = method;
  const leftEl = document.getElementById('icLeftPanel');
  if (leftEl) leftEl.innerHTML = icRenderLeftPanel();
  // Rebind drag & drop
  const zone = document.getElementById('icUploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); icHandleDrop(e); });
  }
}

function icToggleRef(refId) {
  const idx = icSelectedRefs.indexOf(refId);
  if (idx >= 0) icSelectedRefs.splice(idx, 1);
  else icSelectedRefs.push(refId);
  // Re-render left panel to update selection state + generate button
  const leftEl = document.getElementById('icLeftPanel');
  if (leftEl) leftEl.innerHTML = icRenderLeftPanel();
  const zone = document.getElementById('icUploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); icHandleDrop(e); });
  }
}

function icSelectGen(genId) {
  icSelectedGenId = icSelectedGenId === genId ? null : genId;
  const rightEl = document.getElementById('icRightPanel');
  if (rightEl) rightEl.innerHTML = icRenderRightPanel();
}

function icToggleCategory(header) {
  header.closest('.ic-prompt-category').classList.toggle('open');
}

function icApplyPrompt(text) {
  const textarea = document.getElementById('icPromptText');
  if (!textarea) return;
  if (icSelectedMethod === 'edit') {
    // For edit mode, append to existing with period separator
    const current = textarea.value.trim();
    textarea.value = current ? `${current}. ${text}` : text;
  } else {
    // For recreate/merge, put in additional instructions
    const current = textarea.value.trim();
    const base = IC_METHOD_PROMPTS[icSelectedMethod];
    if (current === base || !current) {
      textarea.value = base + `\n\nAdditional: ${text}`;
    } else {
      textarea.value = current + `. ${text}`;
    }
  }
  textarea.scrollTop = textarea.scrollHeight;
  showToast('Prompt added', 'info');
}

// ── File Upload ──
function icPickFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => icUploadFiles(input.files);
  input.click();
}

function icHandleDrop(e) {
  const files = e.dataTransfer?.files;
  if (files?.length) icUploadFiles(files);
}

async function icUploadFiles(files) {
  if (!icCurrentProject || !files.length) return;
  const formData = new FormData();
  for (const f of files) {
    if (f.type.startsWith('image/')) formData.append('files', f);
  }
  if (!formData.has('files')) { showToast('No image files found', 'error'); return; }

  showToast('Uploading...', 'info');
  const data = await icApi.uploadRefs(icCurrentProject.id, formData);
  if (data.ok) {
    icCurrentProject.references.push(...data.references);
    // Auto-select newly uploaded refs
    data.references.forEach(r => { if (!icSelectedRefs.includes(r.id)) icSelectedRefs.push(r.id); });
    const leftEl = document.getElementById('icLeftPanel');
    if (leftEl) leftEl.innerHTML = icRenderLeftPanel();
    const zone = document.getElementById('icUploadZone');
    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); icHandleDrop(e); });
    }
    showToast(`${data.references.length} image(s) uploaded`, 'success');
  } else {
    showToast(data.error || 'Upload failed', 'error');
  }
}

async function icDeleteRef(refId) {
  if (!icCurrentProject) return;
  await icApi.deleteRef(icCurrentProject.id, refId);
  icCurrentProject.references = icCurrentProject.references.filter(r => r.id !== refId);
  icSelectedRefs = icSelectedRefs.filter(id => id !== refId);
  const leftEl = document.getElementById('icLeftPanel');
  if (leftEl) leftEl.innerHTML = icRenderLeftPanel();
  const zone = document.getElementById('icUploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); icHandleDrop(e); });
  }
}

// ── Save ref to Generations ──
async function icRefToGenerations(refId) {
  if (!icCurrentProject) return;
  const data = await icApi.refToGeneration(icCurrentProject.id, refId);
  if (data.ok) {
    if (!data.alreadyExists) {
      icCurrentProject.generations.push(data.generation);
    }
    showToast(data.alreadyExists ? 'Already in generations' : 'Saved to generations', 'success');
    icRefreshRight();
  } else {
    showToast(data.error || 'Failed', 'error');
  }
}

// ── Save ref to Gallery (imports to generations first, then shows gallery picker) ──
async function icRefToGallery(refId) {
  if (!icCurrentProject) return;
  // First ensure it's in generations
  const data = await icApi.refToGeneration(icCurrentProject.id, refId);
  if (!data.ok) { showToast(data.error || 'Failed', 'error'); return; }
  if (!data.alreadyExists) {
    icCurrentProject.generations.push(data.generation);
  }
  const genId = data.generation.id;
  const galleries = icCurrentProject.galleries || [];
  if (galleries.length === 0) {
    // No galleries — create one
    const name = prompt('Create a gallery name:');
    if (!name) return;
    const galData = await icApi.createGallery(icCurrentProject.id, name);
    if (galData.ok) {
      icCurrentProject.galleries.push(galData.gallery);
      const addData = await icApi.addToGallery(icCurrentProject.id, galData.gallery.id, genId);
      if (addData.ok) {
        galData.gallery.items = addData.gallery?.items || [{ id: genId, filename: data.generation.filename, path: data.generation.path, method: 'imported', addedAt: new Date().toISOString() }];
        showToast(`Saved to "${name}"`, 'success');
      }
    }
  } else {
    // Pick a gallery
    const names = galleries.map((g, i) => `${i + 1}. ${g.name}`).join('\n');
    const choice = prompt(`Pick a gallery (enter number):\n${names}\n\nOr type a new name to create one:`);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    let galId;
    if (idx >= 0 && idx < galleries.length) {
      galId = galleries[idx].id;
    } else {
      // Create new gallery
      const galData = await icApi.createGallery(icCurrentProject.id, choice);
      if (!galData.ok) { showToast('Failed to create gallery', 'error'); return; }
      icCurrentProject.galleries.push(galData.gallery);
      galId = galData.gallery.id;
    }
    const addData = await icApi.addToGallery(icCurrentProject.id, galId, genId);
    if (addData.ok) {
      const gal = icCurrentProject.galleries.find(g => g.id === galId);
      if (gal && addData.gallery?.items) gal.items = addData.gallery.items;
      showToast(`Saved to gallery`, 'success');
    }
  }
  icRefreshRight();
}

// ── Generate ──
async function icGenerate() {
  if (icGenerating || !icCurrentProject) return;

  const textarea = document.getElementById('icPromptText');
  const prompt = textarea?.value?.trim() || '';

  // Validation
  if (icSelectedMethod === 'edit' && !prompt) {
    showToast('Write or select an editing prompt first', 'error');
    return;
  }
  if (icSelectedMethod === 'swap') {
    if (!icCurrentProject.portraitId) {
      showToast('Set a portrait first — click ⭐ on any reference or generated face', 'error');
      return;
    }
    if (icSelectedRefs.length === 0) {
      showToast('Select at least one scene photo to swap into', 'error');
      return;
    }
  } else if (icSelectedRefs.length === 0) {
    showToast('Select at least one reference image', 'error');
    return;
  }
  if (icSelectedMethod === 'recreate' && icSelectedRefs.length > 1) {
    showToast('Re-Create works best with 1 reference image', 'info');
  }
  if (icSelectedMethod === 'merge' && icSelectedRefs.length < 2) {
    showToast('Select at least 2 references to merge', 'error');
    return;
  }

  icGenerating = true;
  const btn = document.getElementById('icGenerateBtn');
  const btnLabel = icSelectedMethod === 'swap' ? '🔄 Swap Face' : '🎨 Generate Face';
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="ic-generating-spinner" style="width:18px;height:18px;border-width:2px;"></div> Generating...'; }

  try {
    const body = {
      method: icSelectedMethod,
      prompt,
      referenceIds: icSelectedRefs,
    };
    // For swap, also send the portrait ID and scene IDs explicitly
    if (icSelectedMethod === 'swap') {
      body.portraitId = icCurrentProject.portraitId;
      body.sceneIds = icSelectedRefs;
    }
    const data = await icApi.generate(icCurrentProject.id, body);

    if (data.ok && data.generation) {
      icCurrentProject.generations.push(data.generation);
      icSelectedGenId = data.generation.id;
      const rightEl = document.getElementById('icRightPanel');
      if (rightEl) rightEl.innerHTML = icRenderRightPanel();
      showToast('Face generated!', 'success');
    } else {
      showToast(data.error || 'Generation failed', 'error');
    }
  } catch (e) {
    showToast('Generation failed: ' + e.message, 'error');
  } finally {
    icGenerating = false;
    if (btn) { btn.disabled = false; btn.innerHTML = btnLabel; }
  }
}

// ── Generation Actions ──
async function icUseAsRef(genId) {
  if (!icCurrentProject) return;
  const data = await icApi.useAsRef(icCurrentProject.id, genId);
  if (data.ok && data.reference) {
    icCurrentProject.references.push(data.reference);
    icSelectedRefs.push(data.reference.id);
    const leftEl = document.getElementById('icLeftPanel');
    if (leftEl) leftEl.innerHTML = icRenderLeftPanel();
    const zone = document.getElementById('icUploadZone');
    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); icHandleDrop(e); });
    }
    showToast('Added to references', 'success');
  } else {
    showToast(data.message || data.error || 'Failed', 'info');
  }
}

async function icSetPortrait(genId) {
  if (!icCurrentProject) return;
  showToast('Setting portrait & analyzing features...', 'info');
  const data = await icApi.setPortrait(icCurrentProject.id, genId);
  if (data.ok) {
    icCurrentProject.generations.forEach(g => { g.isPortrait = g.id === genId; });
    icCurrentProject.portraitId = genId;
    if (data.portraitDescription) {
      icCurrentProject.portraitDescription = data.portraitDescription;
      showToast('Portrait set + features analyzed!', 'success');
    } else {
      showToast('Portrait set!', 'success');
    }
    const rightEl = document.getElementById('icRightPanel');
    if (rightEl) rightEl.innerHTML = icRenderRightPanel();
    // Also refresh left panel in case swap mode is active
    const leftEl = document.getElementById('icLeftPanel');
    if (leftEl && icSelectedMethod === 'swap') {
      leftEl.innerHTML = icRenderLeftPanel();
      const zone = document.getElementById('icUploadZone');
      if (zone) {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); icHandleDrop(e); });
      }
    }
  }
}

async function icSetRefPortrait(refId) {
  if (!icCurrentProject) return;
  showToast('Setting portrait & analyzing features...', 'info');
  const data = await icApi.setRefPortrait(icCurrentProject.id, refId);
  if (data.ok) {
    icCurrentProject.generations.forEach(g => { g.isPortrait = false; });
    icCurrentProject.portraitId = 'ref:' + refId;
    if (data.portraitDescription) {
      icCurrentProject.portraitDescription = data.portraitDescription;
      showToast('Portrait set + features analyzed!', 'success');
    } else {
      showToast('Portrait set!', 'success');
    }
    icRenderStudio();
  }
}

function icDownload(filePath) {
  const link = document.createElement('a');
  link.href = `/${filePath}`;
  link.download = filePath.split('/').pop();
  link.click();
}

async function icDeleteGen(genId) {
  if (!icCurrentProject) return;
  if (!confirm('Delete this generated image?')) return;
  await icApi.deleteGen(icCurrentProject.id, genId);
  icCurrentProject.generations = icCurrentProject.generations.filter(g => g.id !== genId);
  if (icSelectedGenId === genId) icSelectedGenId = null;
  if (icCurrentProject.portraitId === genId) icCurrentProject.portraitId = null;
  const rightEl = document.getElementById('icRightPanel');
  if (rightEl) rightEl.innerHTML = icRenderRightPanel();
  showToast('Deleted', 'info');
}

// ── Save ──
async function icSaveName() {
  if (!icCurrentProject) return;
  const name = document.getElementById('icProjectName')?.value?.trim();
  if (name) {
    icCurrentProject.name = name;
    await icApi.updateProject(icCurrentProject.id, { name });
  }
}

async function icSaveProject() {
  if (!icCurrentProject) return;
  await icSaveName();
  showToast('Saved', 'success');
}

// ── Settings ──
async function icToggleSettings() {
  icShowSettings = !icShowSettings;
  if (icShowSettings) await icCheckServerGemini();
  const rightEl = document.getElementById('icRightPanel');
  if (rightEl) rightEl.innerHTML = icRenderRightPanel();
}

function icSaveApiKey() {
  const input = document.getElementById('icApiKeyInput');
  if (!input) return;
  icSetApiKey(input.value);
  showToast(input.value.trim() ? 'API key saved' : 'API key cleared', 'success');
  const rightEl = document.getElementById('icRightPanel');
  if (rightEl) rightEl.innerHTML = icRenderRightPanel();
}

// ── Right Panel Tabs ──
function icSwitchRightTab(tab) {
  icRightTab = tab;
  icSelectedGenId = null;
  const rightEl = document.getElementById('icRightPanel');
  if (rightEl) rightEl.innerHTML = icRenderRightPanel();
}

// ── Named Galleries ──

function icRefreshRight() {
  const rightEl = document.getElementById('icRightPanel');
  if (rightEl) rightEl.innerHTML = icRenderRightPanel();
}

function icSelectGallery(galId) {
  icActiveGalleryId = galId;
  icSelectedGenId = null;
  icRefreshRight();
}

function icShowNewGalleryInput() {
  icShowNewGallery = true;
  icRefreshRight();
  setTimeout(() => document.getElementById('icNewGalName')?.focus(), 50);
}

async function icCreateGallery() {
  if (!icCurrentProject) return;
  const input = document.getElementById('icNewGalName');
  const name = input?.value?.trim();
  if (!name) { showToast('Enter a gallery name', 'error'); return; }

  const data = await icApi.createGallery(icCurrentProject.id, name);
  if (data.ok && data.gallery) {
    if (!icCurrentProject.galleries) icCurrentProject.galleries = [];
    icCurrentProject.galleries.push(data.gallery);
    icActiveGalleryId = data.gallery.id;
    icShowNewGallery = false;
    showToast(`Gallery "${name}" created`, 'success');
    icRefreshRight();
  }
}

async function icQuickCreateGallery(genId) {
  const name = prompt('Gallery name:');
  if (!name?.trim()) return;

  const data = await icApi.createGallery(icCurrentProject.id, name.trim());
  if (data.ok && data.gallery) {
    if (!icCurrentProject.galleries) icCurrentProject.galleries = [];
    icCurrentProject.galleries.push(data.gallery);
    icActiveGalleryId = data.gallery.id;
    // Auto-add the image to this new gallery
    if (genId) {
      await icApi.addToGallery(icCurrentProject.id, data.gallery.id, genId);
      const gen = icCurrentProject.generations.find(g => g.id === genId);
      if (gen) {
        data.gallery.items.push({ id: gen.id, filename: gen.filename, path: gen.path, method: gen.method, addedAt: new Date().toISOString() });
      }
    }
    showToast(`Gallery "${name}" created + image added`, 'success');
    icRefreshRight();
  }
}

async function icRenameGallery(galId) {
  const gal = (icCurrentProject.galleries || []).find(g => g.id === galId);
  if (!gal) return;
  const newName = prompt('Rename gallery:', gal.name);
  if (!newName?.trim() || newName.trim() === gal.name) return;

  const data = await icApi.renameGallery(icCurrentProject.id, galId, newName.trim());
  if (data.ok) {
    gal.name = newName.trim();
    showToast('Gallery renamed', 'success');
    icRefreshRight();
  }
}

async function icDeleteGallery(galId) {
  const gal = (icCurrentProject.galleries || []).find(g => g.id === galId);
  if (!gal) return;
  if (!confirm(`Delete gallery "${gal.name}"? Images won't be deleted, only removed from this collection.`)) return;

  await icApi.deleteGallery(icCurrentProject.id, galId);
  icCurrentProject.galleries = icCurrentProject.galleries.filter(g => g.id !== galId);
  if (icActiveGalleryId === galId) {
    icActiveGalleryId = icCurrentProject.galleries.length > 0 ? icCurrentProject.galleries[0].id : null;
  }
  showToast('Gallery deleted', 'info');
  icRefreshRight();
}

async function icToggleGalleryItem(galId, genId) {
  if (!icCurrentProject) return;
  const gal = (icCurrentProject.galleries || []).find(g => g.id === galId);
  if (!gal) return;

  const inGal = gal.items?.some(i => i.id === genId);
  if (inGal) {
    await icApi.removeFromGallery(icCurrentProject.id, galId, genId);
    gal.items = gal.items.filter(i => i.id !== genId);
    showToast('Removed from ' + gal.name, 'info');
  } else {
    await icApi.addToGallery(icCurrentProject.id, galId, genId);
    const gen = icCurrentProject.generations.find(g => g.id === genId);
    if (gen) {
      if (!gal.items) gal.items = [];
      gal.items.push({ id: gen.id, filename: gen.filename, path: gen.path, method: gen.method, addedAt: new Date().toISOString() });
    }
    showToast('Added to ' + gal.name, 'success');
  }
  icRefreshRight();
}

async function icRemoveFromGallery(galId, genId) {
  if (!icCurrentProject) return;
  const gal = (icCurrentProject.galleries || []).find(g => g.id === galId);
  if (!gal) return;

  await icApi.removeFromGallery(icCurrentProject.id, galId, genId);
  gal.items = (gal.items || []).filter(i => i.id !== genId);
  icRefreshRight();
  showToast('Removed from gallery', 'info');
}

// ══════════════════════════════════════
// Clipboard Paste Support
// ══════════════════════════════════════

let icPasteBound = false;

function icBindPaste() {
  if (icPasteBound) return;
  icPasteBound = true;

  document.addEventListener('paste', async (e) => {
    // Only handle paste when in influencer studio view
    if (!icCurrentProject) return;
    const studio = document.getElementById('icStudio');
    if (!studio || studio.style.display === 'none') return;

    // Don't intercept paste in text inputs/textareas (let them paste text normally)
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      // But if the clipboard has image items, still handle it
      const hasImage = [...(e.clipboardData?.items || [])].some(i => i.type.startsWith('image/'));
      if (!hasImage) return; // Let text paste through
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault(); // Prevent default paste behavior

    // Create proper File objects with names
    const namedFiles = imageFiles.map((f, i) => {
      const ext = f.type === 'image/png' ? '.png' : f.type === 'image/webp' ? '.webp' : '.jpg';
      return new File([f], `pasted-image-${Date.now()}-${i}${ext}`, { type: f.type });
    });

    showToast(`Pasting ${namedFiles.length} image(s)...`, 'info');
    await icUploadFiles(namedFiles);
  });
}
