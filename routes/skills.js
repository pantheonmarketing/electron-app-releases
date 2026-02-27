const express = require('express');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');
const { readSkills, readProjects } = require('../lib/helpers');
const { checkAllRequirements } = require('../lib/requirement-checker');
const { saveVersion, listVersions, getVersion, revertToVersion } = require('../lib/skill-versions');
const { extractHighlights } = require('../lib/skill-parser');
const router = express.Router();

// Track active chat sessions per skill: skillName → sessionId
const skillChatSessions = new Map();

// Sanitize skill :name param — only allow safe characters (letters, digits, hyphens, underscores)
router.param('name', (req, res, next, name) => {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid skill name' });
  }
  next();
});

// Sanitize version :filename param
router.param('filename', (req, res, next, filename) => {
  if (!filename || /[/\\]/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  next();
});

const resolveSkillPath = (p) => {
  // Only allow paths that resolve to within BASE_DIR or known project directories
  const resolved = path.isAbsolute(p) ? path.resolve(p) : path.resolve(shared.BASE_DIR, p);
  // Block path traversal attempts (e.g., "../../etc/passwd")
  if (!path.isAbsolute(p) && !resolved.startsWith(path.resolve(shared.BASE_DIR))) {
    console.warn(`[Skills] Blocked path traversal attempt: ${p}`);
    return path.join(shared.BASE_DIR, path.basename(p));
  }
  return resolved;
};

router.get('/skills', (req, res) => {
  const skills = readSkills();
  const doCheck = req.query.check === 'true';
  const result = Object.entries(skills).map(([name, info]) => {
    const reqs = info.requirements || [];
    const obj = {
      name, description: info.description,
      display_name: info.display_name || null,
      icon: info.icon || null,
      category: info.category || null,
      plain_description: info.plain_description || null,
      chat_prompts: info.chat_prompts || null,
      exists: fs.existsSync(resolveSkillPath(info.file)),
      context: info.context || [], context_notes: info.context_notes || null,
      requirements: reqs,
      config: info.config || null, config_values: info.config_values || null
    };
    if (doCheck && reqs.length > 0) {
      obj.requirements_status = checkAllRequirements(reqs);
    }
    return obj;
  });
  res.json(result);
});

router.post('/skills/scan', (req, res) => {
  const skills = readSkills();
  const projects = readProjects();
  const existingFiles = new Set(Object.values(skills).map(s => s.file.replace(/\\/g, '/')));
  const existingBaseNames = new Set(Object.values(skills).map(s => path.basename(s.file)));
  const added = [];
  const scanDirs = new Set();
  for (const [, proj] of Object.entries(projects)) {
    if (!proj.working_dir || !fs.existsSync(proj.working_dir)) continue;
    const wd = proj.working_dir.replace(/\\/g, '/');
    const portableMemory = path.join(wd, '.claude-portable', 'memory');
    if (fs.existsSync(portableMemory)) scanDirs.add(portableMemory);
    if (proj.context) {
      for (const ctx of proj.context) {
        const ctxNorm = ctx.replace(/\\/g, '/');
        if (ctxNorm.includes('/memory') && fs.existsSync(ctx) && fs.statSync(ctx).isDirectory()) {
          scanDirs.add(ctx);
        }
      }
    }
  }
  const claudeProjectsDir = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'projects');
  if (fs.existsSync(claudeProjectsDir)) {
    try {
      const projDirs = fs.readdirSync(claudeProjectsDir);
      for (const pd of projDirs) {
        const memDir = path.join(claudeProjectsDir, pd, 'memory');
        if (fs.existsSync(memDir) && fs.statSync(memDir).isDirectory()) scanDirs.add(memDir);
      }
    } catch (e) {}
  }
  for (const dir of scanDirs) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('-skill.md'));
      for (const file of files) {
        const fullPath = path.join(dir, file).replace(/\\/g, '/');
        if (existingFiles.has(fullPath)) continue;
        if (existingBaseNames.has(file)) continue;
        const skillName = file.replace(/-skill\.md$/, '');
        if (skills[skillName]) continue;
        let description = 'No description';
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 1; i < Math.min(lines.length, 10); i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('#') && line !== '---') {
              description = line.length > 80 ? line.substring(0, 80) + '...' : line;
              break;
            }
          }
        } catch (e) {}
        skills[skillName] = { file: fullPath, description, context: [] };
        existingFiles.add(fullPath);
        existingBaseNames.add(file);
        added.push({ name: skillName, description, file: fullPath });
      }
    } catch (e) {}
  }
  if (added.length > 0) {
    fs.writeFileSync(shared.SKILLS_FILE, JSON.stringify(skills, null, 2));
  }
  const result = Object.entries(skills).map(([name, info]) => ({
    name, description: info.description,
    exists: fs.existsSync(info.file),
    context: info.context || [], context_notes: info.context_notes || null
  }));
  res.json({ ok: true, total: result.length, added: added.length, new_skills: added.map(a => a.name), skills: result });
});

router.get('/skills/:name/content', (req, res) => {
  const skills = readSkills();
  const skill = skills[req.params.name];
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const filePath = resolveSkillPath(skill.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Skill file not found' });
  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ ok: true, name: req.params.name, content });
});

router.put('/skills/:name/config', (req, res) => {
  const skills = readSkills();
  const skill = skills[req.params.name];
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const { config_values } = req.body;
  if (!config_values || typeof config_values !== 'object') return res.status(400).json({ error: 'config_values object required' });
  if (!skill.config_values) skill.config_values = {};
  Object.assign(skill.config_values, config_values);
  fs.writeFileSync(shared.SKILLS_FILE, JSON.stringify(skills, null, 2));
  // Also save to protected config file (survives syncs, merges, and reinstalls)
  try {
    const configs = fs.existsSync(shared.SKILL_CONFIGS_FILE)
      ? JSON.parse(fs.readFileSync(shared.SKILL_CONFIGS_FILE, 'utf-8'))
      : {};
    configs[req.params.name] = { ...skill.config_values };
    fs.writeFileSync(shared.SKILL_CONFIGS_FILE, JSON.stringify(configs, null, 2));
  } catch (_) {}
  res.json({ ok: true, name: req.params.name, config_values: skill.config_values });
});

// ── Highlights ──
router.get('/skills/:name/highlights', (req, res) => {
  const skills = readSkills();
  const skill = skills[req.params.name];
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  if (!skill.highlights || skill.highlights.length === 0) {
    return res.json({ ok: true, highlights: [] });
  }
  const filePath = resolveSkillPath(skill.file);
  if (!fs.existsSync(filePath)) return res.json({ ok: true, highlights: [] });
  const content = fs.readFileSync(filePath, 'utf-8');
  const highlights = extractHighlights(content, skill.highlights);
  res.json({ ok: true, highlights });
});

// ── Version History ──
router.get('/skills/:name/versions', (req, res) => {
  const versions = listVersions(req.params.name);
  res.json({ ok: true, versions });
});

router.get('/skills/:name/versions/:filename', (req, res) => {
  const content = getVersion(req.params.name, req.params.filename);
  if (content === null) return res.status(404).json({ error: 'Version not found' });
  res.json({ ok: true, content });
});

router.post('/skills/:name/versions/:filename/revert', (req, res) => {
  const skills = readSkills();
  const skill = skills[req.params.name];
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const filePath = resolveSkillPath(skill.file);
  const ok = revertToVersion(req.params.name, req.params.filename, filePath);
  if (!ok) return res.status(404).json({ error: 'Version not found' });
  res.json({ ok: true });
});

// ── AI Chat ──
router.post('/skills/:name/chat', (req, res) => {
  const skills = readSkills();
  const skill = skills[req.params.name];
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const filePath = resolveSkillPath(skill.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Skill file not found' });

  // Auto-snapshot before edit
  try {
    const currentContent = fs.readFileSync(filePath, 'utf-8');
    saveVersion(req.params.name, currentContent, 'Before AI edit');
  } catch (e) {}

  // Reuse or create terminal session
  let sessionId = skillChatSessions.get(req.params.name);
  let session = sessionId ? shared.terminalManager.getSession(sessionId) : null;

  if (!session || session.status === 'dead') {
    // Create new session
    const newSession = shared.terminalManager.createSession({
      name: `Skill: ${req.params.name}`,
      workingDir: path.dirname(filePath),
      model: 'sonnet',
    });
    sessionId = newSession.id;
    skillChatSessions.set(req.params.name, sessionId);

    // First message: set context
    const contextMsg = `You are editing the skill file at "${filePath}". Read the file, make the requested change, and write it back. Keep the same markdown format and structure. Here is the user's request: ${text}`;
    shared.terminalManager.sendInput(sessionId, contextMsg);
  } else {
    // Send follow-up message
    shared.terminalManager.sendInput(sessionId, text);
  }

  res.json({ ok: true, sessionId });
});

// ── Online Skills Sync ──
// Fetches latest skills.json + skill .md files from GitHub repo
const SKILLS_REPO = 'pantheonmarketing/electron-app-releases';
const SKILLS_BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${SKILLS_REPO}/${SKILLS_BRANCH}`;

async function fetchText(url) {
  // Use dynamic import for fetch (Node 18+) or fallback to https
  const https = require('https');
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AI-CEO-Studio' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

router.post('/skills/sync-online', async (req, res) => {
  try {
    // 1. Fetch the master skills.json from GitHub
    const remoteSkillsRaw = await fetchText(`${RAW_BASE}/skills.json`);
    const remoteSkills = JSON.parse(remoteSkillsRaw);

    // 2. Load local skills.json + protected configs
    const localSkills = readSkills();
    const savedConfigs = fs.existsSync(shared.SKILL_CONFIGS_FILE)
      ? JSON.parse(fs.readFileSync(shared.SKILL_CONFIGS_FILE, 'utf-8'))
      : {};
    let updated = 0;
    const updatedNames = [];

    // 3. Ensure local skills/ directory exists
    const localSkillsDir = path.join(shared.BASE_DIR, 'skills');
    if (!fs.existsSync(localSkillsDir)) fs.mkdirSync(localSkillsDir, { recursive: true });

    // 4. For each remote skill, update registry + download .md file
    for (const [name, remoteInfo] of Object.entries(remoteSkills)) {
      const remoteFile = remoteInfo.file; // e.g. "skills/jonny-writer-skill.md"
      const localFile = path.join(shared.BASE_DIR, remoteFile);

      // Preserve local config_values before overwriting with remote metadata
      const existingConfigValues = localSkills[name]?.config_values || savedConfigs[name] || null;
      const isNew = !localSkills[name];
      localSkills[name] = {
        ...remoteInfo,
        file: remoteFile, // keep relative path
      };
      // Restore config_values — never lose user's API keys
      if (existingConfigValues) localSkills[name].config_values = existingConfigValues;

      // Download the .md file if it doesn't exist locally or if we want to keep it fresh
      // Strategy: always re-download to keep skills up to date
      try {
        const mdContent = await fetchText(`${RAW_BASE}/${remoteFile}`);
        // Only write if content actually changed
        let localContent = '';
        if (fs.existsSync(localFile)) {
          localContent = fs.readFileSync(localFile, 'utf-8');
        }
        if (mdContent !== localContent) {
          fs.mkdirSync(path.dirname(localFile), { recursive: true });
          fs.writeFileSync(localFile, mdContent);
          updated++;
          updatedNames.push(name);
          console.log(`[Skills Sync] ${isNew ? 'New' : 'Updated'}: ${name}`);
        }
      } catch (dlErr) {
        console.log(`[Skills Sync] Could not download ${remoteFile}: ${dlErr.message}`);
      }
    }

    // 5. Save updated skills.json
    fs.writeFileSync(shared.SKILLS_FILE, JSON.stringify(localSkills, null, 2));

    res.json({
      ok: true,
      total: Object.keys(localSkills).length,
      updated,
      updatedNames,
    });
  } catch (err) {
    console.error('[Skills Sync] Failed:', err.message);
    res.json({ ok: false, error: err.message, updated: 0 });
  }
});

module.exports = router;
