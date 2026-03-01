const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const shared = require('../lib/shared');
const router = express.Router();

// ── Helpers ──

function readProject(id) {
  const file = path.join(shared.INFLUENCER_PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeProject(project) {
  project.updated_at = new Date().toISOString();
  const file = path.join(shared.INFLUENCER_PROJECTS_DIR, `${project.id}.json`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
  return project;
}

function listProjects() {
  if (!fs.existsSync(shared.INFLUENCER_PROJECTS_DIR)) return [];
  return fs.readdirSync(shared.INFLUENCER_PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(shared.INFLUENCER_PROJECTS_DIR, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function guessMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
  return map[ext] || 'image/jpeg';
}

// ── Multer for reference uploads ──
const icStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(shared.BASE_DIR, 'uploads', req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `ref_${base}-${Date.now()}${ext}`);
  }
});
const icUpload = multer({
  storage: icStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpg|jpeg|jfif|png|webp|gif|bmp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ══════════════════════════════════════
// CRUD
// ══════════════════════════════════════

router.get('/influencer/projects', (req, res) => {
  res.json({ ok: true, projects: listProjects() });
});

router.post('/influencer/projects', (req, res) => {
  const id = `ic_${Date.now()}`;
  const project = {
    id,
    name: req.body.name || 'New Influencer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    references: [],
    generations: [],
    gallery: [],
    portraitId: null,
  };
  writeProject(project);
  res.json({ ok: true, project });
});

router.get('/influencer/projects/:id', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, project });
});

router.put('/influencer/projects/:id', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  if (req.body.name !== undefined) project.name = req.body.name;
  if (req.body.portraitId !== undefined) project.portraitId = req.body.portraitId;
  writeProject(project);
  res.json({ ok: true, project });
});

router.delete('/influencer/projects/:id', (req, res) => {
  const file = path.join(shared.INFLUENCER_PROJECTS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  // Clean up uploads
  const uploadsDir = path.join(shared.BASE_DIR, 'uploads', req.params.id);
  if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
  res.json({ ok: true });
});

// ══════════════════════════════════════
// Reference Image Upload
// ══════════════════════════════════════

router.post('/influencer/projects/:id/upload', icUpload.array('files', 10), (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  // Assign tag numbers — find the next available @img number
  const existingTags = (project.references || []).map(r => r.tag || 0);
  let nextTag = (existingTags.length ? Math.max(...existingTags) : 0) + 1;

  const newRefs = (req.files || []).map(f => ({
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    filename: f.filename,
    originalName: f.originalname,
    path: `uploads/${req.params.id}/${f.filename}`,
    size: f.size,
    fromGeneration: false,
    tag: nextTag++,
    addedAt: new Date().toISOString(),
  }));

  project.references.push(...newRefs);
  writeProject(project);
  res.json({ ok: true, references: newRefs });
});

router.delete('/influencer/projects/:id/references/:refId', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  const ref = project.references.find(r => r.id === req.params.refId);
  if (ref) {
    // Delete file if not from a generation (generations have their own lifecycle)
    if (!ref.fromGeneration) {
      const filePath = path.join(shared.BASE_DIR, ref.path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    project.references = project.references.filter(r => r.id !== req.params.refId);
    writeProject(project);
  }
  res.json({ ok: true });
});

// ══════════════════════════════════════
// Generate — NanoBanana Pro 2 (Gemini)
// ══════════════════════════════════════

const GEMINI_MODEL = 'gemini-3.1-flash-image-preview'; // NanoBanana Pro 2 — image generation
const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';           // Cheap text model — for analysis only

function buildPrompt(method, userPrompt, imageCount, portraitDescription) {
  const basePrompts = {
    recreate: `Photorealistic high-resolution portrait. Using the uploaded image as a structural reference, generate a unique new face with distinct features. Retain the subtle essence of the original's bone structure and lighting, but modify the eye shape, nose profile, and overall facial character. Render with cinematic lighting, 8k detail, sharp focus, and natural skin textures.`,
    merge: imageCount <= 2
      ? `Merge these ${imageCount} photos of faces and characteristics to create a new unique face that blends the best features of all individuals. The result should be a realistic, photorealistic portrait with natural skin, lighting, and facial harmony.`
      : `Generate a single, unique face that is a composite of ${imageCount} different individuals. Blend the facial structure, eye shape, nose, and skin details from each person into one cohesive, realistic face. Render as a photorealistic portrait with cinematic lighting, 8k detail, sharp focus, and natural skin textures.`,
    edit: '', // user prompt IS the full prompt for edit mode
    swap: '', // built dynamically below
  };

  const base = basePrompts[method] || '';
  if (method === 'edit') {
    return `Using the uploaded image, apply the following edits while keeping the overall face identity intact. Render as a photorealistic portrait with natural skin textures and cinematic lighting.\n\nEdits: ${userPrompt}`;
  }
  if (method === 'swap') {
    // Image 1 = scene photo (the photo to modify), Image 2 (last) = portrait (the face to use)
    const featureBlock = portraitDescription
      ? `\n\nDISTINCTIVE FEATURES OF THE FACE REFERENCE (you MUST preserve ALL of these in the output):\n${portraitDescription}\n\nThese features are NON-NEGOTIABLE. The hair color, eye color, face shape, skin tone, and all other listed features MUST match the face reference exactly. Do NOT blend with or adopt features from the scene photo's original face — only keep the scene's pose, body, clothing, and background.`
      : '';

    const swapBase = `You are given two images.

The FIRST image is the SCENE PHOTO — this is the target photo. It shows a person in a specific pose, outfit, location, and lighting. This is the photo you will modify.

The SECOND image (the last image) is the FACE REFERENCE — this is the AI influencer whose face and appearance must appear in the final result.

Your task: Take the SCENE PHOTO (first image) and make it look like the FACE REFERENCE person (second/last image) is the one in the photo. Replace the person's face, hair, and skin with those of the FACE REFERENCE.

Critical requirements:
- The OUTPUT must use the SCENE PHOTO's body pose, clothing, hands, background, location, lighting, composition, and framing.
- Replace the face AND hair with the FACE REFERENCE person's face and hair — same hair color, hair style, hair length, eye color, eye shape, nose shape, lip shape, bone structure, skin tone, and overall appearance.
- Do NOT keep the scene photo person's hair color or hair style — use the FACE REFERENCE's hair instead.
- The final image should look like the FACE REFERENCE person was actually there, photographed in that scene.
- Match the lighting and color grading of the scene onto the swapped face/hair so it looks natural.
- Maintain the head angle and direction from the scene photo.
- Render with photorealistic quality — natural skin pores, subtle imperfections, matching shadows.
- The result should look like a real photograph, not a composite.${featureBlock}`;
    if (userPrompt && userPrompt.trim()) {
      return `${swapBase}\n\nAdditional instructions: ${userPrompt}`;
    }
    return swapBase;
  }
  if (userPrompt && userPrompt.trim()) {
    return `${base}\n\nAdditional instructions: ${userPrompt}`;
  }
  return base;
}

router.post('/influencer/projects/:id/generate', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  const { method, prompt, referenceIds, portraitId: reqPortraitId, sceneIds, geminiApiKey } = req.body;
  if (!method) return res.status(400).json({ ok: false, error: 'No method specified' });

  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({ ok: false, error: 'No Gemini API key. Enter your key in the ⚙ Settings panel above.' });
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    // Build contents array: images + text prompt
    const contents = [];

    // Helper to add an image to contents with optional label
    function addImage(item, label) {
      if (!item) return false;
      const filePath = path.join(shared.BASE_DIR, item.path);
      if (!fs.existsSync(filePath)) return false;
      const data = fs.readFileSync(filePath).toString('base64');
      // If labeled, add a text label before the image so Gemini knows which @img this is
      if (label) contents.push({ text: label });
      contents.push({
        inlineData: {
          mimeType: guessMime(item.filename),
          data,
        }
      });
      return true;
    }

    // Find an item by id across references and generations
    function findItem(id) {
      // Handle "ref:refId" prefix used for reference-based portraits
      const cleanId = id?.startsWith('ref:') ? id.slice(4) : id;
      return project.references.find(r => r.id === cleanId)
        || project.generations.find(g => g.id === id);
    }

    // Build a tag→ref lookup for @img parsing
    const tagMap = {};
    (project.references || []).forEach(r => {
      if (r.tag) tagMap[r.tag] = r;
    });

    // Parse @img tags from prompt to find additional tagged images to include
    let userPrompt = prompt || '';
    const taggedRefs = []; // refs referenced by @img tags in the prompt
    const tagPattern = /@img(\d+)/gi;
    let match;
    while ((match = tagPattern.exec(userPrompt)) !== null) {
      const tagNum = parseInt(match[1]);
      const ref = tagMap[tagNum];
      if (ref && !taggedRefs.find(t => t.tag === tagNum)) {
        taggedRefs.push({ tag: tagNum, ref });
      }
    }

    let refs;
    if (method === 'swap') {
      // Swap mode: scene photo FIRST (base image to modify), then portrait (face to use)
      const sceneList = sceneIds || referenceIds || [];
      refs = sceneList.map(id => findItem(id)).filter(Boolean);
      for (const scene of refs) addImage(scene);

      // Add any @img tagged images that weren't in the scene list
      for (const { tag, ref } of taggedRefs) {
        if (!refs.find(r => r.id === ref.id)) {
          addImage(ref, `[This is @img${tag}]`);
        }
      }

      // Portrait (face identity) comes LAST as the reference face
      const portraitItemId = reqPortraitId || project.portraitId;
      const portraitItem = findItem(portraitItemId);
      if (!portraitItem) {
        return res.json({ ok: false, error: 'No portrait set. Set a portrait first or select a face identity image.' });
      }
      addImage(portraitItem);
    } else {
      // Standard modes: add selected reference images
      refs = (referenceIds || []).map(refId => findItem(refId)).filter(Boolean);

      // If there are @img tags, send images in labeled order
      if (taggedRefs.length > 0) {
        // First add selected refs that aren't tagged (the base face references)
        for (const ref of refs) {
          const tagInfo = taggedRefs.find(t => t.ref.id === ref.id);
          if (tagInfo) {
            addImage(ref, `[This is @img${tagInfo.tag}]`);
          } else {
            addImage(ref);
          }
        }
        // Then add any tagged refs not already selected
        for (const { tag, ref } of taggedRefs) {
          if (!refs.find(r => r.id === ref.id)) {
            addImage(ref, `[This is @img${tag}]`);
          }
        }
      } else {
        for (const ref of refs) addImage(ref);
      }
    }

    // Add text prompt
    const fullPrompt = buildPrompt(method, userPrompt, refs.length, method === 'swap' ? project.portraitDescription : null);
    contents.push({ text: fullPrompt });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        responseModalities: ['image', 'text'],
      },
    });

    // Extract image from response
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('image/'));

    if (!imagePart) {
      const textPart = parts.find(p => p.text);
      const errorMsg = textPart?.text || 'No image generated. Try a different prompt or reference image.';
      return res.json({ ok: false, error: errorMsg });
    }

    // Save to disk
    const uploadsDir = path.join(shared.BASE_DIR, 'uploads', project.id);
    fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `gen_${Date.now()}.png`;
    const outputPath = path.join(uploadsDir, filename);
    fs.writeFileSync(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'));

    // Add to generations
    const generation = {
      id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      method,
      prompt: fullPrompt,
      referenceIds: referenceIds || [],
      filename,
      path: `uploads/${project.id}/${filename}`,
      createdAt: new Date().toISOString(),
      isPortrait: false,
    };
    project.generations.push(generation);
    writeProject(project);

    res.json({ ok: true, generation });
  } catch (err) {
    console.error('[Influencer Generate] Error:', err.message?.slice(0, 300));
    res.json({ ok: false, error: err.message?.slice(0, 300) || 'Generation failed' });
  }
});

// ══════════════════════════════════════
// Generation Actions
// ══════════════════════════════════════

// Use generation as a new reference
router.post('/influencer/projects/:id/generations/:genId/use-as-ref', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  const gen = project.generations.find(g => g.id === req.params.genId);
  if (!gen) return res.status(404).json({ ok: false, error: 'Generation not found' });

  // Check if already a reference
  if (project.references.some(r => r.path === gen.path)) {
    return res.json({ ok: true, message: 'Already a reference' });
  }

  // Assign next tag number
  const existingTags = (project.references || []).map(r => r.tag || 0);
  const nextTag = (existingTags.length ? Math.max(...existingTags) : 0) + 1;

  const newRef = {
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    filename: gen.filename,
    originalName: gen.filename,
    path: gen.path,
    size: 0,
    fromGeneration: true,
    tag: nextTag,
    addedAt: new Date().toISOString(),
  };
  try { newRef.size = fs.statSync(path.join(shared.BASE_DIR, gen.path)).size; } catch {}

  project.references.push(newRef);
  writeProject(project);
  res.json({ ok: true, reference: newRef });
});

// Set as portrait — also auto-analyzes face features via Gemini
router.post('/influencer/projects/:id/generations/:genId/set-portrait', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  const gen = project.generations.find(g => g.id === req.params.genId);
  if (!gen) return res.status(404).json({ ok: false, error: 'Generation not found' });

  // Clear previous portrait
  project.generations.forEach(g => { g.isPortrait = false; });
  gen.isPortrait = true;
  project.portraitId = gen.id;

  // Auto-analyze face features for swap mode (only if portrait changed or no description yet)
  const needsAnalysis = !project.portraitDescription || project._analyzedPortraitId !== gen.id;
  const apiKey = (req.body && req.body.geminiApiKey) || process.env.GEMINI_API_KEY;
  if (apiKey && needsAnalysis) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const filePath = path.join(shared.BASE_DIR, gen.path);
      if (fs.existsSync(filePath)) {
        const imgData = fs.readFileSync(filePath).toString('base64');
        const analyzeResponse = await ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: [
            { inlineData: { mimeType: guessMime(gen.filename), data: imgData } },
            { text: `Analyze this person's face and describe their distinctive physical features in a concise, factual list. Include:
- Hair: color, length, texture, style
- Eyes: color, shape, size, any unique features (heterochromia, etc.)
- Eyebrows: shape, thickness, color
- Nose: shape, size, bridge
- Lips: fullness, shape
- Face shape: oval, heart, round, square, diamond, etc.
- Skin: tone, texture, freckles, moles, beauty marks
- Bone structure: cheekbones, jawline, chin
- Any other distinctive features

Be very specific about colors and shapes. Output ONLY the feature list, no introduction or commentary.` }
          ],
          // text model doesn't need responseModalities config
        });

        const parts = analyzeResponse?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find(p => p.text);
        if (textPart?.text) {
          project.portraitDescription = textPart.text.trim();
          project._analyzedPortraitId = gen.id;
          console.log('[Influencer] Portrait analyzed:', project.portraitDescription.slice(0, 100) + '...');
        }
      }
    } catch (err) {
      console.warn('[Influencer] Portrait analysis failed (non-critical):', err.message?.slice(0, 100));
      // Non-critical — swap still works without description
    }
  }

  writeProject(project);
  res.json({ ok: true, portraitDescription: project.portraitDescription || null });
});

// Set a reference image as portrait
router.post('/influencer/projects/:id/references/:refId/set-portrait', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  const ref = project.references.find(r => r.id === req.params.refId);
  if (!ref) return res.status(404).json({ ok: false, error: 'Reference not found' });

  // Clear previous portrait from generations
  project.generations.forEach(g => { g.isPortrait = false; });
  // Store portrait info — use "ref:" prefix to distinguish from generation IDs
  project.portraitId = 'ref:' + ref.id;
  project.portraitPath = ref.path;

  // Auto-analyze face features
  const apiKey = (req.body && req.body.geminiApiKey) || process.env.GEMINI_API_KEY;
  const needsAnalysis = !project.portraitDescription || project._analyzedPortraitId !== project.portraitId;
  if (apiKey && needsAnalysis) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const filePath = path.join(shared.BASE_DIR, ref.path);
      if (fs.existsSync(filePath)) {
        const imgData = fs.readFileSync(filePath).toString('base64');
        const analyzeResponse = await ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: [
            { inlineData: { mimeType: guessMime(ref.filename), data: imgData } },
            { text: `Analyze this person's face and describe their distinctive physical features in a concise, factual list. Include:
- Hair: color, length, texture, style
- Eyes: color, shape, size, any unique features
- Eyebrows: shape, thickness, color
- Nose: shape, size, bridge
- Lips: fullness, shape
- Face shape: oval, heart, round, square, diamond, etc.
- Skin: tone, texture, freckles, moles, beauty marks
- Bone structure: cheekbones, jawline, chin
- Any other distinctive features

Be very specific about colors and shapes. Output ONLY the feature list, no introduction or commentary.` }
          ],
        });
        const parts = analyzeResponse?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find(p => p.text);
        if (textPart?.text) {
          project.portraitDescription = textPart.text.trim();
          project._analyzedPortraitId = project.portraitId;
        }
      }
    } catch (err) {
      console.warn('[Influencer] Ref portrait analysis failed:', err.message?.slice(0, 100));
    }
  }

  writeProject(project);
  res.json({ ok: true, portraitId: project.portraitId, portraitDescription: project.portraitDescription || null });
});

// Delete generation
router.delete('/influencer/projects/:id/generations/:genId', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });

  const gen = project.generations.find(g => g.id === req.params.genId);
  if (gen) {
    const filePath = path.join(shared.BASE_DIR, gen.path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    project.generations = project.generations.filter(g => g.id !== req.params.genId);
    if (project.portraitId === req.params.genId) project.portraitId = null;
    writeProject(project);
  }
  res.json({ ok: true });
});

// ══════════════════════════════════════
// Galleries (named collections)
// ══════════════════════════════════════

// Auto-migrate old flat gallery[] → galleries[]
function migrateGalleries(project) {
  if (!project.galleries) project.galleries = [];
  // Migrate old flat gallery array if it exists
  if (project.gallery && project.gallery.length > 0 && project.galleries.length === 0) {
    project.galleries.push({
      id: `gal_${Date.now()}`,
      name: 'General',
      items: project.gallery,
      createdAt: new Date().toISOString(),
    });
    delete project.gallery;
  }
  return project;
}

// List galleries
router.get('/influencer/projects/:id/galleries', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  migrateGalleries(project);
  writeProject(project);
  res.json({ ok: true, galleries: project.galleries });
});

// Create gallery
router.post('/influencer/projects/:id/galleries', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  migrateGalleries(project);

  const name = (req.body.name || '').trim() || 'Untitled';
  const gallery = {
    id: `gal_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    name,
    items: [],
    createdAt: new Date().toISOString(),
  };
  project.galleries.push(gallery);
  writeProject(project);
  res.json({ ok: true, gallery });
});

// Rename gallery
router.put('/influencer/projects/:id/galleries/:galId', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  migrateGalleries(project);

  const gal = project.galleries.find(g => g.id === req.params.galId);
  if (!gal) return res.status(404).json({ ok: false, error: 'Gallery not found' });

  if (req.body.name !== undefined) gal.name = req.body.name.trim() || 'Untitled';
  writeProject(project);
  res.json({ ok: true, gallery: gal });
});

// Delete gallery
router.delete('/influencer/projects/:id/galleries/:galId', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  migrateGalleries(project);

  project.galleries = project.galleries.filter(g => g.id !== req.params.galId);
  writeProject(project);
  res.json({ ok: true });
});

// Add image to gallery
router.post('/influencer/projects/:id/galleries/:galId/items/:genId', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  migrateGalleries(project);

  const gal = project.galleries.find(g => g.id === req.params.galId);
  if (!gal) return res.status(404).json({ ok: false, error: 'Gallery not found' });

  const gen = project.generations.find(g => g.id === req.params.genId);
  if (!gen) return res.status(404).json({ ok: false, error: 'Generation not found' });

  if (gal.items.some(i => i.id === gen.id)) {
    return res.json({ ok: true, message: 'Already in gallery' });
  }

  gal.items.push({
    id: gen.id,
    filename: gen.filename,
    path: gen.path,
    method: gen.method,
    addedAt: new Date().toISOString(),
  });
  writeProject(project);
  res.json({ ok: true });
});

// Remove image from gallery
router.delete('/influencer/projects/:id/galleries/:galId/items/:genId', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ ok: false, error: 'Not found' });
  migrateGalleries(project);

  const gal = project.galleries.find(g => g.id === req.params.galId);
  if (!gal) return res.status(404).json({ ok: false, error: 'Gallery not found' });

  gal.items = gal.items.filter(i => i.id !== req.params.genId);
  writeProject(project);
  res.json({ ok: true });
});

module.exports = router;
