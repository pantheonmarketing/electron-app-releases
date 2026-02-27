/**
 * lib/skill-versions.js — Save, list, get, and revert skill file versions.
 * Stores timestamped copies in skill-versions/{skillName}/ with an index.json.
 */

const fs = require('fs');
const path = require('path');
const shared = require('./shared');

const MAX_VERSIONS = 50;

function getVersionDir(skillName) {
  const dir = path.join(shared.BASE_DIR, 'skill-versions', skillName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readIndex(skillName) {
  const indexFile = path.join(getVersionDir(skillName), 'index.json');
  if (!fs.existsSync(indexFile)) return [];
  try { return JSON.parse(fs.readFileSync(indexFile, 'utf-8')); }
  catch (_) { return []; }
}

function writeIndex(skillName, versions) {
  const indexFile = path.join(getVersionDir(skillName), 'index.json');
  fs.writeFileSync(indexFile, JSON.stringify(versions, null, 2));
}

/**
 * Save a version snapshot of a skill file.
 * @param {string} skillName
 * @param {string} content - Current file content
 * @param {string} label - e.g. "Before AI edit", "Before revert"
 * @returns {{ filename, timestamp, label }}
 */
function saveVersion(skillName, content, label) {
  const dir = getVersionDir(skillName);
  const timestamp = new Date().toISOString();
  const filename = `${timestamp.replace(/[:.]/g, '-')}.md`;
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');

  const versions = readIndex(skillName);
  versions.unshift({ filename, timestamp, label: label || 'Auto-save' });

  // Prune old versions
  if (versions.length > MAX_VERSIONS) {
    const removed = versions.splice(MAX_VERSIONS);
    for (const v of removed) {
      const f = path.join(dir, v.filename);
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
    }
  }

  writeIndex(skillName, versions);
  return { filename, timestamp, label };
}

/**
 * List all versions for a skill (newest first).
 */
function listVersions(skillName) {
  return readIndex(skillName);
}

/**
 * Get the content of a specific version.
 */
function getVersion(skillName, filename) {
  const filePath = path.join(getVersionDir(skillName), filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Revert a skill file to a previous version.
 * Saves current content as "Before revert" first.
 */
function revertToVersion(skillName, filename, skillFilePath) {
  const versionContent = getVersion(skillName, filename);
  if (versionContent === null) return false;

  // Save current file as a version before reverting
  if (fs.existsSync(skillFilePath)) {
    const currentContent = fs.readFileSync(skillFilePath, 'utf-8');
    saveVersion(skillName, currentContent, 'Before revert');
  }

  // Overwrite skill file with version content
  fs.writeFileSync(skillFilePath, versionContent, 'utf-8');
  return true;
}

module.exports = { saveVersion, listVersions, getVersion, revertToVersion };
